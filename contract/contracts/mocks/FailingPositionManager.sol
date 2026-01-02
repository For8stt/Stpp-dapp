// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FailingPositionManager
 * @notice Mock position manager that returns zero address for pool creation
 */
contract FailingPositionManager {
    function createAndInitializePoolIfNecessary(
        address /* token0 */,
        address /* token1 */,
        uint24 /* fee */,
        uint160 /* sqrtPriceX96 */
    ) external pure returns (address pool) {
        return address(0);
    }
}

