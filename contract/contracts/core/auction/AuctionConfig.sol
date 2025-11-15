// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AuctionConfig
 * @notice Parameter bundle used to initialize Dutch auction instances.
 */
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
