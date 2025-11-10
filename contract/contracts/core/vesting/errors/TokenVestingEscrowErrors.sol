// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract TokenVestingEscrowErrors {
    error TokenZero();
    error LbpZero();
    error TokenMismatch();
    error UserZero();
    error ToZero();
    error RescueSaleToken();
    error NothingClaimable();
}
