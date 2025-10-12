// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 SecureLBP.sol (Integrated with LBPWeightedAMM Pool + Auction Init + Auto-Finalize Callback)

Policy: commit-reveal LBP with adaptive fees, oracle-driven pauses,
vesting registration, caps, penalty for unrevealed commits,
pull-based payments, SafeERC20, events, chunked finalize.
Intended for integration in STTP pipeline (DutchAuction -> LBP -> Vesting).

Supports dynamic pool init from auction proceeds: initPoolFromAuction(eth, tokens) deploys/adds to LBPWeightedAMM.
- During reveal: Quotes tokens from pool using net ETH (after fee).
- During finalize: Transfers total ETH to pool, executes swap, distributes tokens to vesting, auto-calls back to PresaleManager.finalizePresale.
*/

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./WeightedAMM.sol"; // Import for dynamic deployment

interface IVesting {
    function registerAllocations(address[] calldata beneficiaries, uint256[] calldata amounts) external;
}

interface ILBPOracle {
    function isPaused() external view returns (bool);
    function viewAdaptiveFee() external view returns (uint256);
}

// Interface for PresaleManager callback (moved from here to avoid duplicate; import from DutchAuction if needed)
import "./interfaces/IPresaleManager.sol";

contract SecureLBP is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ IMMUTABLE/CONFIG ============
    IERC20 public immutable token;           // sale token
    uint256 public immutable startTime;      // start of commit phase
    uint256 public immutable commitEnd;      // end of commit phase (start of reveal)
    uint256 public immutable revealEnd;      // end of reveal phase (end of LBP)
    address public treasury;                 // destination for collected funds after finalize (pull)

    // Pool params (for dynamic creation)
    uint256 public immutable poolStartWeightToken;
    uint256 public immutable poolEndWeightToken;
    uint256 public immutable poolSwapFee;    // e.g., 0.003e18

    // basis points: 10000 == 100%
    uint256 public initialFeeBP = 1000; // 10% -> fallback linear schedule
    uint256 public finalFeeBP   = 100;  // 1%  -> fallback linear schedule
    uint256 public collectedETH;        // total ETH collected (including unrevealed commits)
    uint256 public constant BP_SCALE = 10000;

    uint256 public maxContributionPerAddress = 5 ether; // per-address cap (can be changed by onlyOwner)

    // Oracle that drives adaptive fees and pause signals. Optional.
    ILBPOracle public oracle;

    // Dynamic pool (created in initPoolFromAuction)
    LBPWeightedAMM public pool; // Use full type for new
    bool public poolInitialized; // Flag to prevent re-init

    address public presaleManager; // Callback to PresaleManager for auto-finalize

    // ============ DATA STRUCTURES ============
    struct Commit {
        bytes32 hash;       // commit hash (key)
        uint256 amountETH;  // accumulated ETH for this commit
        uint256 timestamp;  // when first created
        bool processed;     // marked as processed (revealed or penalized)
    }

    mapping(address => mapping(bytes32 => Commit)) private _commits;
    mapping(address => uint256) public totalCommittedBy;     // total ETH committed by user (for caps)

    mapping(address => uint256) public allocations;          // tokens user will get after reveal (in token units)
    mapping(address => uint256) public pendingRefunds;       // ETH scheduled for withdrawal (e.g., after penalty)

    // events
    event Committed(address indexed user, bytes32 indexed commitHash, uint256 amountETH);
    event Revealed(address indexed user, bytes32 indexed commitHash, uint256 amountETH, uint256 tokensBought, uint256 feeBP);
    event Penalized(address indexed user, bytes32 indexed commitHash, uint256 penaltyAmount, uint256 refundAmount);
    event PoolInitialized(address poolAddr);
    event OracleFeeUpdated(uint256 newFeeBP);
    event OraclePaused(uint256 untilTimestamp);
    event FinalizedToVesting(address vestingContract, uint256 totalTokens);
    event WithdrawnETH(address to, uint256 amount);
    event RefundWithdrawn(address user, uint256 amount);
    event TreasurySet(address treasury);
    event OracleSet(address oracleAddr);

    // ============ CONSTRUCTOR ============
    constructor(
        address _token,
        uint256 _startTime,
        uint256 _commitEnd,
        uint256 _revealEnd,
        address _treasury,
        uint256 _poolStartWeightToken, // 0.7e18
        uint256 _poolEndWeightToken,   // 0.3e18
        uint256 _poolSwapFee,           // 0.003e18
        address _presaleManager // New: for auto callback
    ) {
        require(_token != address(0), "zero token");
        require(_startTime < _commitEnd && _commitEnd < _revealEnd, "invalid times");
        require(_treasury != address(0), "zero treasury");

        token = IERC20(_token);
        startTime = _startTime;
        commitEnd = _commitEnd;
        revealEnd = _revealEnd;
        treasury = _treasury;
        poolStartWeightToken = _poolStartWeightToken;
        poolEndWeightToken = _poolEndWeightToken;
        poolSwapFee = _poolSwapFee;
        transferOwnership(msg.sender);
        presaleManager = _presaleManager;
    }

    // ============ MODIFIERS ============
    modifier checkOracle() {
        if (address(oracle) != address(0)) {
            require(!oracle.isPaused(), "paused by oracle");
        }
        _;
    }

    // ============ AUCTION INIT FROM DUTCH ============
    /// @notice Init pool after Dutch Auction: create new LBPWeightedAMM, addLiquidity with provided ETH/tokens.
    /// Call from main contract after Dutch ends (onlyOwner). ETH from msg.value, tokens from contract balance (pre-minted).
    function initPoolFromAuction(uint256 tokenAmount) external payable onlyOwner {
        require(!poolInitialized, "pool already init");
        require(msg.value > 0 && tokenAmount > 0, "zero amounts");

        // Deploy new LBPWeightedAMM pool with params
        LBPWeightedAMM newPool = new LBPWeightedAMM(
            address(token),
            poolStartWeightToken,
            poolEndWeightToken,
            startTime,
            revealEnd, // endTime = revealEnd for LBP duration
            poolSwapFee
        );

        // Approve and add liquidity
        token.safeApprove(address(newPool), tokenAmount);
        newPool.addLiquidity{value: msg.value}(tokenAmount);

        pool = newPool;
        poolInitialized = true;

        emit PoolInitialized(address(newPool));
    }

    // ============ CORE: COMMIT / REVEAL ============
    function commitBid(bytes32 commitHash) external payable whenNotPaused checkOracle nonReentrant {
        require(block.timestamp >= startTime && block.timestamp <= commitEnd, "not in commit window");
        require(msg.value > 0, "zero bid");
        require(totalCommittedBy[msg.sender] + msg.value <= maxContributionPerAddress, "exceeds per-address cap");

        Commit storage c = _commits[msg.sender][commitHash];
        if (c.amountETH == 0) {
            c.hash = commitHash;
            c.timestamp = block.timestamp;
            c.processed = false;
        }

        c.amountETH += msg.value;
        totalCommittedBy[msg.sender] += msg.value;
        collectedETH += msg.value;

        emit Committed(msg.sender, commitHash, msg.value);
    }

    function revealBid(uint256 amountETH, uint256 nonce) external whenNotPaused checkOracle nonReentrant {
        require(block.timestamp > commitEnd && block.timestamp <= revealEnd, "not in reveal window");
        require(poolInitialized, "pool not init");
        bytes32 expected = keccak256(abi.encodePacked(msg.sender, amountETH, nonce, address(this)));
        Commit storage c = _commits[msg.sender][expected];
        require(!c.processed, "already processed");
        require(c.amountETH == amountETH && amountETH > 0, "amount mismatch or zero");

        uint256 feeBP = _currentFeeBP();
        uint256 fee = (amountETH * feeBP) / BP_SCALE;
        uint256 net = amountETH - fee;

        // Quote from pool
        uint256 tokensBought = pool.quoteETHForToken(net);

        allocations[msg.sender] += tokensBought;

        c.processed = true;

        emit Revealed(msg.sender, expected, amountETH, tokensBought, feeBP);
    }

    // ============ PENALTY for non-revealed ============
    function penalizeNonRevealed(address user, bytes32 commitHash, uint256 penaltyBP) external onlyOwner nonReentrant {
        require(block.timestamp > revealEnd, "reveal not ended");
        Commit storage c = _commits[user][commitHash];
        require(!c.processed && c.amountETH > 0, "nothing to penalize");

        uint256 amount = c.amountETH;
        uint256 penalty = (amount * penaltyBP) / BP_SCALE;
        uint256 refund = amount - penalty;

        c.amountETH = 0;
        c.processed = true;
        totalCommittedBy[user] -= amount;
        collectedETH -= amount;

        pendingRefunds[user] += refund;

        emit Penalized(user, commitHash, penalty, refund);
    }

    function withdrawRefund() external nonReentrant {
        uint256 amt = pendingRefunds[msg.sender];
        require(amt > 0, "no refund");
        pendingRefunds[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amt}("");
        require(ok, "refund transfer failed");
        emit RefundWithdrawn(msg.sender, amt);
    }

    // ============ FEE LOGIC (adaptive + fallback) ============
    function _currentFeeBP() internal view returns (uint256) {
        if (address(oracle) != address(0)) {
            try oracle.viewAdaptiveFee() returns (uint256 oracleFeeBP) {
                if (oracleFeeBP > BP_SCALE) return BP_SCALE;
                return oracleFeeBP;
            } catch {}
        }

        if (block.timestamp <= startTime) return initialFeeBP;
        if (block.timestamp >= revealEnd) return finalFeeBP;
        uint256 elapsed = block.timestamp - startTime;
        uint256 duration = revealEnd - startTime;
        if (initialFeeBP <= finalFeeBP) return finalFeeBP;
        uint256 drop = initialFeeBP - finalFeeBP;
        return initialFeeBP - (drop * elapsed) / duration;
    }

    // ============ ORACLE / PAUSE INTEGRATION ============
    function setOracle(address _oracle) external onlyOwner {
        oracle = ILBPOracle(_oracle);
        emit OracleSet(_oracle);
    }

    function ownerPause() external onlyOwner {
        _pause();
        emit OraclePaused(block.timestamp);
    }

    function ownerUnpause() external onlyOwner {
        _unpause();
    }

    // ============ FINALIZE / VESTING ============
    function finalizeToVesting(address vestingContract, address[] calldata beneficiaries) external onlyOwner nonReentrant {
        require(block.timestamp > revealEnd, "not ended");
        require(vestingContract != address(0), "zero vesting");
        require(poolInitialized, "pool not init");

        uint256 len = beneficiaries.length;
        require(len > 0, "no beneficiaries");

        uint256 totalTokens = 0;
        uint256[] memory amounts = new uint256[](len);
        for (uint256 i = 0; i < len; ++i) {
            address b = beneficiaries[i];
            uint256 amt = allocations[b];
            amounts[i] = amt;
            totalTokens += amt;
            allocations[b] = 0;
        }

        uint256 totalETH = collectedETH;
        collectedETH = 0;

        // Calculate minOut for slippage protection (1% tolerance)
        uint256 minOut = totalTokens * 99 / 100; // 1% slippage max

        if (totalETH > 0) {
            pool.swapETHForToken{value: totalETH}(minOut);
        }
//        pool.swapETHForToken{value: totalETH}(minOut);
         token.safeTransfer(vestingContract, totalTokens);

        IVesting(vestingContract).registerAllocations(beneficiaries, amounts);

        emit FinalizedToVesting(vestingContract, totalTokens);

        // Auto-callback to PresaleManager for finalizePresale (if set)
        if (presaleManager != address(0) && address(presaleManager).code.length > 0) {
            IPresaleManager(presaleManager).finalizePresale(beneficiaries, amounts);
        }


    }

    // ============ WITHDRAWALS / TREASURY ============
    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero addr");
        require(amount <= address(this).balance, "insufficient balance");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
        emit WithdrawnETH(to, amount);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    // ============ ADMIN / CONFIG ============
    function setMaxContributionPerAddress(uint256 _cap) external onlyOwner {
        maxContributionPerAddress = _cap;
    }

    function rescueERC20(address erc20, address to, uint256 amount) external onlyOwner {
        require(erc20 != address(token), "cannot rescue sale token");
        SafeERC20.safeTransfer(IERC20(erc20), to, amount);
    }

    // ============ GETTERS ============
    function getCommit(address user, bytes32 commitHash) external view returns (Commit memory) {
        return _commits[user][commitHash];
    }

    function currentFeeBP() external view returns (uint256) {
        return _currentFeeBP();
    }

    receive() external payable {}
    fallback() external payable {}
}