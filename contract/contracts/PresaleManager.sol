// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DutchAuction.sol";
import "./SecureLBP.sol";
import "./interfaces/IPresaleManager.sol";

/// @title PresaleManager
/// @notice Coordinates the full presale pipeline (Dutch auction → LBP → vesting).
contract PresaleManager is Ownable, IPresaleManager {
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
        uint256 vestingStart;
        uint256 vestingCliff;
        uint256 vestingDuration;
        bytes32 merkleRoot;
        uint256[] priceTicks;
    }

    struct LbpLaunchConfig {
        uint256 startTime;
        uint256 commitEnd;
        uint256 revealEnd;
        uint256 poolStartWeightToken;
        uint256 poolEndWeightToken;
        uint256 poolSwapFee;
        address vesting;
    }

    struct AuctionRecord {
        address saleToken;
        address treasury;
        address payable lbp;
        address vesting;
        bool finalized;
        bool lbpInitialized;
        bool vestingFinalized;
        uint256 tokensForSale;
        uint256 bonusReserve;
        uint256 clearingPrice;
        uint256 tokensSold;
        uint256 totalRaised;
        uint256 unsoldTokens;
        uint256 lbpEthProvided;
        uint256 lbpTokensProvided;
        uint256 ethDeliveredToVesting;
        uint256 tokensDeliveredToVesting;
    }

    address[] private _auctions;
    mapping(address => bool) public isManagedAuction;
    mapping(address => AuctionRecord) private _records;

    event AuctionCreated(address indexed auction, address indexed saleToken, uint256 tokensForSale);
    event AuctionFinalized(
        address indexed auction,
        bool successful,
        uint256 clearingPrice,
        uint256 tokensSold,
        uint256 totalRaised
    );
    event LBPInitialized(
        address indexed auction,
        address indexed lbp,
        address indexed vesting,
        uint256 tokenAmount,
        uint256 ethAmount
    );
    event LBPFinalized(
        address indexed auction,
        address indexed lbp,
        address indexed vesting,
        uint256 ethAmount,
        uint256 tokenAmount
    );
    event AuctionProceedsWithdrawn(address indexed auction, address indexed recipient, uint256 amount);

    /// @notice Deploys and configures a new Dutch auction under manager control.
    function createAuction(AuctionInput calldata params) external onlyOwner returns (address auctionAddress) {
        require(params.saleToken != address(0), "saleToken zero");
        require(params.treasury != address(0), "treasury zero");
        require(params.priceTicks.length > 0, "priceTicks empty");

        DutchAuction auction = new DutchAuction(IERC20(params.saleToken), address(this));

        DutchAuction.AuctionConfig memory config = DutchAuction.AuctionConfig({
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
            vestingCliff: params.vestingCliff,
            vestingDuration: params.vestingDuration,
            treasury: params.treasury,
            lbpTokenRecipient: address(this),
            lbpStableRecipient: payable(address(this)),
            merkleRoot: params.merkleRoot,
            priceTicks: params.priceTicks
        });

        auction.initializeAuction(config);

        auctionAddress = address(auction);
        require(!isManagedAuction[auctionAddress], "auction exists");
        isManagedAuction[auctionAddress] = true;
        _auctions.push(auctionAddress);

        AuctionRecord storage record = _records[auctionAddress];
        record.saleToken = params.saleToken;
        record.treasury = params.treasury;
        record.tokensForSale = params.tokensForSale;
        record.bonusReserve = params.bonusReserve;

        emit AuctionCreated(auctionAddress, params.saleToken, params.tokensForSale);
    }

    /// @notice Invokes finalization on a managed Dutch auction after reveal window closes.
    function finalizeAuction(address payable auctionAddress) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        require(isManagedAuction[auctionAddress], "unknown auction");
        require(!record.finalized, "already finalized");

        DutchAuction auction = DutchAuction(auctionAddress);
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
        require(isManagedAuction[auctionAddress], "unknown auction");
        require(record.finalized, "auction not finalized");
        require(!record.lbpInitialized, "lbp already launched");
        require(cfg.vesting != address(0), "vesting zero");
        require(cfg.startTime < cfg.commitEnd && cfg.commitEnd < cfg.revealEnd, "invalid lbp times");

        uint256 tokenBalanceBefore = IERC20(record.saleToken).balanceOf(address(this));
        uint256 ethBalanceBefore = address(this).balance;
        DutchAuction(auctionAddress).launchLbp();
        uint256 tokensReceived = IERC20(record.saleToken).balanceOf(address(this)) - tokenBalanceBefore;
        uint256 ethReceived = address(this).balance - ethBalanceBefore;
        require(tokensReceived > 0, "no tokens received");
        require(ethReceived > 0, "no eth received");

        address payable deployedLbp = _deploySecureLBP(record, cfg, auctionAddress);

        IERC20(record.saleToken).safeTransfer(deployedLbp, tokensReceived);
        SecureLBP(deployedLbp).initPoolFromAuction{value: ethReceived}(tokensReceived);

        record.lbp = deployedLbp;
        record.vesting = cfg.vesting;
        record.lbpInitialized = true;
        record.lbpTokensProvided = tokensReceived;
        record.lbpEthProvided = ethReceived;

        lbpAddress = address(deployedLbp);
        emit LBPInitialized(auctionAddress, lbpAddress, cfg.vesting, tokensReceived, ethReceived);
    }

    /// @notice Finalizes the LBP phase and routes allocations to the configured vesting contract.
    function finalizeLbp(address auctionAddress, address[] calldata beneficiaries) external onlyOwner {
        AuctionRecord storage record = _records[auctionAddress];
        require(isManagedAuction[auctionAddress], "unknown auction");
        require(record.lbpInitialized, "lbp not launched");
        require(!record.vestingFinalized, "already finalized");
        require(record.vesting != address(0), "vesting not set");

        SecureLBP(record.lbp).finalizeToVesting(record.vesting, beneficiaries);
    }

    /// @notice Withdraws remaining ETH proceeds from a managed auction to the desired recipient.
    function withdrawAuctionProceeds(address payable auctionAddress, address payable recipient) external onlyOwner {
        require(isManagedAuction[auctionAddress], "unknown auction");
        require(recipient != address(0), "recipient zero");

        DutchAuction auction = DutchAuction(auctionAddress);
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
        address vestingContract,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external override {
        AuctionRecord storage record = _records[auctionAddress];
        require(msg.sender == record.lbp, "unauthorised caller");
        require(record.lbpInitialized, "lbp not launched");
        require(!record.vestingFinalized, "already finalized");
        require(beneficiaries.length == amounts.length, "length mismatch");

        if (record.vesting == address(0)) {
            record.vesting = vestingContract;
        } else {
            require(record.vesting == vestingContract, "vesting mismatch");
        }

        record.vestingFinalized = true;
        record.ethDeliveredToVesting = ethAmount;
        record.tokensDeliveredToVesting = tokenAmount;

        emit LBPFinalized(auctionAddress, msg.sender, vestingContract, ethAmount, tokenAmount);
    }

    function _deploySecureLBP(
        AuctionRecord storage record,
        LbpLaunchConfig calldata cfg,
        address auctionAddress
    ) private returns (address payable) {
        SecureLBP lbp = new SecureLBP(
            record.saleToken,
            cfg.startTime,
            cfg.commitEnd,
            cfg.revealEnd,
            record.treasury,
            cfg.poolStartWeightToken,
            cfg.poolEndWeightToken,
            cfg.poolSwapFee,
            address(this),
            auctionAddress
        );
        return payable(address(lbp));
    }

    receive() external payable {}
}
