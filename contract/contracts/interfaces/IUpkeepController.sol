// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUpkeepController
 * @notice Interface describing keeper automation for dynamic reserve checks.
 */
interface IUpkeepController {
    function registerAuction(address auction, uint256 demandCheckTime) external;

    function updateDemandCheckTime(address auction, uint256 newTime) external;

    function setKeeperEnabled(bool enabled) external;

    function executeDemandCheck(address auction) external;

    function demandCheckTriggered(address auction) external view returns (bool);

    function demandCheckTime(address auction) external view returns (uint256);
}
