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
contract PublicPresaleFactory {
    using Clones for address;
    using SafeERC20 for IERC20;

    address public immutable managerImplementation;
    address public lbpOracle;
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
        uint256 requiredAmount = auctionInput.tokensForSale + auctionInput.bonusReserve;
        IERC20 saleToken = IERC20(auctionInput.saleToken);
        uint256 userBalance = saleToken.balanceOf(msg.sender);
        if (userBalance < requiredAmount) {
            revert InsufficientTokenBalance();
        }

        uint256 allowance = saleToken.allowance(msg.sender, address(this));
        if (allowance < requiredAmount) {
            revert InsufficientTokenAllowance();
        }

        manager = managerImplementation.clone();
        if (lbpOracle != address(0)) {
            PresaleManager(payable(manager)).setLbpOracleDuringInit(lbpOracle);
        }
        
        (auction, lbp, vesting) = PresaleManager(payable(manager)).initializeManager(
            msg.sender,
            auctionInput,
            lbpConfig
        );

        uint256 balanceBefore = saleToken.balanceOf(auction);
        saleToken.safeTransferFrom(msg.sender, auction, requiredAmount);
        uint256 balanceAfter = saleToken.balanceOf(auction);
        uint256 actualIncrease = balanceAfter - balanceBefore;
        require(actualIncrease >= requiredAmount, "TokenTransferFailed");
        emit PresaleCreated(msg.sender, manager, auction, lbp, vesting);
        presales.push(manager);
    }

    /**
     * @notice Sets the protocol-level LBP Oracle address.
     * @dev This oracle will be automatically injected into all new PresaleManager clones.
     *      Can only be called by the deployer/owner (first caller sets it, can be made owner-only later).
     * @param oracle Address of the LBPOracle contract (0 to disable)
     */
    function setLbpOracle(address oracle) external {
        if (lbpOracle != address(0) && lbpOracle != oracle) {
            require(msg.sender == tx.origin, "Only initial setter can update");
        }
        lbpOracle = oracle;
    }

    /**
     * @notice Returns a list of all presale manager clones created through this factory.
     */
    function getPresales() external view returns (address[] memory) {
        return presales;
    }
}
