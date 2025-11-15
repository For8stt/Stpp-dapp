// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../core/auction/AuctionConfig.sol";
import "../core/lbp/SecureLBP.sol";
import "../core/vesting/TokenVestingEscrow.sol";
import "../interfaces/IAuction.sol";
import "../interfaces/IAuctionFactory.sol";
import "../interfaces/IAutomationCompatible.sol";
import "../interfaces/ILBP.sol";
import "../interfaces/IPresaleManager.sol";
import "../interfaces/IUpkeepController.sol";
import "../interfaces/IVestingEscrow.sol";

import "./AuctionFactory.sol";
import "./UpkeepController.sol";
import "./events/PresaleManagerEvents.sol";
import "./errors/PresaleManagerErrors.sol";

/// @title PresaleManager
/// @notice High-level orchestrator for Dutch auction → LBP → vesting pipeline.
contract PresaleManager is Ownable, IPresaleManager, IAutomationCompatible, PresaleManagerEvents, PresaleManagerErrors {
    using SafeERC20 for IERC20;

    struct AuctionInput {
        address saleToken;
        address treasury;
        uint256 startTime;
        uint256 commitDuration;
        uint256 revealDuration;
        uint256 perAddressCap;
        uint256 softCap;
        uint256 tokensForSale;
        uint256 bonusReserve;
        uint256 earlyBonusWindow;
        uint256 earlyBonusPct;
        uint256 nonRevealPenaltyBps;
        uint256 lbpStableShareBps;
        uint256 thresholdLow;
        uint256 maxDecayMultiplier;
        uint256 minCommitDuration;
        uint256 demandCheckTime;
        uint256 vestingStart;
        uint256 vestingDuration;
        bytes32 merkleRoot;
        uint256[] priceTicks;
    }

    struct LbpLaunchConfig {
        uint256 startTime;
        uint256 endTime;
        uint256 poolStartWeightToken;
        uint256 poolEndWeightToken;
        uint256 poolSwapFee;
        uint256 vestingStartTime;
        uint256 vestingCliffDuration;
        uint256 vestingFinalDuration;
        uint256 vestingCliffPercentBP;
    }

    struct AuctionRecord {
        address saleToken;
        address treasury;
        address payable lbp;
        address vestingEscrow;
        bool finalized;
        bool lbpInitialized;
        bool lbpFinalized;
        uint256 tokensForSale;
        uint256 bonusReserve;
        uint256 clearingPrice;
        uint256 tokensSold;
        uint256 totalRaised;
        uint256 unsoldTokens;
        uint256 lbpEthProvided;
        uint256 lbpTokensProvided;
        uint256 ethRaisedDuringLBP;
        uint256 demandCheckTime;
        bool demandCheckTriggered;
    }

    IAuctionFactory public auctionFactory;
    IUpkeepController public upkeepController;

    bool public managerInitialized;

    address[] private _auctions;
    mapping(address => bool) public isManagedAuction;
    mapping(address => AuctionRecord) private _records;


    function initializeManager(
        address owner_,
        AuctionInput calldata auctionParams,
        LbpLaunchConfig calldata lbpParams
    ) external returns (address auctionAddress, address lbpAddress, address vestingAddress) {
        if (managerInitialized) revert ManagerAlreadyInitialized();
        if (owner_ == address(0)) revert OwnerZero();

        auctionFactory = IAuctionFactory(address(new AuctionFactory(address(this))));
        upkeepController = IUpkeepController(address(new UpkeepController(address(this))));
        managerInitialized = true;

        auctionAddress = _createManagedAuction(auctionParams);
        AuctionRecord storage record = _records[auctionAddress];
        (lbpAddress, vestingAddress) = _prepareInitialStack(record, auctionAddress, lbpParams);

        emit ManagerInitialized(owner_, auctionAddress, lbpAddress, vestingAddress);
        _transferOwnership(owner_);
    }

    /// @notice Deploys and configures a new Dutch auction under manager control.
    function createAuction(AuctionInput calldata params) external onlyOwner returns (address auctionAddress) {
        auctionAddress = _createManagedAuction(params);
    }

    function _createManagedAuction(AuctionInput calldata params) internal returns (address auctionAddress) {
        _ensureManagerInitialized();
        if (params.saleToken == address(0)) revert SaleTokenZero();
        if (params.treasury == address(0)) revert TreasuryZero();
        if (params.priceTicks.length == 0) revert PriceTicksEmpty();

        auctionAddress = auctionFactory.deployAuction(params.saleToken, address(this));

        AuctionConfig memory config = AuctionConfig({
            startTime: params.startTime,
            commitDuration: params.commitDuration,
            revealDuration: params.revealDuration,
            perAddressCap: params.perAddressCap,
            softCap: params.softCap,
            tokensForSale: params.tokensForSale,
            bonusReserve: params.bonusReserve,
            earlyBonusWindow: params.earlyBonusWindow,
            earlyBonusPct: params.earlyBonusPct,
            nonRevealPenaltyBps: params.nonRevealPenaltyBps,
            lbpStableShareBps: params.lbpStableShareBps,
            thresholdLow: params.thresholdLow,
            maxDecayMultiplier: params.maxDecayMultiplier,
            minCommitDuration: params.minCommitDuration,
            vestingStart: params.vestingStart,
            vestingDuration: params.vestingDuration,
            treasury: params.treasury,
            lbpTokenRecipient: address(this),
            lbpStableRecipient: payable(address(this)),
            merkleRoot: params.merkleRoot,
            priceTicks: params.priceTicks
        });

        IAuction(auctionAddress).initializeAuction(config);

        if (isManagedAuction[auctionAddress]) revert AuctionExists();
        isManagedAuction[auctionAddress] = true;
        _auctions.push(auctionAddress);

        AuctionRecord storage record = _records[auctionAddress];
        record.saleToken = params.saleToken;
        record.treasury = params.treasury;
        record.tokensForSale = params.tokensForSale;
        record.bonusReserve = params.bonusReserve;
        record.demandCheckTime = params.demandCheckTime;
        record.demandCheckTriggered = false;

        upkeepController.registerAuction(auctionAddress, params.demandCheckTime);

        emit AuctionCreated(auctionAddress, params.saleToken, params.tokensForSale);
        return auctionAddress;
    }

    /// @notice Allows the manager owner to top up the auction bonus reserve.
    function auctionUpdateBonusReserve(address auctionAddress, uint256 additionalReserve) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();

        IAuction(auctionAddress).updateBonusReserve(additionalReserve);
        record.bonusReserve += additionalReserve;
    }

    /// @notice Updates vesting schedule parameters on the Dutch auction.
    function auctionUpdateVesting(
        address auctionAddress,
        uint256 newStart,
        uint256 newDuration
    ) external onlyOwner {
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        IAuction(auctionAddress).updateVesting(newStart, newDuration);
    }

    /// @notice Withdraws auction proceeds to the configured treasury through the auction contract.
    function auctionWithdrawTreasury(address payable auctionAddress, address payable recipient) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (recipient == address(0)) revert RecipientZero();

        IAuction auction = IAuction(auctionAddress);
        uint256 beforeBalance = auction.ethForTreasury();
        auction.withdrawTreasury(recipient);
        record.totalRaised = auction.totalRaised();
        emit AuctionProceedsWithdrawn(auctionAddress, recipient, beforeBalance - auction.ethForTreasury());
    }

    /// @notice Invokes finalization on a managed Dutch auction after reveal window closes.
    function finalizeAuction(address payable auctionAddress) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (record.finalized) revert AuctionAlreadyFinalized();

        IAuction auction = IAuction(auctionAddress);
        auction.finalize();

        bool success = auction.successful();
        record.finalized = true;
        record.clearingPrice = auction.clearingPrice();
        record.tokensSold = auction.tokensSold();
        record.totalRaised = auction.totalRaised();
        record.unsoldTokens = auction.tokensForSale() - auction.tokensSold();

        emit AuctionFinalized(
            auctionAddress,
            success,
            record.clearingPrice,
            record.tokensSold,
            record.totalRaised
        );
    }

    /// @notice Launches the LBP by moving unsold tokens and ETH share from a finalized auction.
    function launchLBP(address payable auctionAddress, LbpLaunchConfig calldata cfg)
        external
        onlyOwner
        returns (address lbpAddress)
    {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.finalized) revert AuctionNotFinalized();
        if (record.lbpInitialized) revert LbpAlreadyLaunched();
        if (cfg.startTime >= cfg.endTime) revert InvalidLbpTimes();

        address payable lbpTarget = record.lbp;
        if (lbpTarget == address(0)) {
            if (cfg.startTime >= cfg.endTime) revert InvalidLbpTimes();
            lbpTarget = _deploySecureLBP(record, cfg, auctionAddress);
            record.lbp = lbpTarget;
        }

        uint256 tokenBalanceBefore = IERC20(record.saleToken).balanceOf(address(this));
        uint256 ethBalanceBefore = address(this).balance;
        IAuction(auctionAddress).launchLbp();
        uint256 tokensReceived = IERC20(record.saleToken).balanceOf(address(this)) - tokenBalanceBefore;
        uint256 ethReceived = address(this).balance - ethBalanceBefore;
        if (tokensReceived == 0) revert NoTokensReceived();
        if (ethReceived == 0) revert NoEthReceived();

        IERC20(record.saleToken).safeTransfer(lbpTarget, tokensReceived);
        ILBP(lbpTarget).initPoolFromAuction{value: ethReceived}(tokensReceived);

        record.lbpInitialized = true;
        record.lbpTokensProvided = tokensReceived;
        record.lbpEthProvided = ethReceived;

        lbpAddress = address(lbpTarget);
        emit LBPInitialized(auctionAddress, lbpAddress, record.vestingEscrow, tokensReceived, ethReceived);
    }

    /// @notice Finalizes the LBP phase and seals allocations.
    function finalizeLbp(address auctionAddress, address vestingEscrow_) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        if (record.lbpFinalized) revert AuctionAlreadyFinalized();
        address vestingTarget = record.vestingEscrow;
        if (vestingTarget == address(0)) {
            if (vestingEscrow_ == address(0)) revert EscrowZero();
            if (IVestingEscrow(vestingEscrow_).token() != record.saleToken) revert EscrowTokenMismatch();
            vestingTarget = vestingEscrow_;
            record.vestingEscrow = vestingEscrow_;
        } else {
            if (vestingEscrow_ != address(0) && vestingEscrow_ != vestingTarget) revert EscrowTokenMismatch();
            if (IVestingEscrow(vestingTarget).token() != record.saleToken) revert EscrowTokenMismatch();
        }

        ILBP(record.lbp).finalizeToVesting(vestingTarget);
        record.lbpFinalized = true;
    }

    /// @notice Burns all remaining LP tokens and returns ETH + tokens to SecureLBP.
    function unwindLbpAll(address auctionAddress) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).unwindAllLiquidity();
    }

    /// @notice Burns a percentage of LBP liquidity in basis points.
    function unwindLbpPartial(address auctionAddress, uint256 percentBP) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).unwindPartial(percentBP);
    }

    /// @notice Rebalances the remaining pool reserves to an approximate 50/50 value split.
    function rebalanceLbp5050(address auctionAddress) external payable onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).rebalanceTo5050{value: msg.value}();
    }

    /// @notice Sweeps ETH from SecureLBP to the configured treasury post-sale.
    function withdrawLbpEth(address auctionAddress, uint256 amount) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).withdrawETH(amount);
    }

    /// @notice Withdraws a specific amount of unsold tokens from SecureLBP to the treasury.
    function withdrawLbpTokens(address auctionAddress, uint256 amount) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).withdrawTokens(amount);
    }

    /// @notice Withdraws the entire unsold token balance held by SecureLBP to the treasury.
    function withdrawLbpAllTokens(address auctionAddress) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).withdrawAllTokens();
    }

    /// @notice Updates the oracle contract consumed by the LBP.
    function setLbpOracle(address auctionAddress, address oracle) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).setOracle(oracle);
    }

    /// @notice Updates the treasury address used for ETH withdrawals.
    function setLbpTreasury(address auctionAddress, address treasury_) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).setTreasury(treasury_);
    }

    /// @notice Adjusts the per-address contribution cap enforced by the LBP.
    function setLbpMaxContribution(address auctionAddress, uint256 cap) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).setMaxContributionPerAddress(cap);
    }

    /// @notice Recovers non-sale tokens accidentally sent to the LBP.
    function rescueLbpERC20(address auctionAddress, address erc20, address to, uint256 amount) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        ILBP(record.lbp).rescueERC20(erc20, to, amount);
    }

    /// @notice Withdraws remaining ETH proceeds from a managed auction to the desired recipient.
    function withdrawAuctionProceeds(address payable auctionAddress, address payable recipient) external onlyOwner {
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        if (recipient == address(0)) revert RecipientZero();
        IAuction auction = IAuction(auctionAddress);
        uint256 balanceBefore = auction.ethForTreasury();
        auction.withdrawTreasury(recipient);
        emit AuctionProceedsWithdrawn(auctionAddress, recipient, balanceBefore - auction.ethForTreasury());
    }

    /// @notice Returns the list of auctions deployed via this manager.
    function getAllAuctions() external view returns (address[] memory) {
        return _auctions;
    }

    /// @notice Reads stored bookkeeping information for a managed auction.
    function getAuctionRecord(address auctionAddress) external view returns (AuctionRecord memory) {
        return _records[auctionAddress];
    }

    /// @inheritdoc IPresaleManager
    function finalizePresale(
        address auctionAddress,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external override {
        AuctionRecord storage record = _records[auctionAddress];
        if (msg.sender != record.lbp) revert UnauthorizedCaller();
        if (!record.lbpInitialized) revert LbpNotLaunched();
        if (record.lbpFinalized) revert AuctionAlreadyFinalized();

        record.ethRaisedDuringLBP = ethAmount;
        record.lbpFinalized = true;

        emit LBPFinalized(auctionAddress, msg.sender, record.vestingEscrow, ethAmount, tokenAmount);
    }

    /// @inheritdoc IPresaleManager
    function notifyDemandCheck(address auction) external override {
        if (msg.sender != address(upkeepController)) revert UnauthorizedCaller();
        AuctionRecord storage record = _records[auction];
        if (!record.demandCheckTriggered) {
            record.demandCheckTriggered = true;
            emit AuctionDemandCheckExecuted(auction);
        }
    }

    /// @inheritdoc IPresaleManager
    function handleDemandCheck(address auction) external override {
        if (msg.sender != address(upkeepController)) revert UnauthorizedCaller();
        IAuction(auction).updateDynamicReserve();
    }

    /// @notice Manually executes the demand check through the upkeep controller.
    function checkAndAdjustAuction(address auctionAddress) external onlyOwner {
        if (!isManagedAuction[auctionAddress]) revert UnknownAuction();
        upkeepController.executeDemandCheck(auctionAddress);
    }

    /// @notice Enables or disables keeper-based demand checks via the controller.
    function setKeeperEnabled(bool enabled) external onlyOwner {
        upkeepController.setKeeperEnabled(enabled);
        emit KeeperEnabledUpdated(enabled);
    }

    /// @inheritdoc IAutomationCompatible
    function checkUpkeep(bytes calldata data)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        return IAutomationCompatible(address(upkeepController)).checkUpkeep(data);
    }

    /// @inheritdoc IAutomationCompatible
    function performUpkeep(bytes calldata data) external override {
        IAutomationCompatible(address(upkeepController)).performUpkeep(data);
    }

    function _ensureManagerInitialized() internal {
        if (managerInitialized) {
            if (address(auctionFactory) == address(0) || address(upkeepController) == address(0)) {
                revert ManagerNotInitialized();
            }
            return;
        }

        auctionFactory = IAuctionFactory(address(new AuctionFactory(address(this))));
        upkeepController = IUpkeepController(address(new UpkeepController(address(this))));
        managerInitialized = true;
    }

    function _prepareInitialStack(
        AuctionRecord storage record,
        address auctionAddress,
        LbpLaunchConfig calldata cfg
    ) internal returns (address payable lbpAddress, address vestingAddress) {
        if (cfg.startTime >= cfg.endTime) revert InvalidLbpTimes();
        lbpAddress = _deploySecureLBP(record, cfg, auctionAddress);

        TokenVestingEscrow escrow = new TokenVestingEscrow(record.saleToken, lbpAddress);
        record.vestingEscrow = address(escrow);

        return (lbpAddress, address(escrow));
    }

    function _deploySecureLBP(
        AuctionRecord storage record,
        LbpLaunchConfig calldata cfg,
        address auctionAddress
    ) private returns (address payable) {
        SecureLBP lbp = new SecureLBP(
            record.saleToken,
            cfg.startTime,
            cfg.endTime,
            record.treasury,
            cfg.poolStartWeightToken,
            cfg.poolEndWeightToken,
            cfg.poolSwapFee,
            address(this),
            auctionAddress
        );
        lbp.configureVesting(
            cfg.vestingStartTime,
            cfg.vestingCliffDuration,
            cfg.vestingFinalDuration,
            cfg.vestingCliffPercentBP
        );
        return payable(address(lbp));
    }

    receive() external payable {}
}
