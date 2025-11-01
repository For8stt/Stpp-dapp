// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockEscrowWrongToken {
    address public immutable token;

    constructor(address token_) {
        token = token_;
    }
}
