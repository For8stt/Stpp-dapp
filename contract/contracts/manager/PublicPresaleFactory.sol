// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "./PresaleManager.sol";

/**
 * @title PublicPresaleFactory
 * @notice Permissionless factory that mints dedicated PresaleManager instances per user.
 */
/// @notice Main permissionless factory for full presale stacks (DutchAuction + LBP + Vesting).
contract PublicPresaleFactory {
    using Clones for address;

    address public immutable managerImplementation;
    address[] public presales;

    event PresaleCreated(
        address indexed owner,
        address indexed manager,
        address indexed auction,
        address lbp,
        address vesting
    );

    error ImplementationZero();

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ImplementationZero();
        managerImplementation = implementation_;
    }

    /**
     * @notice Deploys a fresh PresaleManager clone, initializes it, and hands ownership to the caller.
     * @param auctionInput Full Dutch auction configuration.
     * @param lbpConfig Liquidity bootstrap pool configuration (plus vesting schedule).
     */
    function createPresale(
        PresaleManager.AuctionInput calldata auctionInput,
        PresaleManager.LbpLaunchConfig calldata lbpConfig
    )
        external
        returns (address manager, address auction, address lbp, address vesting)
    {
        manager = managerImplementation.clone();
        (auction, lbp, vesting) = PresaleManager(payable(manager)).initializeManager(
            msg.sender,
            auctionInput,
            lbpConfig
        );

        emit PresaleCreated(msg.sender, manager, auction, lbp, vesting);
        presales.push(manager);
    }

    /**
     * @notice Returns a list of all presale manager clones created through this factory.
     */
    function getPresales() external view returns (address[] memory) {
        return presales;
    }
}
