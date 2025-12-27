// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./events/LBPOracleEvents.sol";

interface IChainlinkPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

interface ILBPPool {
    function reserveETH() external view returns (uint256);
    function reserveToken() external view returns (uint256);
    function currentWeights() external view returns (uint256 weightToken, uint256 weightETH);
    function quoteETHForToken(uint256 ethIn) external view returns (uint256 tokenOut);
}

/**
 * @title LBPOracle - Delta-Divergence Oracle
 * @notice Circuit breaker oracle for buy-only LBP presales.
 * 
 * Design:
 * - PRIMARY: Tracks delta-price (change in LBP spot price) - detects whale buys
 * - SECONDARY: Tracks delta-divergence from external reference (if available)
 * - Triggers on rapid price changes, not absolute divergence
 * - Designed for buy-only LBP where high starting prices are expected
 * 
 * PRICE UNITS:
 * - lbpSpotPrice: ETH per token (1e18 scale)
 *   Calculated as: (reserveETH * weightToken) / (reserveToken * weightETH)
 *   OR using quoteETHForToken(1e18) for accuracy
 * 
 * - referencePrice: TOKEN/USD or TOKEN/ETH (1e8 scale for Chainlink USD pairs)
 *   IMPORTANT: Must be in same unit dimension as lbpSpotPrice for proper comparison
 *   If using ETH/USD feed, delta-divergence may not be dimensionally correct
 *   In that case, delta-price (primary signal) is used
 * 
 * Key Features:
 * - Does NOT set prices or influence AMM math
 * - Evaluates only at placeBid() checkpoints
 * - Fail-open: oracle failures don't block bids
 * - Protocol-level configuration only
 * - One-sided detection: only upward price jumps trigger (buy-only LBP)
 */
