// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVestingEscrow
 * @notice Minimal interface for TokenVestingEscrow.
 */
interface IVestingEscrow {
    function token() external view returns (address);
}
