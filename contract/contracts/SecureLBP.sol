// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 SecureLBP.sol (Oracle-integrated)

Policy: commit-reveal LBP with adaptive fees, oracle-driven pauses,
vesting registration, caps, penalty for unrevealed commits,
pull-based payments, SafeERC20, events, chunked finalize.
Intended for integration in STPP pipeline (DutchAuction -> LBP -> Vesting).

 Commit-reveal LBP with adaptive fees and oracle-driven pauses.
 - Integrates with an external Oracle via ILBPOracle interface.
 - If oracle is set, commit/reveal check oracle.isPaused() and
   use oracle.viewAdaptiveFee() for adaptive fees.
*/

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IVesting {
    /// @notice Vesting contract must allow registration of an array of beneficiaries and allocations
    function registerAllocations(address[] calldata beneficiaries, uint256[] calldata amounts) external;
}

/// Minimal interface that SecureLBP expects from the Oracle
interface ILBPOracle {
    /// @notice Returns whether oracle has signaled pause (true => paused)
    function isPaused() external view returns (bool);

    /// @notice Returns adaptive fee in BP (10000 == 100%). Must be view.
    function viewAdaptiveFee() external view returns (uint256);
}

contract SecureLBP is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ IMMUTABLE/CONFIG ============
    IERC20 public immutable token;           // sale token
    uint256 public immutable startTime;      // start of commit phase
    uint256 public immutable commitEnd;      // end of commit phase (start of reveal)
    uint256 public immutable revealEnd;      // end of reveal phase (end of LBP)
    address public treasury;                 // destination for collected funds after finalize (pull)

    // basis points: 10000 == 100%
    uint256 public initialFeeBP = 1000; // 10% -> fallback linear schedule
    uint256 public finalFeeBP   = 100;  // 1%  -> fallback linear schedule
    uint256 public collectedETH;        // total ETH collected (including unrevealed commits)
    uint256 public constant BP_SCALE = 10000;

    uint256 public maxContributionPerAddress = 5 ether; // per-address cap (can be changed by onlyOwner)

    // Oracle that drives adaptive fees and pause signals. Optional.
    ILBPOracle public oracle;

    // ============ DATA STRUCTURES ============
    struct Commit {
        bytes32 hash;       // commit hash (key)
        uint256 amountETH;  // accumulated ETH for this commit
        uint256 timestamp;  // when first created
        bool processed;     // marked as processed (revealed or penalized)
    }

    // A user may have multiple different commits (different nonces) -> mapping(address => mapping(commitHash => Commit))
    mapping(address => mapping(bytes32 => Commit)) private _commits;
    mapping(address => uint256) public totalCommittedBy;     // total ETH committed by user (for caps)

    mapping(address => uint256) public allocations;          // tokens user will get after reveal (in token units)
    mapping(address => uint256) public pendingRefunds;       // ETH scheduled for withdrawal (e.g., after penalty)

    // events
    event Committed(address indexed user, bytes32 indexed commitHash, uint256 amountETH);
    event Revealed(address indexed user, bytes32 indexed commitHash, uint256 amountETH, uint256 tokensBought, uint256 feeBP);
    event Penalized(address indexed user, bytes32 indexed commitHash, uint256 penaltyAmount, uint256 refundAmount);
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
        address _treasury
    ) {
        require(_token != address(0), "zero token");
        require(_startTime < _commitEnd && _commitEnd < _revealEnd, "invalid times");
        require(_treasury != address(0), "zero treasury");

        token = IERC20(_token);
        startTime = _startTime;
        commitEnd = _commitEnd;
        revealEnd = _revealEnd;
        treasury = _treasury;
        transferOwnership(msg.sender);
    }

    // ============ MODIFIERS ============
    /// Check oracle pause state before executing (if oracle is set).
    modifier checkOracle() {
        if (address(oracle) != address(0)) {
            require(!oracle.isPaused(), "paused by oracle");
        }
        _;
    }

    // ============ CORE: COMMIT / REVEAL ============

    /// @notice Commit: adds a hash and ETH. User may create multiple different commitHashes
    /// Recommended hash format: keccak256(abi.encodePacked(msg.sender, amountETH, nonce, address(this)))
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

    /// @notice Reveal: user reveals their commit (must be called during reveal window)
    /// @param amountETH - the ETH amount that was hashed
    /// @param nonce - secret nonce
    /// Hash should be: keccak256(abi.encodePacked(msg.sender, amountETH, nonce, address(this)))
    function revealBid(uint256 amountETH, uint256 nonce) external whenNotPaused checkOracle nonReentrant {
        require(block.timestamp > commitEnd && block.timestamp <= revealEnd, "not in reveal window");
        bytes32 expected = keccak256(abi.encodePacked(msg.sender, amountETH, nonce, address(this)));
        Commit storage c = _commits[msg.sender][expected];
        require(!c.processed, "already processed");
        require(c.amountETH == amountETH && amountETH > 0, "amount mismatch or zero");

        // fee in BP at current moment: prefer oracle-driven adaptive fee if oracle is set
        uint256 feeBP = _currentFeeBP();

        // calculate fee
        uint256 fee = (amountETH * feeBP) / BP_SCALE;
        uint256 net = amountETH - fee;

        // --- PRICE MODEL ---
        // PLACEHOLDER: here you should call real LBP price math or oracle/pool logic
        // For demo: 1 ETH = 100 tokens (as before). In production: use Uniswap/Pool pricing math.
        uint256 tokensBought = net * 100;

        // book allocation
        allocations[msg.sender] += tokensBought;

        // accounting
        c.processed = true;
        // fee remains in contract; owner/treasury withdraws after finalize via withdraw
        // collectedETH already includes amountETH

        emit Revealed(msg.sender, expected, amountETH, tokensBought, feeBP);
    }

    // ============ PENALTY for non-revealed ============

    /// @notice After revealEnd, owner may penalize unrevealed commits: keep penaltyBP% and refund the rest
    /// penaltyBP is in BP scale (e.g. 1000 == 10%)
    function penalizeNonRevealed(address user, bytes32 commitHash, uint256 penaltyBP) external onlyOwner nonReentrant {
        require(block.timestamp > revealEnd, "reveal not ended");
        Commit storage c = _commits[user][commitHash];
        require(!c.processed && c.amountETH > 0, "nothing to penalize");

        uint256 amount = c.amountETH;
        uint256 penalty = (amount * penaltyBP) / BP_SCALE;
        uint256 refund = amount - penalty;

        // accounting
        c.amountETH = 0;
        c.processed = true;
        totalCommittedBy[user] -= amount;
        collectedETH -= amount;

        // keep penalty in contract balance (to be withdrawn to treasury later)
        // schedule refund as pull
        pendingRefunds[user] += refund;

        emit Penalized(user, commitHash, penalty, refund);
    }

    /// @notice User withdraws their pending refunds (pull pattern)
    function withdrawRefund() external nonReentrant {
        uint256 amt = pendingRefunds[msg.sender];
        require(amt > 0, "no refund");
        pendingRefunds[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amt}("");
        require(ok, "refund transfer failed");
        emit RefundWithdrawn(msg.sender, amt);
    }

    // ============ FEE LOGIC (adaptive + fallback) ============
    /// @notice Return current fee BP. If oracle set, prefer oracle.viewAdaptiveFee() (view).
    function _currentFeeBP() internal view returns (uint256) {
        if (address(oracle) != address(0)) {
            // oracle should implement viewAdaptiveFee() as view
            try oracle.viewAdaptiveFee() returns (uint256 oracleFeeBP) {
                // sanity bound: fee must be <= BP_SCALE
                if (oracleFeeBP > BP_SCALE) {
                    return BP_SCALE;
                }
                return oracleFeeBP;
            } catch {
                // if oracle call reverts for some reason, fallback to local schedule
            }
        }

        // fallback: linear schedule between initialFeeBP and finalFeeBP over reveal period
        if (block.timestamp <= startTime) {
            return initialFeeBP;
        }
        if (block.timestamp >= revealEnd) {
            return finalFeeBP;
        }
        uint256 elapsed = block.timestamp - startTime;
        uint256 duration = revealEnd - startTime;
        if (initialFeeBP <= finalFeeBP) {
            return finalFeeBP;
        }
        uint256 drop = initialFeeBP - finalFeeBP;
        return initialFeeBP - (drop * elapsed) / duration;
    }

    // ============ ORACLE / PAUSE INTEGRATION ============
    /// @notice Set oracle contract (onlyOwner)
    function setOracle(address _oracle) external onlyOwner {
        oracle = ILBPOracle(_oracle);
        emit OracleSet(_oracle);
    }

    /// @notice Owner can still manually pause if necessary
    function ownerPause() external onlyOwner {
        _pause();
        emit OraclePaused(block.timestamp);
    }

    function ownerUnpause() external onlyOwner {
        _unpause();
    }

    // ============ FINALIZE / VESTING ============
    /// @notice Transfer tokens to vesting contract and register all allocations (array of beneficiaries).
    /// To avoid OOG, finalizeToVesting must be called in chunks (e.g., 100–200 beneficiaries per call)
    function finalizeToVesting(address vestingContract, address[] calldata beneficiaries) external onlyOwner nonReentrant {
        require(block.timestamp > revealEnd, "not ended");
        require(vestingContract != address(0), "zero vesting");

        uint256 len = beneficiaries.length;
        require(len > 0, "no beneficiaries");

        // gather amounts and total
        uint256 totalTokens = 0;
        uint256[] memory amounts = new uint256[](len);
        for (uint256 i = 0; i < len; ++i) {
            address b = beneficiaries[i];
            uint256 amt = allocations[b];
            amounts[i] = amt;
            totalTokens += amt;
            allocations[b] = 0; // clear to prevent duplication
        }

        // transfer tokens to vesting contract
        token.safeTransfer(vestingContract, totalTokens);

        // register allocations in vesting contract
        IVesting(vestingContract).registerAllocations(beneficiaries, amounts);

        emit FinalizedToVesting(vestingContract, totalTokens);
    }

    // ============ WITHDRAWALS / TREASURY ============
    /// @notice Owner can withdraw ETH (fees + revealed amounts) to treasury or given address.
    /// It is recommended to do this ONLY after finalize.
    function withdrawETH(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "zero addr");
        require(amount <= address(this).balance, "insufficient balance");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
        emit WithdrawnETH(to, amount);
    }

    /// @notice Set treasury address
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    // ============ ADMIN / CONFIG ============
    function setMaxContributionPerAddress(uint256 _cap) external onlyOwner {
        maxContributionPerAddress = _cap;
    }

    // emergency token rescue (only owner) - for accidentally sent tokens (not the sale token)
    function rescueERC20(address erc20, address to, uint256 amount) external onlyOwner {
        require(erc20 != address(token), "cannot rescue sale token");
        SafeERC20.safeTransfer(IERC20(erc20), to, amount);
    }

    // ============ GETTERS (view helpers) ============
    function getCommit(address user, bytes32 commitHash) external view returns (Commit memory) {
        return _commits[user][commitHash];
    }
    function currentFeeBP() external view returns (uint256) {
        return _currentFeeBP();
    }

    // fallback to accept ETH (commits should use commitBid)
    receive() external payable {}
    fallback() external payable {}
}