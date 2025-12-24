// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract DutchAuctionErrors {
    error SaleTokenZero();
    error ManagerZero();
    error TreasuryZero();
    error TokensForSaleZero();
    error CommitDurationTooShort();
    error RevealDurationZero();
    error PriceTicksEmpty();
    error PenaltyTooHigh();
    error BonusTooHigh();
    error LbpShareTooHigh();
    error MaxDecayTooLow();
    error AuctionNotInitialized();
    error AuctionNotActive();
    error CommitPhaseComplete();
    error RevealPhaseClosed();
    error CapExceeded();
    error InvalidProof();
    error AlreadyRevealed();
    error InvalidCommit();
    error AuctionNotFinalized();
    error AuctionFinalizedAlready();
    error NothingToClaim();
    error InvalidPriceTicks();
    error NotManager();
    error LBPAlreadyLaunched();
    error NoInventoryForLBP();
    error DepositTooSmall();
    error DepositMismatch();
    error LbpTokenRecipientZero();
    error LbpStableRecipientZero();
    error TransferFailed();
    error InvalidReserveIncrease();
    error BaseAlreadyInitialized();
    error NotOwner();
}
