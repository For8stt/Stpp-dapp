// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RevertingPositionManager
 * @notice Mock position manager that reverts on mint
 */
contract RevertingPositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    
    function createAndInitializePoolIfNecessary(
        address /* token0 */,
        address /* token1 */,
        uint24 /* fee */,
        uint160 /* sqrtPriceX96 */
    ) external pure returns (address pool) {
        return address(0x1); // Return non-zero to avoid pool creation failure
    }
    
    function mint(MintParams calldata /* params */) external pure returns (uint256, uint128, uint256, uint256) {
        revert("Mint failed");
    }
}

