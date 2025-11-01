// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IKeeperCompatible {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

/**
 * @title MockKeeper
 * @notice Lightweight helper used to simulate Chainlink Keepers in local tests.
 */
contract MockKeeper {
    IKeeperCompatible public immutable manager;

    constructor(address manager_) {
        require(manager_ != address(0), "manager zero");
        manager = IKeeperCompatible(manager_);
    }

    function checkAndPerform(bytes calldata checkData) external {
        (bool upkeepNeeded, bytes memory performData) = manager.checkUpkeep(checkData);
        if (upkeepNeeded) {
            manager.performUpkeep(performData);
        }
    }
}
