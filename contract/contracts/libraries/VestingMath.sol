// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VestingMath
 * @notice Utility helpers for vesting fraction and allocation calculations.
 */
library VestingMath {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /**
     * @notice Returns fully vested (10000) once the schedule ends.
     * @dev Mirrors the historic DutchAuction behaviour (no partial unlocks).
     */
    function cliffOnlyFraction(uint256 vestingStart, uint256 vestingDuration) internal view returns (uint256) {
        if (vestingDuration == 0) {
            return BPS_DENOMINATOR;
        }
        if (block.timestamp >= vestingStart + vestingDuration) {
            return BPS_DENOMINATOR;
        }
        return 0;
    }

    /**
     * @dev Reproduces SecureLBP's vesting calculation.
     */
    function lbpVestedAmount(
        bool finalized,
        uint256 allocation,
        bool vestingConfigured,
        uint256 vestingStart,
        uint256 vestingCliffDuration,
        uint256 vestingFinalDuration,
        uint256 vestingCliffPercentBP,
        uint256 bpScale
    ) internal view returns (uint256) {
        if (!finalized || allocation == 0) return 0;
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

        return (allocation * vestingCliffPercentBP) / bpScale;
    }
}