contract LBPOracle is LBPOracleEvents {
    IChainlinkPriceFeed public priceFeed;

    address public owner;

    uint256 public baseFeeBP = 100;// 1%
    uint256 public maxFeeBP = 1000;// 10%

    // Pause mechanism (global - same for all pools)
    uint256 public pauseDuration = 5 minutes;

    // Triggers when divergence change exceeds this threshold
    uint256 public deltaDivergenceThresholdBP = 1000; // 10%

    // Optional safety trigger for extreme whale buys
    uint256 public priceJumpThresholdBP = 1000; // 10%

    // Cooldown period to prevent pause spam (seconds)
    uint256 public cooldown = 60; // 1 minute

    // State tracking per pool (mapping to support multiple LBPs with one oracle)
    mapping(address => uint256) public lastDivergenceBP; // Last divergence in basis points per pool
    mapping(address => uint256) public lastLbpSpotPrice; // Last LBP spot price per pool (for jump detection)
    mapping(address => uint256) public lastCheckpointTime; // Last checkpoint timestamp per pool
    mapping(address => uint256) public pausedUntil; // Pause end time per pool
    mapping(address => uint256) public lastComputedFeeBP; // Last computed fee per pool

    uint256 public constant MAX_STALENESS = 1 hours;
    uint256 public constant BP_SCALE = 10000;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _priceFeed) {
        require(_priceFeed != address(0), "zero price feed");
        priceFeed = IChainlinkPriceFeed(_priceFeed);
        owner = msg.sender;
    }

    function getReferencePrice() public view returns (uint256) {
        try priceFeed.latestRoundData() returns (
            uint80,
            int256 price,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (block.timestamp - updatedAt > MAX_STALENESS) {
                return 0;
            }
            if (price <= 0) {
                return 0;
            }
            return uint256(price);
        } catch {
            return 0;
        }
    }

    function getLbpSpotPrice(address pool) public view returns (uint256 spotPrice) {
        ILBPPool lbpPool = ILBPPool(pool);
        uint256 reserveETH;
        uint256 reserveToken;
        uint256 weightToken;
        uint256 weightETH;
        
        try lbpPool.reserveETH() returns (uint256 eth) {
            reserveETH = eth;
        } catch {
            return 0; // Cannot read reserves
        }
        
        try lbpPool.reserveToken() returns (uint256 token) {
            reserveToken = token;
        } catch {
            return 0;
        }
        
        try lbpPool.currentWeights() returns (uint256 wToken, uint256 wETH) {
            weightToken = wToken;
            weightETH = wETH;
        } catch {
            return 0;
        }

        if (reserveToken == 0 || reserveETH == 0 || weightETH == 0) {
            return 0;
        }
        try lbpPool.quoteETHForToken(1e18) returns (uint256 tokensOut) {
            if (tokensOut > 0) {
                spotPrice = (1e18 * 1e18) / tokensOut;
                return spotPrice;
            }
        } catch {}
        uint256 priceNumerator = (reserveETH * weightToken);
        uint256 priceDenominator = (reserveToken * weightETH);
        spotPrice = (priceNumerator * 1e18) / priceDenominator;
    }

    // ============ DELTA-DIVERGENCE LOGIC ============
    function _getPoolReserves(address lbpPool) internal view returns (uint256 ethAmount, uint256 tokenAmount) {
        try ILBPPool(lbpPool).reserveETH() returns (uint256 eth) {
            ethAmount = eth;
        } catch {
            ethAmount = 0;
        }
        try ILBPPool(lbpPool).reserveToken() returns (uint256 token) {
            tokenAmount = token;
        } catch {
            tokenAmount = 0;
        }
    }

    function _calculateDeltaDivergence(address lbpPool, uint256 lbpSpot, uint256 refPrice) internal returns (uint256 deltaDiv) {
        if (refPrice == 0) {
            lastDivergenceBP[lbpPool] = 0;
            return 0;
        }
        
        uint256 refPriceScaled = refPrice * 1e10;
        uint256 divergenceNow;
        if (lbpSpot > refPriceScaled) {
            divergenceNow = ((lbpSpot - refPriceScaled) * BP_SCALE) / refPriceScaled;
        } else {
            divergenceNow = ((refPriceScaled - lbpSpot) * BP_SCALE) / refPriceScaled;
        }
        
        if (lastDivergenceBP[lbpPool] > 0) {
            if (divergenceNow > lastDivergenceBP[lbpPool]) {
                deltaDiv = divergenceNow - lastDivergenceBP[lbpPool];
            } else {
                deltaDiv = lastDivergenceBP[lbpPool] - divergenceNow;
            }
        } else {
            deltaDiv = 0;
        }
        lastDivergenceBP[lbpPool] = divergenceNow;
    }

    function _handleAnomaly(address lbpPool, bool deltaPriceAnomaly, bool deltaDivAnomaly) internal returns (uint256 feeBP, bool triggered) {
        if (deltaPriceAnomaly || deltaDivAnomaly) {
            uint256 currentPausedUntil = pausedUntil[lbpPool];
            pausedUntil[lbpPool] = block.timestamp + pauseDuration;
            if (block.timestamp >= currentPausedUntil) {
                emit PauseActivated(pausedUntil[lbpPool]);
            }
            return (maxFeeBP, true);
        }
        return (baseFeeBP, false);
    }

    function _emitEventsAndUpdateState(
        address lbpPool,
        uint256 lbpSpot,
        uint256 previousPrice,
        uint256 deltaPriceBP,
        bool deltaPriceAnomaly,
        bool inCooldown,
        uint256 feeBP,
        bool triggered
    ) internal {
        emit PriceAnomalyDetected(
            deltaPriceBP,
            lbpSpot,
            previousPrice,
            priceJumpThresholdBP,
            triggered,
            inCooldown,
            feeBP
        );
        
        (uint256 rEth, uint256 rTok) = _getPoolReserves(lbpPool);
        emit OracleEvaluation(
            lbpSpot,
            previousPrice,
            deltaPriceBP,
            priceJumpThresholdBP,
            deltaPriceAnomaly,
            inCooldown,
            feeBP,
            false,
            rEth,
            rTok
        );

        lastLbpSpotPrice[lbpPool] = lbpSpot;
        lastCheckpointTime[lbpPool] = block.timestamp;
        lastComputedFeeBP[lbpPool] = feeBP;
    }

    function computeAdaptiveFee(address lbpPool) external returns (uint256) {
        uint256 lbpSpot = getLbpSpotPrice(lbpPool);

        if (lbpSpot == 0) {
            lastComputedFeeBP[lbpPool] = baseFeeBP;
            return baseFeeBP;
        }
        if (lastLbpSpotPrice[lbpPool] == 0) {
            lastLbpSpotPrice[lbpPool] = lbpSpot;
            lastCheckpointTime[lbpPool] = block.timestamp;
            lastComputedFeeBP[lbpPool] = baseFeeBP;
            
            (uint256 rEth, uint256 rTok) = _getPoolReserves(lbpPool);
            emit OracleEvaluation(
                lbpSpot,
                0,
                0,
                priceJumpThresholdBP,
                false,
                false,
                baseFeeBP,
                true,
                rEth,
                rTok
            );
            return baseFeeBP;
        }
        uint256 previousPrice = lastLbpSpotPrice[lbpPool];
        uint256 deltaPriceBP = (lbpSpot > previousPrice) 
            ? ((lbpSpot - previousPrice) * BP_SCALE) / previousPrice 
            : 0;
        uint256 refPrice = getReferencePrice();
        uint256 deltaDiv = _calculateDeltaDivergence(lbpPool, lbpSpot, refPrice);

        bool inCooldown = (block.timestamp - lastCheckpointTime[lbpPool]) < cooldown;
        bool deltaPriceAnomaly = deltaPriceBP > priceJumpThresholdBP;
        bool deltaDivAnomaly = (refPrice > 0) && (deltaDiv > deltaDivergenceThresholdBP);

        (uint256 feeBP, bool triggered) = _handleAnomaly(lbpPool, deltaPriceAnomaly, deltaDivAnomaly);

        _emitEventsAndUpdateState(lbpPool, lbpSpot, previousPrice, deltaPriceBP, deltaPriceAnomaly, inCooldown, feeBP, triggered);
        return feeBP;
    }

    function viewAdaptiveFee(address lbpPool) external view returns (uint256) {
        if (lastCheckpointTime[lbpPool] == 0) {
            return baseFeeBP;
        }
        uint256 fee = lastComputedFeeBP[lbpPool];
        return fee > 0 ? fee : baseFeeBP;
    }

    function simulateComputeAdaptiveFee(address lbpPool) external view returns (bool wouldPause, uint256 wouldSetFeeBP, uint256 wouldSetPausedUntil) {
        uint256 lbpSpot = getLbpSpotPrice(lbpPool);

        if (lbpSpot == 0) {
            return (false, baseFeeBP, 0);
        }
        if (lastLbpSpotPrice[lbpPool] == 0) {
            return (false, baseFeeBP, 0);
        }
        uint256 previousPrice = lastLbpSpotPrice[lbpPool];
        uint256 deltaPriceBP = (lbpSpot > previousPrice) 
            ? ((lbpSpot - previousPrice) * BP_SCALE) / previousPrice 
            : 0;

        uint256 refPrice = getReferencePrice();
        uint256 deltaDiv = 0;
        if (refPrice > 0) {
            uint256 refPriceScaled = refPrice * 1e10;
            uint256 divergenceNow;
            if (lbpSpot > refPriceScaled) {
                divergenceNow = ((lbpSpot - refPriceScaled) * BP_SCALE) / refPriceScaled;
            } else {
                divergenceNow = ((refPriceScaled - lbpSpot) * BP_SCALE) / refPriceScaled;
            }
            
            if (lastDivergenceBP[lbpPool] > 0) {
                if (divergenceNow > lastDivergenceBP[lbpPool]) {
                    deltaDiv = divergenceNow - lastDivergenceBP[lbpPool];
                } else {
                    deltaDiv = lastDivergenceBP[lbpPool] - divergenceNow;
                }
            }
        }

        bool deltaPriceAnomaly = deltaPriceBP > priceJumpThresholdBP;
        bool deltaDivAnomaly = (refPrice > 0) && (deltaDiv > deltaDivergenceThresholdBP);

        if (deltaPriceAnomaly || deltaDivAnomaly) {
            uint256 newPausedUntil = block.timestamp + pauseDuration;
            return (true, maxFeeBP, newPausedUntil);
        }
        
        return (false, baseFeeBP, 0);
    }

    function isPaused(address lbpPool) external view returns (bool) {
        return block.timestamp < pausedUntil[lbpPool];
    }

    function pausedUntilForPool(address lbpPool) external view returns (uint256) {
        return pausedUntil[lbpPool];
    }

    function setFeeBP(uint256 _baseFeeBP, uint256 _maxFeeBP) external onlyOwner {
        baseFeeBP = _baseFeeBP;
        maxFeeBP = _maxFeeBP;
        emit FeeUpdated(_baseFeeBP, _maxFeeBP);
    }

    function setDeltaDivergenceThreshold(uint256 _thresholdBP) external onlyOwner {
        deltaDivergenceThresholdBP = _thresholdBP;
        emit AnomalyThresholdUpdated(_thresholdBP);
    }

    function setPriceJumpThreshold(uint256 _thresholdBP) external onlyOwner {
        priceJumpThresholdBP = _thresholdBP;
    }

    function setPauseDuration(uint256 _duration) external onlyOwner {
        pauseDuration = _duration;
    }

    function setCooldown(uint256 _cooldown) external onlyOwner {
        cooldown = _cooldown;
    }
}
