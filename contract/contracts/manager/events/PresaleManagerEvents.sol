// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract PresaleManagerEvents {
    event ManagerInitialized(
        address indexed owner,
        address indexed auction,
        address indexed lbp,
        address vesting
    );
    event AuctionCreated(address indexed auction, address indexed saleToken, uint256 tokensForSale);
    event AuctionFinalized(
        address indexed auction,
        bool successful,
        uint256 clearingPrice,
        uint256 tokensSold,
        uint256 totalRaised
    );
    event LBPInitialized(
        address indexed auction,
        address indexed lbp,
        address indexed vesting,
        uint256 tokenAmount,
        uint256 ethAmount
    );
    event LBPFinalized(
        address indexed auction,
        address indexed lbp,
        address indexed vesting,
        uint256 ethAmount,
        uint256 tokenAmount
    );
    event AuctionProceedsWithdrawn(address indexed auction, address indexed recipient, uint256 amount);
    event AuctionDemandCheckExecuted(address indexed auction);
    event KeeperEnabledUpdated(bool enabled);
    event LbpOracleSet(address indexed oracle);
}
