// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReserveDecayLib
 * @notice Houses helper math for decay multiplier updates and commit window adjustments.
 */
library ReserveDecayLib {
    /**
     * @notice Computes an updated decay multiplier by clamping to the configured maximum.
     */
    function applyDecayMultiplier(uint256 currentMultiplier, uint256 maxMultiplier) internal pure returns (uint256) {
        if (currentMultiplier >= maxMultiplier) {
            return currentMultiplier;
        }
        return maxMultiplier;
    }

    /**
     * @notice Calculates the adjusted commit end time when demand is below threshold.
     * @dev Shortens the remaining commit window by 25% but never less than the minimum duration.
     */
    function adjustedCommitEnd(
        uint256 startTime,
        uint256 currentCommitEnd,
        uint256 initialCommitEnd,
        uint256 minCommitDuration
    ) internal pure returns (bool updated, uint256 newCommitEnd) {
        uint256 minEnd = startTime + minCommitDuration;
        if (currentCommitEnd <= minEnd) {
            return (false, currentCommitEnd);
        }

        uint256 commitWindow = initialCommitEnd - startTime;
        uint256 reduction = (commitWindow * 25) / 100;
        uint256 targetEnd = currentCommitEnd > reduction ? currentCommitEnd - reduction : minEnd;
        if (targetEnd < minEnd) {
            targetEnd = minEnd;
        }

        if (targetEnd < currentCommitEnd) {
            return (true, targetEnd);
        }

        return (false, currentCommitEnd);
    }
}
