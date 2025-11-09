// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IAuction.sol";
import "../interfaces/IAutomationCompatible.sol";
import "../interfaces/IPresaleManager.sol";
import "../interfaces/IUpkeepController.sol";

/**
 * @title UpkeepController
 * @notice Handles Chainlink keeper automation for auction demand checks.
 */
contract UpkeepController is Ownable, IAutomationCompatible, IUpkeepController {
    uint256 private constant DEMAND_CHECK_GRACE = 30 minutes;

    struct DemandConfig {
        uint256 checkTime;
        bool triggered;
    }

    IPresaleManager public immutable manager;

    bool public keeperEnabled = true;
    bool private keeperConfigFrozen;

    address[] private monitoredAuctions;
    mapping(address => DemandConfig) private demandConfigs;
    mapping(address => bool) public isRegistered;

    event AuctionRegistered(address indexed auction, uint256 demandCheckTime);
    event DemandCheckExecuted(address indexed auction);
    event KeeperEnabledUpdated(bool enabled);

    constructor(address manager_) {
        require(manager_ != address(0), "manager zero");
        manager = IPresaleManager(manager_);
        _transferOwnership(manager_);
    }

    /// @inheritdoc IUpkeepController
    function registerAuction(address auction, uint256 demandCheckTime) external override onlyOwner {
        require(auction != address(0), "auction zero");
        require(!isRegistered[auction], "already registered");

        isRegistered[auction] = true;
        demandConfigs[auction] = DemandConfig({checkTime: demandCheckTime, triggered: false});
        monitoredAuctions.push(auction);
        keeperConfigFrozen = true;

        emit AuctionRegistered(auction, demandCheckTime);
    }

    /// @inheritdoc IUpkeepController
    function updateDemandCheckTime(address auction, uint256 newTime) external override onlyOwner {
        require(isRegistered[auction], "unknown auction");
        demandConfigs[auction].checkTime = newTime;
    }

    /// @inheritdoc IUpkeepController
    function setKeeperEnabled(bool enabled) external override onlyOwner {
        require(!keeperConfigFrozen, "keepers frozen");
        keeperEnabled = enabled;
        emit KeeperEnabledUpdated(enabled);
    }

    /// @inheritdoc IUpkeepController
    function executeDemandCheck(address auction) public override onlyOwner {
        require(isRegistered[auction], "unknown auction");
        _executeDemandCheck(auction, true);
    }

    /// @inheritdoc IUpkeepController
    function demandCheckTriggered(address auction) external view override returns (bool) {
        return demandConfigs[auction].triggered;
    }

    /// @inheritdoc IUpkeepController
    function demandCheckTime(address auction) external view override returns (uint256) {
        return demandConfigs[auction].checkTime;
    }

    /// @inheritdoc IAutomationCompatible
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (!keeperEnabled) {
            return (false, bytes(""));
        }

        uint256 len = monitoredAuctions.length;
        for (uint256 i = 0; i < len; ++i) {
            address auctionAddr = monitoredAuctions[i];
            if (_shouldTriggerDemandCheck(auctionAddr)) {
                return (true, abi.encode(auctionAddr));
            }
        }

        return (false, bytes(""));
    }

    /// @inheritdoc IAutomationCompatible
    function performUpkeep(bytes calldata performData) external override {
        require(keeperEnabled, "keeper disabled");
        address auctionAddr = abi.decode(performData, (address));
        require(isRegistered[auctionAddr], "unknown auction");
        _executeDemandCheck(auctionAddr, true);
    }

    function _executeDemandCheck(address auctionAddr, bool enforce) private {
        if (enforce) {
            require(_shouldTriggerDemandCheck(auctionAddr), "conditions not met");
        } else if (!_shouldTriggerDemandCheck(auctionAddr)) {
            return;
        }

        manager.handleDemandCheck(auctionAddr);
        demandConfigs[auctionAddr].triggered = true;
        manager.notifyDemandCheck(auctionAddr);

        emit DemandCheckExecuted(auctionAddr);
    }

    function _shouldTriggerDemandCheck(address auctionAddr) private view returns (bool) {
        DemandConfig storage config = demandConfigs[auctionAddr];
        if (!isRegistered[auctionAddr]) return false;
        if (config.triggered) return false;
        if (config.checkTime == 0 || block.timestamp < config.checkTime) return false;
        if (block.timestamp > config.checkTime + DEMAND_CHECK_GRACE) return false;

        IAuction auction = IAuction(auctionAddr);
        if (auction.finalized()) return false;
        if (block.timestamp > auction.commitEndTime()) return false;
        if (auction.dynamicAdjustmentCount() > 0) return false;
        if (auction.totalDepositCommitted() >= auction.thresholdLow()) return false;
        return true;
    }
}
