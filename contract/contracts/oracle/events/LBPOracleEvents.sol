// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract LBPOracleEvents {
    event PauseActivated(uint256 untilTimestamp);
    event FeeUpdated(uint256 baseFeeBP, uint256 maxFeeBP);
    event AnomalyThresholdUpdated(uint256 newThresholdBP);
    event PriceAnomalyDetected(
        uint256 deltaPriceBP,
        uint256 lbpSpot,
        uint256 lastLbpSpot,
        uint256 thresholdBP,
        bool triggered,
        bool inCooldown,
        uint256 feeBP
    );
    event OracleEvaluation(
        uint256 lbpSpot,
        uint256 lastLbpSpotPrice,
        uint256 deltaPriceBP,
        uint256 priceJumpThresholdBP,
        bool deltaPriceAnomaly,
        bool inCooldown,
        uint256 feeBP,
        bool isFirstCall,
        uint256 reserveETH,
        uint256 reserveToken
    );
}
