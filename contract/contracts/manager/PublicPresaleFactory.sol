// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./PresaleManager.sol";

/**
 * @title PublicPresaleFactory
 * @notice Permissionless factory that mints dedicated PresaleManager instances per user.
 */
/// @notice Main permissionless factory for full presale stacks (DutchAuction + LBP + Vesting).
contract PublicPresaleFactory {
    using Clones for address;
    using SafeERC20 for IERC20;

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
    error InsufficientTokenBalance();
    error InsufficientTokenAllowance();
    error TokenTransferFailed();

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ImplementationZero();
        managerImplementation = implementation_;
    }

    /**
     * @notice Deploys a fresh PresaleManager clone, initializes it, and hands ownership to the caller.
     * @dev This function atomically creates the presale and transfers tokens. The auction will NOT be created
     *      if token transfer fails, ensuring atomicity.
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
        // Calculate required token amount
        uint256 requiredAmount = auctionInput.tokensForSale + auctionInput.bonusReserve;
        
        // Check user balance BEFORE creating auction
        IERC20 saleToken = IERC20(auctionInput.saleToken);
        uint256 userBalance = saleToken.balanceOf(msg.sender);
        if (userBalance < requiredAmount) {
            revert InsufficientTokenBalance();
        }

        // Check allowance BEFORE creating auction
        uint256 allowance = saleToken.allowance(msg.sender, address(this));
        if (allowance < requiredAmount) {
            revert InsufficientTokenAllowance();
        }

        // Create the presale (this creates the auction contract)
        manager = managerImplementation.clone();
        (auction, lbp, vesting) = PresaleManager(payable(manager)).initializeManager(
            msg.sender,
            auctionInput,
            lbpConfig
        );

        // Atomically transfer tokens to auction address
        // safeTransferFrom will revert if transfer fails, ensuring atomicity
        // We check balance before and after to ensure transfer succeeded
        uint256 balanceBefore = saleToken.balanceOf(auction);
        
        // Perform the transfer - this MUST succeed or entire transaction reverts
        saleToken.safeTransferFrom(msg.sender, auction, requiredAmount);
        
        // CRITICAL: Verify transfer was successful by checking balance increase
        // This MUST happen BEFORE emitting event to ensure atomicity
        uint256 balanceAfter = saleToken.balanceOf(auction);
        uint256 actualIncrease = balanceAfter - balanceBefore;
        
        // Use require for explicit revert - ensures transaction fails if transfer didn't work
        require(actualIncrease >= requiredAmount, "TokenTransferFailed");
        
        // Only emit event and add to list if transfer was successful
        // If we reach here, transfer definitely succeeded
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
