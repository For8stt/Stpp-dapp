// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 SecureLBP.sol (Integrated with LBPWeightedAMM Pool + Direct-Bid Flow + Auto-Finalize Callback)

Policy: real-time bidding LBP with adaptive fees, oracle-driven pauses,
per-address caps, pull-based claims, SafeERC20 events, chunked finalize.
Intended for integration in STPP pipeline (DutchAuction -> LBP).

Supports dynamic pool init from auction proceeds: initPoolFromAuction(eth, tokens)
deploys/adds to LBPWeightedAMM.
- During trading: placeBid() pushes ETH through the pool using current weights,
  enforcing user-defined slippage tolerance and adaptive fees.
- During finalize: Locks allocations, notifies the PresaleManager, and allows
  distributed claiming via claim / claimFor.
*/

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./WeightedAMM.sol"; // Import for dynamic deployment

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
    uint256 public immutable startTime;      // start of trading window
    uint256 public immutable endTime;        // end of the LBP trading window
    address public treasury;                 // destination for collected funds after finalize (pull)

    // Pool params (for dynamic creation)
    uint256 public immutable poolStartWeightToken;
    uint256 public immutable poolEndWeightToken;
    uint256 public immutable poolSwapFee;    // e.g., 0.003e18

    // basis points: 10000 == 100%
    uint256 public initialFeeBP = 1000; // 10% -> fallback linear schedule
    uint256 public finalFeeBP   = 100;  // 1%  -> fallback linear schedule
    uint256 public totalEthRaised;      // aggregate ETH supplied by bidders (gross, before fees)
    uint256 public feesAccumulated;     // total manager/oracle fees retained
    uint256 public constant BP_SCALE = 10000;
    uint256 public totalTokensAllocated;

    uint256 public maxContributionPerAddress = 5 ether; // per-address cap (can be changed by onlyOwner)

    // Oracle that drives adaptive fees and pause signals. Optional.
    ILBPOracle public oracle;

    // Dynamic pool (created in initPoolFromAuction)
    LBPWeightedAMM public pool; // Use full type for new
    bool public poolInitialized; // Flag to prevent re-init

    IPresaleManager public presaleManager; // Callback manager
    address public auction; // Originating Dutch auction
    bool public finalized; // Guard to prevent double finalization
    address public vestingEscrow; // Escrow contract holding purchased tokens post-finalize
    uint256 public vestingStart;
    uint256 public vestingCliffDuration;
    uint256 public vestingFinalDuration;
    uint256 public vestingCliffPercentBP;
    bool public vestingConfigured;

    // ============ DATA STRUCTURES ============
    mapping(address => uint256) public totalContributed;     // total ETH provided by user (for caps)
    mapping(address => uint256) public allocations;          // tokens user purchased (in token units)

    // events
    event BidPlaced(address indexed user, uint256 ethIn, uint256 netEth, uint256 feeBP, uint256 tokensBought);
    event PoolInitialized(address poolAddr);
    event OracleFeeUpdated(uint256 newFeeBP);
    event OraclePaused(uint256 untilTimestamp);
    event OracleResumed();
    event FinalizedToVesting(address vestingContract, uint256 totalTokens);
    event WithdrawnETH(address to, uint256 amount);
    event TreasurySet(address treasury);
    event OracleSet(address oracleAddr);
    event PoolFinalized(uint256 totalTokens, uint256 totalETH);
    event FullUnwindExecuted(uint256 ethRemoved, uint256 tokensRemoved);
    event PartialUnwindExecuted(uint256 percentBP, uint256 ethRemoved, uint256 tokensRemoved);
    event PoolRebalancedTo5050(uint256 ethAdded, uint256 tokensAdded);
    event TokensWithdrawn(address to, uint256 amount);

    // ============ CONSTRUCTOR ============
    constructor(
        address _token,
        uint256 _startTime,
        uint256 _endTime,
        address _treasury,
        uint256 _poolStartWeightToken, // 0.7e18
        uint256 _poolEndWeightToken,   // 0.3e18
        uint256 _poolSwapFee,           // 0.003e18
        address _presaleManager,
        address _auction
    ) {
        require(_token != address(0), "zero token");
        require(_startTime < _endTime, "invalid times");
        require(_treasury != address(0), "zero treasury");

        token = IERC20(_token);
        startTime = _startTime;
        endTime = _endTime;
        treasury = _treasury;
        poolStartWeightToken = _poolStartWeightToken;
        poolEndWeightToken = _poolEndWeightToken;
        poolSwapFee = _poolSwapFee;
        if (_presaleManager != address(0) && _auction != address(0)) {
            presaleManager = IPresaleManager(_presaleManager);
            auction = _auction;
        }
        transferOwnership(msg.sender);
    }

    // ============ MODIFIERS ============
    modifier checkOracle() {
        if (address(oracle) != address(0)) {
            require(!oracle.isPaused(), "paused by oracle");
        }
        _;
    }

    /// @notice Configures the presale manager and originating auction metadata (one-time operation).
    function configurePresaleContext(address presaleManager_, address auction_) external onlyOwner {
        require(address(presaleManager) == address(0) && auction == address(0), "context already set");
        require(presaleManager_ != address(0) && auction_ != address(0), "zero context");
        presaleManager = IPresaleManager(presaleManager_);
        auction = auction_;
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
            endTime,
            poolSwapFee
        );

        // Approve and add liquidity
        token.safeApprove(address(newPool), 0);
        token.safeApprove(address(newPool), tokenAmount);
        newPool.addLiquidity{value: msg.value}(tokenAmount);

        pool = newPool;
        poolInitialized = true;

        emit PoolInitialized(address(newPool));
    }

    // ============ DIRECT BIDDING ============
    /// @notice Execute a real-time bid by swapping ETH for tokens with slippage protection.
    /// @param minTokensOut Minimum acceptable tokens based on caller's tolerance.
    function placeBid(uint256 minTokensOut) external payable whenNotPaused checkOracle nonReentrant {
        require(poolInitialized, "pool not init");
        require(block.timestamp >= startTime && block.timestamp <= endTime, "outside bid window");
        require(msg.value > 0, "zero bid");

        uint256 newContribution = totalContributed[msg.sender] + msg.value;
        require(newContribution <= maxContributionPerAddress, "exceeds per-address cap");

        uint256 feeBP = _currentFeeBP();
        uint256 fee = (msg.value * feeBP) / BP_SCALE;
        uint256 netValue = msg.value - fee;
        require(netValue > 0, "net zero");

        totalContributed[msg.sender] = newContribution;
        totalEthRaised += msg.value;
        feesAccumulated += fee;

        uint256 tokensBought = pool.swapETHForTokenTo{value: netValue}(address(this), minTokensOut);
        require(tokensBought > 0, "zero tokens");

        allocations[msg.sender] += tokensBought;
        totalTokensAllocated += tokensBought;

        emit BidPlaced(msg.sender, msg.value, netValue, feeBP, tokensBought);
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
        if (block.timestamp >= endTime) return finalFeeBP;
        uint256 elapsed = block.timestamp - startTime;
        uint256 duration = endTime - startTime;
        if (initialFeeBP <= finalFeeBP) return finalFeeBP;
        uint256 drop = initialFeeBP - finalFeeBP;
        return initialFeeBP - (drop * elapsed) / duration;
    }

    // ============ ORACLE / PAUSE INTEGRATION ============
    function setOracle(address _oracle) external onlyOwner {
        oracle = ILBPOracle(_oracle);
        emit OracleSet(_oracle);
    }

    function oraclePause() external {
        require(address(oracle) != address(0), "oracle not set");
        require(msg.sender == address(oracle), "not oracle");
        _pause();
        emit OraclePaused(block.timestamp);
    }

    function oracleUnpause() external {
        require(address(oracle) != address(0), "oracle not set");
        require(msg.sender == address(oracle), "not oracle");
        _unpause();
        emit OracleResumed();
    }

    function configureVesting(
        uint256 start,
        uint256 cliffDuration,
        uint256 finalDuration,
        uint256 cliffPercentBP
    ) external onlyOwner {
        require(!vestingConfigured, "vesting configured");
        require(cliffPercentBP <= BP_SCALE, "cliff pct");
        require(finalDuration >= cliffDuration, "invalid durations");

        vestingStart = start;
        vestingCliffDuration = cliffDuration;
        vestingFinalDuration = finalDuration;
        vestingCliffPercentBP = cliffPercentBP;
        vestingConfigured = true;
    }

    // ============ FINALIZE / VESTING ============
    function finalizeToVesting(address vestingEscrow_) external onlyOwner nonReentrant {
        require(block.timestamp > endTime, "not ended");
        require(poolInitialized, "pool not init");
        require(!finalized, "already finalized");
        require(vestingEscrow_ != address(0), "escrow zero");

        uint256 availableTokens = token.balanceOf(address(this));
        require(availableTokens >= totalTokensAllocated, "insufficient tokens");

        finalized = true;

        vestingEscrow = vestingEscrow_;

        token.safeTransfer(vestingEscrow_, totalTokensAllocated);

        emit FinalizedToVesting(vestingEscrow_, totalTokensAllocated);

        if (address(presaleManager) != address(0) && auction != address(0)) {
            presaleManager.finalizePresale(auction, totalEthRaised, totalTokensAllocated);
        }

        emit PoolFinalized(totalTokensAllocated, totalEthRaised);
    }

    // ============ POST-SALE CLEANUP ============
    function unwindAllLiquidity() external onlyOwner {
        require(finalized, "not finalized");
        require(poolInitialized, "pool not init");
        require(block.timestamp > endTime, "auction active");

        uint256 lpBalance = pool.balanceLP(address(this));
        require(lpBalance > 0, "no lp tokens");

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;

        pool.removeLiquidity(lpBalance);

        uint256 tokensRemoved = token.balanceOf(address(this)) - tokenBefore;
        uint256 ethRemoved = address(this).balance - ethBefore;

        emit FullUnwindExecuted(ethRemoved, tokensRemoved);
    }

    function unwindPartial(uint256 percentBP) external onlyOwner {
        require(finalized, "not finalized");
        require(poolInitialized, "pool not init");
        require(block.timestamp > endTime, "auction active");
        require(percentBP > 0 && percentBP <= BP_SCALE, "percent invalid");

        uint256 lpBalance = pool.balanceLP(address(this));
        require(lpBalance > 0, "no lp tokens");

        uint256 lpToBurn = (lpBalance * percentBP) / BP_SCALE;
        require(lpToBurn > 0, "nothing to unwind");

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;

        pool.removeLiquidity(lpToBurn);

        uint256 tokensRemoved = token.balanceOf(address(this)) - tokenBefore;
        uint256 ethRemoved = address(this).balance - ethBefore;

        emit PartialUnwindExecuted(percentBP, ethRemoved, tokensRemoved);
    }

    function rebalanceTo5050() external payable onlyOwner {
        require(finalized, "not finalized");
        require(poolInitialized, "pool not init");
        require(block.timestamp > endTime, "auction active");

        uint256 reserveEth = pool.reserveETH();
        uint256 reserveToken = pool.reserveToken();
        require(reserveEth > 0 && reserveToken > 0, "empty pool");

        (uint256 weightToken, uint256 weightEth) = pool.currentWeights();
        require(weightToken > 0 && weightEth > 0, "weights zero");

        uint256 pricePerToken = Math.mulDiv(reserveEth, weightToken, reserveToken);
        pricePerToken = Math.mulDiv(pricePerToken, 1e18, weightEth);
        require(pricePerToken > 0, "price zero");

        uint256 tokenValue = Math.mulDiv(reserveToken, pricePerToken, 1e18);
        uint256 ethValue = reserveEth;

        if (tokenValue > ethValue) {
            uint256 ethNeeded = tokenValue - ethValue;
            require(ethNeeded > 0, "balanced");
            require(msg.value >= ethNeeded, "insufficient eth");

            pool.addLiquiditySingleETH{value: ethNeeded}();

            if (msg.value > ethNeeded) {
                (bool refundOk, ) = msg.sender.call{value: msg.value - ethNeeded}("");
                require(refundOk, "refund failed");
            }

            emit PoolRebalancedTo5050(ethNeeded, 0);
        } else if (ethValue > tokenValue) {
            uint256 diff = ethValue - tokenValue;
            uint256 tokensNeeded = Math.mulDiv(diff, 1e18, pricePerToken);
            require(tokensNeeded > 0, "balanced");
            require(msg.value == 0, "eth not needed");

            uint256 currentBalance = token.balanceOf(address(this));
            if (currentBalance < tokensNeeded) {
                uint256 shortfall = tokensNeeded - currentBalance;
                token.safeTransferFrom(msg.sender, address(this), shortfall);
            }

            token.safeApprove(address(pool), 0);
            token.safeApprove(address(pool), tokensNeeded);
            pool.addLiquiditySingleToken(tokensNeeded);
            token.safeApprove(address(pool), 0);

            emit PoolRebalancedTo5050(0, tokensNeeded);
        } else {
            revert("already balanced");
        }
    }

    // ============ WITHDRAWALS / TREASURY ============
    /// @notice Owner option #3: pull pure ETH proceeds once trading + vesting allocations are sealed.
    function withdrawETH(uint256 amount) external onlyOwner {
        require(finalized, "LBP not finalized");
        require(block.timestamp > endTime, "auction active");
        require(treasury != address(0), "treasury zero");
        require(amount <= address(this).balance, "insufficient balance");
        (bool ok,) = payable(treasury).call{value: amount}("");
        require(ok, "withdraw failed");
        emit WithdrawnETH(treasury, amount);
    }

    /// @notice Owner option #1/#2 helper: withdraw all unsold tokens that currently sit on SecureLBP.
    function withdrawAllTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "no tokens");
        _withdrawTokens(balance);
    }

    /// @notice Owner option #2 helper: withdraw a specific token amount (post-unwind remainders).
    function withdrawTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "amount zero");
        _withdrawTokens(amount);
    }

    function _withdrawTokens(uint256 amount) internal {
        require(finalized, "LBP not finalized");
        require(treasury != address(0), "treasury zero");
        uint256 balance = token.balanceOf(address(this));
        require(amount <= balance, "insufficient tokens");
        token.safeTransfer(treasury, amount);
        emit TokensWithdrawn(treasury, amount);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(block.timestamp < startTime, "cannot change treasury after start");
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
    function currentFeeBP() external view returns (uint256) {
        return _currentFeeBP();
    }

    receive() external payable {}
    fallback() external payable {}

    function getUserAllocation(address user) external view returns (uint256) {
        return allocations[user];
    }

    // ============ VESTING CLAIMS ============
    function vestedAmount(address user) public view returns (uint256) {
        if (!finalized) return 0;
        uint256 allocation = allocations[user];
        if (allocation == 0) return 0;
        if (!vestingConfigured) {
            return allocation;
        }
        uint256 cliffTime = vestingStart + vestingCliffDuration;
        uint256 finalTime = vestingStart + vestingFinalDuration;

        if (block.timestamp < cliffTime) {
            return 0;
        }

        if (vestingFinalDuration == 0 || block.timestamp >= finalTime) {
            return allocation;
        }

        return (allocation * vestingCliffPercentBP) / BP_SCALE;
    }
}
