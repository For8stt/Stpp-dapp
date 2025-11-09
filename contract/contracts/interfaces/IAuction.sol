// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAuction
 * @notice Interface for the commit-reveal Dutch auction used by STPP.
 */
interface IAuction {
    struct AuctionConfig {
        uint256 startTime;
        uint256 commitDuration;
        uint256 revealDuration;
        uint256 perAddressCap;
        uint256 softCap;
        uint256 tokensForSale;
        uint256 bonusReserve;
        uint256 earlyBonusWindow;
        uint256 earlyBonusPct;
        uint256 nonRevealPenaltyBps;
        uint256 lbpStableShareBps;
        uint256 thresholdLow;
        uint256 maxDecayMultiplier;
        uint256 minCommitDuration;
        uint256 vestingStart;
        uint256 vestingDuration;
        address treasury;
        address lbpTokenRecipient;
        address payable lbpStableRecipient;
        bytes32 merkleRoot;
        uint256[] priceTicks;
    }

    function initializeAuction(AuctionConfig calldata config) external;

    function updateBonusReserve(uint256 additionalReserve) external;

    function updateVesting(uint256 newStart, uint256 newDuration) external;

    function withdrawTreasury(address payable recipient) external;

    function finalize() external;

    function launchLbp() external;

    function updateDynamicReserve() external;

    function tokensForSale() external view returns (uint256);

    function tokensSold() external view returns (uint256);

    function totalRaised() external view returns (uint256);

    function clearingPrice() external view returns (uint256);

    function successful() external view returns (bool);

    function finalized() external view returns (bool);

    function ethForTreasury() external view returns (uint256);

    function commitEndTime() external view returns (uint256);

    function thresholdLow() external view returns (uint256);

    function dynamicAdjustmentCount() external view returns (uint256);

    function totalDepositCommitted() external view returns (uint256);
}
