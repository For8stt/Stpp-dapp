// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract DutchAuctionErrors {
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
}
