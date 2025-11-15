// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/auction/AuctionConfig.sol";

/**
 * @title IAuction
 * @notice Interface for the commit-reveal Dutch auction used by STPP.
 */
interface IAuction {

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
