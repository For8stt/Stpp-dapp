// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract LBPOracleEvents {
    event PauseActivated(uint256 untilTimestamp);
    event FeeUpdated(uint256 baseFeeBP, uint256 maxFeeBP);
    event AnomalyThresholdUpdated(uint256 newThresholdBP);
}
