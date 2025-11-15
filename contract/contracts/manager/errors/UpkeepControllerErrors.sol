// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract UpkeepControllerErrors {
    error ManagerZero();
    error AuctionZero();
    error AuctionAlreadyRegistered();
    error UnknownAuction();
    error KeeperConfigFrozen();
    error KeeperDisabled();
    error ConditionsNotMet();
}
