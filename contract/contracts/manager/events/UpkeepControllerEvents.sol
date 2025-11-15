// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract UpkeepControllerEvents {
    event AuctionRegistered(address indexed auction, uint256 demandCheckTime);
    event DemandCheckExecuted(address indexed auction);
    event KeeperEnabledUpdated(bool enabled);
}
