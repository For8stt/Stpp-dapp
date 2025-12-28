// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract DutchAuctionEvents {
    event AuctionInitialized(uint256 startTime, uint256 commitEndTime, uint256 revealEndTime, uint256 tokensForSale);
    event CommitSubmitted(address indexed bidder, bytes32 indexed commitHash, uint256 deposit, uint256 impliedQty);
    event BidRevealed(
        address indexed bidder,
        uint256 indexed commitIndex,
        uint256 priceTickIndex,
        uint256 qty,
        uint256 bonusPct
    );
    event DynamicAdjustment(
        uint256 decayMultiplier,
        uint256 newCommitEndTime,
        uint256 totalDepositCommitted,
        uint256 totalCommitsCount
    );
    event AuctionFinalized(bool success, uint256 clearingPrice, uint256 tokensSold, uint256 totalRaised);
    event RefundIssued(address indexed bidder, uint256 amount);
    event BonusAllocated(address indexed bidder, uint256 bonusAmount);
    event BonusMerkleRootSet(bytes32 indexed root, string cid);
    event WhitelistCIDSet(string cid);
    event LBPLaunched(address indexed tokenRecipient, address indexed stableRecipient, uint256 tokenAmount, uint256 stableAmount);
    event VestingUpdated(uint256 vestingStart, uint256 vestingDuration);
    event TokensReturned(address indexed owner, uint256 amount);
}
