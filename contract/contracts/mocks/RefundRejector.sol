// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/auction/DutchAuction.sol";

/// @dev Helper used in tests to simulate refund recipients that reject ETH transfers.
contract RefundRejector {
    DutchAuction public immutable auction;

    constructor(DutchAuction auction_) {
        auction = auction_;
    }

    function commitBid(bytes32 commitHash) external payable {
        auction.commit{value: msg.value}(commitHash, new bytes32[](0));
    }

    function revealBid(uint256 priceTickIndex, uint256 qty, bytes32 nonce, uint256 commitIndex) external {
        auction.reveal(priceTickIndex, qty, nonce, commitIndex);
    }

    function triggerRefund() external {
        auction.refundUnsuccessful();
    }

    receive() external payable {
        revert("reject refunds");
    }
}
