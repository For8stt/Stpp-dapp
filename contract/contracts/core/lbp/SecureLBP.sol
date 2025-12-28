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
import "./events/SecureLBPEvents.sol";
import "./errors/SecureLBPErrors.sol";
import "../../libraries/VestingMath.sol";

interface ILBPOracle {
    function isPaused(address lbpPool) external view returns (bool);
    function viewAdaptiveFee(address lbpPool) external view returns (uint256);
    function computeAdaptiveFee(address lbpPool) external returns (uint256);
    function pausedUntilForPool(address lbpPool) external view returns (uint256);
}

// Interface for PresaleManager callback (moved from here to avoid duplicate; import from DutchAuction if needed)
import "../../interfaces/IPresaleManager.sol";

interface IUniswapV3Factory {
    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external returns (address pool);
    
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
    
    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );
    
    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SecureLBP is ReentrancyGuard, Pausable, Ownable, SecureLBPEvents, SecureLBPErrors {
    using SafeERC20 for IERC20;

    // ============ FEE PRESET ENUMS ============
    /// @notice Initial fee percentage presets. Only these values are allowed to ensure auditability and prevent arbitrary fee configurations.
    enum InitialFeePreset {
        FIVE_PERCENT,   // 5% = 500 BP
        TEN_PERCENT,    // 10% = 1000 BP
        FIFTEEN_PERCENT // 15% = 1500 BP
    }

    /// @notice Fee decay duration presets in minutes. Only these values are allowed to ensure predictable fee decay behavior.
    enum FeeDecayDurationPreset {
        TEN_MINUTES,      // 10 minutes = 600 seconds
        FIFTEEN_MINUTES,  // 15 minutes = 900 seconds
        THIRTY_MINUTES    // 30 minutes = 1800 seconds
    }

    // ============ IMMUTABLE/CONFIG ============
    IERC20 public immutable token;           // sale token
    uint256 public immutable startTime;      // start of trading window
    uint256 public immutable endTime;        // end of the LBP trading window
    address public treasury;                 // destination for collected funds after finalize (pull)
    
    // Uniswap V3 configuration (optional, can be set post-deployment)
    IUniswapV3Factory public uniswapFactory;
    INonfungiblePositionManager public uniswapPositionManager;
    IWETH9 public weth;
    uint24 public defaultFeeTier;            // e.g., 3000 for 0.3%

    // Pool params (for dynamic creation)
    uint256 public immutable poolStartWeightToken;
    uint256 public immutable poolEndWeightToken;
    uint256 public immutable poolSwapFee;    // e.g., 0.003e18

    // basis points: 10000 == 100%
    uint256 public initialFeeBP;        // Set via configureFee() using preset enum
    uint256 public finalFeeBP = 100;    // 1% final fee (constant, not configurable via preset)
    uint256 public feeDecayDuration;    // Duration in seconds for fee decay window (set via configureFee())
    uint256 public totalEthRaised;      // aggregate ETH supplied by bidders (gross, before fees)
    uint256 public feesAccumulated;     // total manager/oracle fees retained
    uint256 public constant BP_SCALE = 10000;
    uint256 public totalTokensAllocated;
    bool public feeConfigured;          // Guard to prevent re-configuration

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

    struct VolatilityCheckpoint {
        uint256 lastPrice;      // Last LBP spot price (ETH per token, 1e18 scale)
        uint256 lastTimestamp;  // Timestamp of last checkpoint update
    }
    
    VolatilityCheckpoint public volatilityCheckpoint;
    
    // Volatility fee configuration
    uint256 public volatilityWindow = 60;           // Time window in seconds (e.g., 1 minute)
    uint256 public volatilityThresholdLowBP = 500;  // 5% price change threshold (basis points)
    uint256 public volatilityThresholdHighBP = 1000; // 10% price change threshold (basis points)
    uint256 public volatilityFeeMediumBP = 300;     // Medium volatility fee (3%)
    uint256 public volatilityFeeHighBP = 500;       // High volatility fee (5%)
    uint256 public maxVolatilityFeeBP = 1000;       // Maximum volatility fee cap (10%)

    // Post-oracle pause fee decay configuration
    // This mechanism applies HIGH fees immediately after oracle pause expires to prevent speculative bursts
    // Fees decay in step-based fashion over a fixed time period (time-based only, NOT price-based)
    uint256 public postPauseDecayWindow = 300;      // Total decay window: 5 minutes (300 seconds)
    uint256 public postPauseFeeStep1 = 1000;       // Step 1: 0-1 minute → 10% fee
    uint256 public postPauseFeeStep1Duration = 60;  // Step 1 duration: 1 minute
    uint256 public postPauseFeeStep2 = 500;         // Step 2: 1-3 minutes → 5% fee
    uint256 public postPauseFeeStep2Duration = 120; // Step 2 duration: 2 minutes (1-3 minutes total)
    uint256 public postPauseFeeStep3 = 300;         // Step 3: 3-5 minutes → 3% fee

    uint256 public lastUnpauseTime; // Timestamp when trading resumed after oracle pause (0 if never paused or currently paused)
    uint256 public lastPausedUntil; // Last known pausedUntil timestamp (for detecting pause expiration when pausedUntil is cleared)

    mapping(address => uint256) public totalContributed;     // total ETH provided by user (for caps)
    mapping(address => uint256) public allocations;          // tokens user purchased (in token units)

    uint256 public uniswapPositionTokenId;                   // NFT token ID of Uniswap V3 position
    bool public uniswapLiquidityCreated;                     // Flag to prevent double migration

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
        if (_token == address(0)) revert ZeroToken();
        if (_startTime >= _endTime) revert InvalidTimes();
        if (_treasury == address(0)) revert ZeroTreasury();

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


    modifier checkOracle() {
        bool wasPaused = false;
        uint256 pausedUntil = 0;
        if (address(oracle) != address(0) && address(pool) != address(0)) {
            try oracle.pausedUntilForPool(address(pool)) returns (uint256 pausedUntil_) {
                pausedUntil = pausedUntil_;
                if (pausedUntil_ > 0) {
                    lastPausedUntil = pausedUntil_;
                }
            } catch {}

            try oracle.isPaused(address(pool)) returns (bool currentlyPaused) {
                wasPaused = currentlyPaused;
            } catch {}

            try oracle.computeAdaptiveFee(address(pool)) {} catch {
                // Oracle failure must not revert the bid
            }

            try oracle.isPaused(address(pool)) returns (bool paused) {
                if (paused) {
                    lastUnpauseTime = 0;
                    revert OraclePausedError();
                } else {
                    if (wasPaused && !paused) {
                        lastUnpauseTime = block.timestamp;
                        emit PostPauseDecayStarted(block.timestamp, postPauseFeeStep1);
                    } else if (lastUnpauseTime == 0) {
                        uint256 pauseEndTime = pausedUntil > 0 ? pausedUntil : lastPausedUntil;
                        
                        if (pauseEndTime > 0) {
                            if (block.timestamp >= pauseEndTime && block.timestamp < pauseEndTime + postPauseDecayWindow) {
                                lastUnpauseTime = block.timestamp;
                                emit PostPauseDecayStarted(block.timestamp, postPauseFeeStep1);
                            }
                        }
                    }
                }
            } catch {
                // Oracle failure: fail-open, allow bid to proceed
            }
        }
        _;
    }

    /// @notice Configures the presale manager and originating auction metadata (one-time operation).
    function configurePresaleContext(address presaleManager_, address auction_) external onlyOwner {
        if (!(address(presaleManager) == address(0) && auction == address(0))) revert ContextAlreadySet();
        if (presaleManager_ == address(0) || auction_ == address(0)) revert ZeroContext();
        presaleManager = IPresaleManager(presaleManager_);
        auction = auction_;
    }

    // ============ AUCTION INIT FROM DUTCH ============
    /// @notice Init pool after Dutch Auction: create new LBPWeightedAMM, addLiquidity with provided ETH/tokens.
    /// Call from main contract after Dutch ends (onlyOwner). ETH from msg.value, tokens from contract balance (pre-minted).
    function initPoolFromAuction(uint256 tokenAmount) external payable onlyOwner {
        if (poolInitialized) revert PoolAlreadyInitialized();
        if (msg.value == 0 || tokenAmount == 0) revert ZeroAmounts();

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
        if (!poolInitialized) revert PoolNotInitialized();
        if (block.timestamp < startTime || block.timestamp > endTime) revert OutsideBidWindow();
        if (msg.value == 0) revert ZeroBid();

        _updateVolatilityCheckpoint();

        uint256 newContribution = totalContributed[msg.sender] + msg.value;
        if (newContribution > maxContributionPerAddress) revert ContributionCapExceeded();

        uint256 feeBP = _currentFeeBP();
        uint256 fee = (msg.value * feeBP) / BP_SCALE;
        uint256 netValue = msg.value - fee;
        if (netValue == 0) revert NetValueZero();

        totalContributed[msg.sender] = newContribution;
        totalEthRaised += msg.value;
        feesAccumulated += fee;

        uint256 tokensBought = pool.swapETHForTokenTo{value: netValue}(address(this), minTokensOut);
        if (tokensBought == 0) revert ZeroTokensBought();

        allocations[msg.sender] += tokensBought;
        totalTokensAllocated += tokensBought;

        emit BidPlaced(msg.sender, msg.value, netValue, feeBP, tokensBought);
    }

    // ============ FEE PRESET MAPPING ============
    /// @notice Maps InitialFeePreset enum to basis points. Only these preset values are allowed.
    function _mapInitialFeePresetToBP(InitialFeePreset preset) internal pure returns (uint256) {
        if (preset == InitialFeePreset.FIVE_PERCENT) return 500;      // 5%
        if (preset == InitialFeePreset.TEN_PERCENT) return 1000;      // 10%
        if (preset == InitialFeePreset.FIFTEEN_PERCENT) return 1500;  // 15%
        revert InvalidInitialFeePreset();
    }

    /// @notice Maps FeeDecayDurationPreset enum to seconds. Only these preset values are allowed.
    function _mapFeeDecayDurationPresetToSeconds(FeeDecayDurationPreset preset) internal pure returns (uint256) {
        if (preset == FeeDecayDurationPreset.TEN_MINUTES) return 600;       // 10 minutes
        if (preset == FeeDecayDurationPreset.FIFTEEN_MINUTES) return 900;   // 15 minutes
        if (preset == FeeDecayDurationPreset.THIRTY_MINUTES) return 1800;   // 30 minutes
        revert InvalidFeeDecayDurationPreset();
    }

    // ============ FEE CONFIGURATION ============
    /// @notice Configures the launch fee using preset enums. Can only be called once by owner.
    /// @param initialFeePreset The initial fee percentage preset (5%, 10%, or 15%)
    /// @param decayDurationPreset The fee decay duration preset (15, 20, or 30 minutes)
    function configureFee(
        InitialFeePreset initialFeePreset,
        FeeDecayDurationPreset decayDurationPreset
    ) external onlyOwner {
        if (feeConfigured) revert FeeAlreadyConfigured();
        
        initialFeeBP = _mapInitialFeePresetToBP(initialFeePreset);
        feeDecayDuration = _mapFeeDecayDurationPresetToSeconds(decayDurationPreset);
        feeConfigured = true;
    }

    /// @notice Returns the current fee in basis points.
    function _currentFeeBP() internal view returns (uint256) {
        if (address(oracle) != address(0) && address(pool) != address(0)) {
            try oracle.isPaused(address(pool)) returns (bool paused) {
                if (paused) {
                    // Oracle has paused trading - use oracle fee (maxFeeBP)
                    try oracle.viewAdaptiveFee(address(pool)) returns (uint256 oracleFeeBP) {
                        if (oracleFeeBP > BP_SCALE) return BP_SCALE;
                        return oracleFeeBP;
                    } catch {}
                }
            } catch {}
        }

        if (!feeConfigured) revert FeeNotConfigured();

        uint256 baseFeeBP;
        
        // Before start time: return initial fee
        if (block.timestamp <= startTime) {
            baseFeeBP = initialFeeBP;
        } else {
            uint256 decayWindowEnd = startTime + feeDecayDuration;

            if (block.timestamp >= decayWindowEnd) {
                baseFeeBP = finalFeeBP;
            } else {
                uint256 elapsed = block.timestamp - startTime;
                if (initialFeeBP <= finalFeeBP) {
                    baseFeeBP = finalFeeBP;
                } else {
                    uint256 drop = initialFeeBP - finalFeeBP;
                    baseFeeBP = initialFeeBP - (drop * elapsed) / feeDecayDuration;
                }
            }
        }
        uint256 volatilityFeeBP = _computeVolatilityFee();

        uint256 postPauseDecayFeeBP = _computePostPauseDecayFee();

        uint256 maxFee = baseFeeBP;
        if (volatilityFeeBP > maxFee) maxFee = volatilityFeeBP;
        if (postPauseDecayFeeBP > maxFee) maxFee = postPauseDecayFeeBP;
        return maxFee;
    }
    
    /// @notice Computes volatility-based adaptive fee based on short-term price changes
    function _computeVolatilityFee() internal view returns (uint256) {
        if (!poolInitialized || address(pool) == address(0)) {
            return 0;
        }

        if (volatilityCheckpoint.lastTimestamp == 0) {
            return 0;
        }

        uint256 currentPrice = _getLbpSpotPrice();
        if (currentPrice == 0) {
            return 0; // Cannot compute if price is invalid
        }

        uint256 lastPrice = volatilityCheckpoint.lastPrice;
        if (lastPrice == 0) {
            return 0; // Invalid checkpoint
        }

        uint256 priceChangeBP;
        if (currentPrice > lastPrice) {
            priceChangeBP = ((currentPrice - lastPrice) * BP_SCALE) / lastPrice;
        } else {
            // Price decreased or stayed same - no volatility fee (volatility subsided)
            return 0;
        }

        if (priceChangeBP >= volatilityThresholdHighBP) {
            return volatilityFeeHighBP > maxVolatilityFeeBP ? maxVolatilityFeeBP : volatilityFeeHighBP;
        } else if (priceChangeBP >= volatilityThresholdLowBP) {
            // Medium volatility: 5-10% price change since checkpoint
            return volatilityFeeMediumBP > maxVolatilityFeeBP ? maxVolatilityFeeBP : volatilityFeeMediumBP;
        } else {
            return 0; // Base fee applies
        }
    }
    function _updateVolatilityCheckpoint() internal {
        if (!poolInitialized || address(pool) == address(0)) {
            return;
        }
        uint256 currentPrice = _getLbpSpotPrice();
        if (currentPrice == 0) {
            return; // Cannot update if price is invalid
        }
        if (volatilityCheckpoint.lastTimestamp == 0 ||
            (block.timestamp - volatilityCheckpoint.lastTimestamp) >= volatilityWindow) {
            volatilityCheckpoint.lastPrice = currentPrice;
            volatilityCheckpoint.lastTimestamp = block.timestamp;
        }
    }
    function _computePostPauseDecayFee() internal view returns (uint256) {
        if (lastUnpauseTime == 0) {
            return 0;
        }
        uint256 elapsedTime = block.timestamp - lastUnpauseTime;
        if (elapsedTime >= postPauseDecayWindow) {
            return 0;
        }
        if (elapsedTime < postPauseFeeStep1Duration) {
            return postPauseFeeStep1;
        }
        uint256 step2End = postPauseFeeStep1Duration + postPauseFeeStep2Duration;
        if (elapsedTime < step2End) {
            return postPauseFeeStep2;
        }
        if (elapsedTime < postPauseDecayWindow) {
            return postPauseFeeStep3;
        }
        return 0;
    }
    
    /// @notice Gets current LBP spot price (ETH per token, 1e18 scale)
    /// @dev Uses quoteETHForToken(1e18) for accuracy, falls back to reserve-based calculation
    /// @return Spot price in 1e18 scale (ETH per token)
    function _getLbpSpotPrice() internal view returns (uint256) {
        if (address(pool) == address(0)) {
            return 0;
        }
        try pool.quoteETHForToken(1e18) returns (uint256 tokensOut) {
            if (tokensOut > 0) {
                return (1e18 * 1e18) / tokensOut;
            }
        } catch {
        }
        try pool.reserveETH() returns (uint256 reserveETH) {
            try pool.reserveToken() returns (uint256 reserveToken) {
                try pool.currentWeights() returns (uint256 weightToken, uint256 weightETH) {
                    if (reserveToken == 0 || reserveETH == 0 || weightETH == 0) {
                        return 0; // Pool not initialized or empty
                    }
                    uint256 priceNumerator = (reserveETH * weightToken);
                    uint256 priceDenominator = (reserveToken * weightETH);
                    return (priceNumerator * 1e18) / priceDenominator;
                } catch {
                    return 0;
                }
            } catch {
                return 0;
            }
        } catch {
            return 0;
        }
    }

    /// @notice Sets volatility window duration (time between checkpoint updates)
    function setVolatilityWindow(uint256 _windowSeconds) external onlyOwner {
        require(_windowSeconds > 0, "Window must be > 0");
        volatilityWindow = _windowSeconds;
    }
    function setVolatilityFeeParams(
        uint256 _thresholdLowBP,
        uint256 _thresholdHighBP,
        uint256 _feeMediumBP,
        uint256 _feeHighBP,
        uint256 _maxFeeBP
    ) external onlyOwner {
        require(_thresholdLowBP < _thresholdHighBP, "Low threshold must be < high");
        require(_feeMediumBP <= _maxFeeBP, "Medium fee must be <= max");
        require(_feeHighBP <= _maxFeeBP, "High fee must be <= max");
        require(_maxFeeBP <= BP_SCALE, "Max fee must be <= 100%");
        
        volatilityThresholdLowBP = _thresholdLowBP;
        volatilityThresholdHighBP = _thresholdHighBP;
        volatilityFeeMediumBP = _feeMediumBP;
        volatilityFeeHighBP = _feeHighBP;
        maxVolatilityFeeBP = _maxFeeBP;
    }
    function setPostPauseDecayWindow(
        uint256 _decayWindow,
        uint256 _step1Duration,
        uint256 _step2Duration
    ) external onlyOwner {
        require(_decayWindow > 0, "Decay window must be > 0");
        require(_step1Duration > 0, "Step 1 duration must be > 0");
        require(_step2Duration > 0, "Step 2 duration must be > 0");
        require(_step1Duration + _step2Duration < _decayWindow, "Steps must fit in window");
        
        postPauseDecayWindow = _decayWindow;
        postPauseFeeStep1Duration = _step1Duration;
        postPauseFeeStep2Duration = _step2Duration;
    }
    function setPostPauseDecayFees(
        uint256 _step1Fee,
        uint256 _step2Fee,
        uint256 _step3Fee
    ) external onlyOwner {
        require(_step1Fee <= BP_SCALE, "Step 1 fee must be <= 100%");
        require(_step2Fee <= BP_SCALE, "Step 2 fee must be <= 100%");
        require(_step3Fee <= BP_SCALE, "Step 3 fee must be <= 100%");
        require(_step1Fee >= _step2Fee && _step2Fee >= _step3Fee, "Fees must decrease");
        
        postPauseFeeStep1 = _step1Fee;
        postPauseFeeStep2 = _step2Fee;
        postPauseFeeStep3 = _step3Fee;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = ILBPOracle(_oracle);
        emit OracleSet(_oracle);
    }

    function oraclePause() external {
        if (address(oracle) == address(0)) revert OracleNotSet();
        if (msg.sender != address(oracle)) revert NotOracle();
        _pause();
        emit OraclePaused(block.timestamp);
    }

    function oracleUnpause() external {
        if (address(oracle) == address(0)) revert OracleNotSet();
        if (msg.sender != address(oracle)) revert NotOracle();
        _unpause();
        emit OracleResumed();
    }

    function configureVesting(
        uint256 start,
        uint256 cliffDuration,
        uint256 finalDuration,
        uint256 cliffPercentBP
    ) external onlyOwner {
        if (vestingConfigured) revert VestingConfigured();
        if (cliffPercentBP > BP_SCALE) revert CliffPercentTooHigh();
        if (finalDuration < cliffDuration) revert InvalidVestingDurations();

        vestingStart = start;
        vestingCliffDuration = cliffDuration;
        vestingFinalDuration = finalDuration;
        vestingCliffPercentBP = cliffPercentBP;
        vestingConfigured = true;
    }

    // ============ FINALIZE / VESTING ============
    function finalizeToVesting(address vestingEscrow_) external onlyOwner nonReentrant {
        if (block.timestamp <= endTime) revert NotEnded();
        if (!poolInitialized) revert PoolNotInitialized();
        if (finalized) revert AlreadyFinalized();
        if (vestingEscrow_ == address(0)) revert EscrowZero();

        // Calculate total available tokens: balance in contract + tokens in pool
        uint256 contractBalance = token.balanceOf(address(this));
        uint256 poolReserveToken = pool.reserveToken();
        uint256 totalAvailableTokens = contractBalance + poolReserveToken;

        if (totalAvailableTokens < totalTokensAllocated) {
            revert InsufficientTokens();
        }

        if (contractBalance < totalTokensAllocated && poolReserveToken > 0) {
            uint256 lpBalance = pool.balanceLP(address(this));
            if (lpBalance > 0) {
                pool.removeLiquidity(lpBalance);
                contractBalance = token.balanceOf(address(this));
            }
        }

        if (contractBalance < totalTokensAllocated) {
            revert InsufficientTokens();
        }

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
        if (!finalized) revert NotFinalized();
        if (!poolInitialized) revert PoolNotInitialized();
        if (block.timestamp <= endTime) revert AuctionActive();

        uint256 lpBalance = pool.balanceLP(address(this));
        if (lpBalance == 0) revert NoLPTokens();

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;

        pool.removeLiquidity(lpBalance);

        uint256 tokensRemoved = token.balanceOf(address(this)) - tokenBefore;
        uint256 ethRemoved = address(this).balance - ethBefore;

        emit FullUnwindExecuted(ethRemoved, tokensRemoved);
    }

    function unwindPartial(uint256 percentBP) external onlyOwner {
        if (!finalized) revert NotFinalized();
        if (!poolInitialized) revert PoolNotInitialized();
        if (block.timestamp <= endTime) revert AuctionActive();
        if (percentBP == 0 || percentBP > BP_SCALE) revert PercentInvalid();

        uint256 lpBalance = pool.balanceLP(address(this));
        if (lpBalance == 0) revert NoLPTokens();

        uint256 lpToBurn = (lpBalance * percentBP) / BP_SCALE;
        if (lpToBurn == 0) revert NothingToUnwind();

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;

        pool.removeLiquidity(lpToBurn);

        uint256 tokensRemoved = token.balanceOf(address(this)) - tokenBefore;
        uint256 ethRemoved = address(this).balance - ethBefore;

        emit PartialUnwindExecuted(percentBP, ethRemoved, tokensRemoved);
    }

    function rebalanceTo5050() external payable onlyOwner {
        if (!finalized) revert NotFinalized();
        if (!poolInitialized) revert PoolNotInitialized();
        if (block.timestamp <= endTime) revert AuctionActive();

        uint256 reserveEth = pool.reserveETH();
        uint256 reserveToken = pool.reserveToken();
        if (reserveEth == 0 || reserveToken == 0) revert EmptyPool();

        (uint256 weightToken, uint256 weightEth) = pool.currentWeights();
        if (weightToken == 0 || weightEth == 0) revert WeightZero();

        uint256 pricePerToken = Math.mulDiv(reserveEth, weightToken, reserveToken);
        pricePerToken = Math.mulDiv(pricePerToken, 1e18, weightEth);
        if (pricePerToken == 0) revert PriceZero();

        uint256 tokenValue = Math.mulDiv(reserveToken, pricePerToken, 1e18);
        uint256 ethValue = reserveEth;

        if (tokenValue > ethValue) {
            uint256 ethNeeded = tokenValue - ethValue;
            if (ethNeeded == 0) revert Balanced();
            if (msg.value < ethNeeded) revert InsufficientEth();

            pool.addLiquiditySingleETH{value: ethNeeded}();

            if (msg.value > ethNeeded) {
                (bool refundOk, ) = msg.sender.call{value: msg.value - ethNeeded}("");
                if (!refundOk) revert RefundFailed();
            }

            emit PoolRebalancedTo5050(ethNeeded, 0);
        } else if (ethValue > tokenValue) {
            uint256 diff = ethValue - tokenValue;
            uint256 tokensNeeded = Math.mulDiv(diff, 1e18, pricePerToken);
            if (tokensNeeded == 0) revert Balanced();
            if (msg.value != 0) revert EthNotNeeded();

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
            revert Balanced();
        }
    }

    // ============ WITHDRAWALS / TREASURY ============
    /// @notice Owner option #3: pull pure ETH proceeds once trading + vesting allocations are sealed.
    function withdrawETH(uint256 amount) external onlyOwner {
        if (!finalized) revert NotFinalized();
        if (block.timestamp <= endTime) revert AuctionActive();
        if (treasury == address(0)) revert TreasuryZero();
        if (amount > address(this).balance) revert InsufficientBalance();
        (bool ok,) = payable(treasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit WithdrawnETH(treasury, amount);
    }

    /// @notice Owner option #1/#2 helper: withdraw all unsold tokens that currently sit on SecureLBP.
    function withdrawAllTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) revert NoTokensAvailable();
        _withdrawTokens(balance);
    }

    /// @notice Owner option #2 helper: withdraw a specific token amount (post-unwind remainders).
    function withdrawTokens(uint256 amount) external onlyOwner {
        if (amount == 0) revert AmountZero();
        _withdrawTokens(amount);
    }

    function _withdrawTokens(uint256 amount) internal {
        if (!finalized) revert NotFinalized();
        if (treasury == address(0)) revert TreasuryZero();
        uint256 balance = token.balanceOf(address(this));
        if (amount > balance) revert InsufficientTokens();
        token.safeTransfer(treasury, amount);
        emit TokensWithdrawn(treasury, amount);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (block.timestamp >= startTime) revert TradingStarted();
        if (_treasury == address(0)) revert ZeroTreasury();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /// @notice Configures Uniswap V3 addresses for liquidity migration (can be set post-deployment)
    /// @param _factory Uniswap V3 Factory address
    /// @param _positionManager Uniswap V3 NonfungiblePositionManager address
    /// @param _weth WETH9 address
    /// @param _defaultFeeTier Default fee tier (e.g., 3000 for 0.3%)
    function setUniswapV3Config(
        address _factory,
        address _positionManager,
        address _weth,
        uint24 _defaultFeeTier
    ) external onlyOwner {
        if (_factory == address(0) || _positionManager == address(0) || _weth == address(0)) {
            revert InvalidUniswapParams();
        }
        uniswapFactory = IUniswapV3Factory(_factory);
        uniswapPositionManager = INonfungiblePositionManager(_positionManager);
        weth = IWETH9(_weth);
        defaultFeeTier = _defaultFeeTier;
        emit UniswapV3ConfigSet(_factory, _positionManager, _weth, _defaultFeeTier);
    }

    // ============ ADMIN / CONFIG ============
    function setMaxContributionPerAddress(uint256 _cap) external onlyOwner {
        maxContributionPerAddress = _cap;
    }

    function rescueERC20(address erc20, address to, uint256 amount) external onlyOwner {
        if (erc20 == address(token)) revert RescueSaleToken();
        SafeERC20.safeTransfer(IERC20(erc20), to, amount);
    }

    // ============ GETTERS ============
    function currentFeeBP() external view returns (uint256) {
        return _currentFeeBP();
    }
    function volatilityFeeBP() external view returns (uint256) {
        return _computeVolatilityFee();
    }
    function postPauseDecayFeeBP() external view returns (uint256) {
        return _computePostPauseDecayFee();
    }
    function baseFeeBP() external view returns (uint256) {
        if (!feeConfigured) return 0;
        
        if (block.timestamp <= startTime) {
            return initialFeeBP;
        }
        
        uint256 decayWindowEnd = startTime + feeDecayDuration;
        if (block.timestamp >= decayWindowEnd) {
            return finalFeeBP;
        }
        
        uint256 elapsed = block.timestamp - startTime;
        if (initialFeeBP <= finalFeeBP) return finalFeeBP;
        uint256 drop = initialFeeBP - finalFeeBP;
        return initialFeeBP - (drop * elapsed) / feeDecayDuration;
    }
    function getVolatilityCheckpoint() external view returns (uint256 lastPrice, uint256 lastTimestamp) {
        return (volatilityCheckpoint.lastPrice, volatilityCheckpoint.lastTimestamp);
    }
    function getCurrentPriceChangeBP() external view returns (uint256 priceChangeBP) {
        if (volatilityCheckpoint.lastTimestamp == 0 || volatilityCheckpoint.lastPrice == 0) {
            return 0;
        }
        
        uint256 currentPrice = _getLbpSpotPrice();
        if (currentPrice == 0 || currentPrice <= volatilityCheckpoint.lastPrice) {
            return 0;
        }
        
        return ((currentPrice - volatilityCheckpoint.lastPrice) * BP_SCALE) / volatilityCheckpoint.lastPrice;
    }

    receive() external payable {}
    fallback() external payable {}

    function getUserAllocation(address user) external view returns (uint256) {
        return allocations[user];
    }

    /// @notice Returns Uniswap V3 position information
    /// @return positionTokenId The NFT token ID of the Uniswap V3 position
    /// @return liquidityCreated Whether liquidity migration has been completed
    function getUniswapV3Position() external view returns (uint256 positionTokenId, bool liquidityCreated) {
        return (uniswapPositionTokenId, uniswapLiquidityCreated);
    }

    // ============ UNISWAP V3 MIGRATION ============
    /// @notice Migrates liquidity from SecureLBP to Uniswap V3 after LBP finalization
    /// @dev This function creates a Uniswap V3 pool (if needed) and mints an LP position NFT
    /// @param ethAmount Amount of ETH to use for Uniswap V3 liquidity (will be wrapped to WETH)
    /// @param tokenAmount Amount of tokens to use for Uniswap V3 liquidity
    /// @param feeTier Uniswap V3 fee tier (e.g., 3000 for 0.3%, 500 for 0.05%, 10000 for 1%)
    /// @param sqrtPriceX96 Initial sqrt price for the pool (Q64.96 format)
    /// @param tickLower Lower tick boundary for the position
    /// @param tickUpper Upper tick boundary for the position
    /// @param lpRecipient Address to receive the Uniswap V3 LP NFT (typically treasury or multisig)
    function migrateLiquidityToUniswapV3(
        uint256 ethAmount,
        uint256 tokenAmount,
        uint24 feeTier,
        uint160 sqrtPriceX96,
        int24 tickLower,
        int24 tickUpper,
        address lpRecipient
    ) external onlyOwner nonReentrant {
        if (!finalized) revert NotFinalized();
        if (block.timestamp <= endTime) revert AuctionActive();
        if (uniswapLiquidityCreated) revert UniswapLiquidityAlreadyCreated();

        if (address(uniswapFactory) == address(0) || 
            address(uniswapPositionManager) == address(0) || 
            address(weth) == address(0)) {
            revert UniswapV3NotConfigured();
        }

        if (lpRecipient == address(0)) revert ZeroTreasury();

        if (ethAmount == 0 || tokenAmount == 0) revert ZeroAmounts();
        if (ethAmount > address(this).balance) revert InsufficientEthForMigration();

        uint256 currentTokenBalance = token.balanceOf(address(this));

        if (tokenAmount > currentTokenBalance) revert InsufficientTokensForMigration();

        if (tickLower >= tickUpper) revert InvalidUniswapParams();
        
        //Wrap ETH to WETH
        weth.deposit{value: ethAmount}();

        address token0;
        address token1;
        uint256 amount0Desired;
        uint256 amount1Desired;
        
        if (address(token) < address(weth)) {
            token0 = address(token);
            token1 = address(weth);
            amount0Desired = tokenAmount;
            amount1Desired = ethAmount;
        } else {
            token0 = address(weth);
            token1 = address(token);
            amount0Desired = ethAmount;
            amount1Desired = tokenAmount;
        }

        token.safeApprove(address(uniswapPositionManager), 0);
        token.safeApprove(address(uniswapPositionManager), tokenAmount);
        
        weth.approve(address(uniswapPositionManager), 0);
        weth.approve(address(uniswapPositionManager), ethAmount);

        address pool = uniswapFactory.getPool(token0, token1, feeTier);
        
        if (pool == address(0)) {
            try uniswapPositionManager.createAndInitializePoolIfNecessary(
                token0,
                token1,
                feeTier,
                sqrtPriceX96
            ) returns (address newPool) {
                pool = newPool;
                if (pool == address(0)) revert UniswapPoolCreationFailed();
            } catch {
                revert UniswapPoolCreationFailed();
            }
        }

        INonfungiblePositionManager.MintParams memory mintParams = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: feeTier,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0, // Allow slippage - owner controls this
            amount1Min: 0, // Allow slippage - owner controls this
            recipient: lpRecipient,
            deadline: block.timestamp + 300
        });
        
        uint256 tokenId;
        try uniswapPositionManager.mint(mintParams) returns (
            uint256 _tokenId,
            uint128,
            uint256,
            uint256
        ) {
            tokenId = _tokenId;
        } catch {
            token.safeApprove(address(uniswapPositionManager), 0);
            weth.approve(address(uniswapPositionManager), 0);
            revert UniswapMintFailed();
        }

        uniswapPositionTokenId = tokenId;
        uniswapLiquidityCreated = true;

        token.safeApprove(address(uniswapPositionManager), 0);
        weth.approve(address(uniswapPositionManager), 0);

        emit LiquidityMigratedToUniswapV3(ethAmount, tokenAmount, feeTier, tokenId);
    }

    // ============ VESTING CLAIMS ============
    function vestedAmount(address user) public view returns (uint256) {
        uint256 allocation = allocations[user];
        return
            VestingMath.lbpVestedAmount(
                finalized,
                allocation,
                vestingConfigured,
                vestingStart,
                vestingCliffDuration,
                vestingFinalDuration,
                vestingCliffPercentBP,
                BP_SCALE
            );
    }
}
