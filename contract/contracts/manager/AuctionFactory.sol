// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../core/auction/DutchAuction.sol";
import "../interfaces/IAuctionFactory.sol";
import "./errors/AuctionFactoryErrors.sol";

/**
 * @title AuctionFactory
 * @notice Responsible solely for deploying new Dutch auction instances.
 */
contract AuctionFactory is Ownable, IAuctionFactory, AuctionFactoryErrors {
    constructor(address owner_) {
        if (owner_ == address(0)) revert OwnerZero();
        _transferOwnership(owner_);
    }

    /// @inheritdoc IAuctionFactory
    function deployAuction(address saleToken, address manager) external override onlyOwner returns (address) {
        if (saleToken == address(0)) revert SaleTokenZero();
        if (manager == address(0)) revert ManagerZero();

        DutchAuction auction = new DutchAuction(IERC20(saleToken), manager);
        auction.transferOwnership(manager);
        return address(auction);
    }
}
