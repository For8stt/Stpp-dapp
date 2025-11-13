// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract PresaleManagerErrors {
    error SaleTokenZero();
    error TreasuryZero();
    error PriceTicksEmpty();
    error OwnerZero();
    error ManagerNotInitialized();
    error ManagerAlreadyInitialized();
    error AuctionExists();
    error UnknownAuction();
    error RecipientZero();
    error AuctionAlreadyFinalized();
    error AuctionNotFinalized();
    error LbpAlreadyLaunched();
    error LbpNotLaunched();
    error InvalidLbpTimes();
    error NoTokensReceived();
    error NoEthReceived();
    error EscrowZero();
    error EscrowTokenMismatch();
    error UnauthorizedCaller();
}
