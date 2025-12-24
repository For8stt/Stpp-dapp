// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/auction/AuctionConfig.sol";
import "../core/auction/DutchAuction.sol";

/// @title Reentrant attacker harness for DutchAuction tests
/// @notice Provides helper functions to simulate reentrancy attempts from tests.
contract ReentrantDutchAuctionAttacker {
    DutchAuction public auction;
    address public immutable owner;

    uint8 public mode;
    bytes public payload;
    uint256 public valueToForward;

    bool public lastReenterSuccess;
    bytes public lastRevertData;

    error AuctionNotSet();
    error AlreadySet();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAuction(address payable auction_) external onlyOwner {
        if (auction_ == address(0)) revert AuctionNotSet();
        if (address(auction) != address(0)) revert AlreadySet();
        auction = DutchAuction(auction_);
    }

    function initializeAuction(AuctionConfig calldata config) external onlyOwner {
        _ensureAuction();
        auction.initializeAuction(config);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        _ensureAuction();
        auction.transferOwnership(newOwner);
    }

    function commitBid(bytes32 commitHash, bytes32[] calldata merkleProof) external payable onlyOwner {
        _ensureAuction();
        auction.commit{value: msg.value}(commitHash, merkleProof);
    }

    function revealBid(uint256 priceTickIndex, uint256 qty, bytes32 nonce, uint256 commitIndex) external onlyOwner {
        _ensureAuction();
        auction.reveal(priceTickIndex, qty, nonce, commitIndex);
    }

    function finalizeAuction() external onlyOwner {
        _ensureAuction();
        auction.finalize();
    }

    function launchLbp() external onlyOwner {
        _ensureAuction();
        auction.launchLbp();
    }

    function attackClaim(uint8 mode_, bytes calldata payload_, uint256 value_, uint256 bonusQty, bytes32[] calldata merkleProof) external onlyOwner {
        _prepareAttack(mode_, payload_, value_);
        auction.claim(bonusQty, merkleProof);
    }

    function attackRefund(uint8 mode_, bytes calldata payload_, uint256 value_) external onlyOwner {
        _prepareAttack(mode_, payload_, value_);
        auction.refundUnsuccessful();
    }

    function attackWithdrawUnrevealed(
        uint8 mode_,
        bytes calldata payload_,
        uint256 value_,
        uint256 commitIndex
    ) external onlyOwner {
        _prepareAttack(mode_, payload_, value_);
        auction.withdrawUnrevealed(commitIndex);
    }

    function attackWithdrawTreasury(
        uint8 mode_,
        bytes calldata payload_,
        uint256 value_,
        address payable recipient
    ) external onlyOwner {
        _prepareAttack(mode_, payload_, value_);
        auction.withdrawTreasury(recipient);
    }

    receive() external payable {
        if (mode == 0 || address(auction) == address(0)) {
            return;
        }

        (bool ok, bytes memory data) = address(auction).call{value: valueToForward}(payload);
        lastReenterSuccess = ok;
        lastRevertData = data;

        mode = 0;
        payload = "";
        valueToForward = 0;
    }

    function _prepareAttack(uint8 mode_, bytes calldata payload_, uint256 value_) internal {
        _ensureAuction();
        mode = mode_;
        payload = payload_;
        valueToForward = value_;
        lastReenterSuccess = false;
        lastRevertData = "";
    }

    function _ensureAuction() internal view {
        if (address(auction) == address(0)) revert AuctionNotSet();
    }
}
