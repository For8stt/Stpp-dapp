// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAuctionFactory
 * @notice Interface for deploying Dutch auction instances.
 */
interface IAuctionFactory {
    function deployAuction(address saleToken, address manager) external returns (address);
}
