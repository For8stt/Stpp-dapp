// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract TokenVestingEscrowEvents {
    event Claimed(address indexed user, uint256 amount, uint256 totalClaimed);
}
