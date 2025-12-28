// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILBP
 * @notice Interface for the SecureLBP contract handling LBP trading and vesting handoff.
 */
interface ILBP {
    function initPoolFromAuction(uint256 tokenAmount) external payable;

    function configureVesting(
        uint256 start,
        uint256 cliffDuration,
        uint256 finalDuration,
        uint256 cliffPercentBP
    ) external;

    function finalizeToVesting(address vestingEscrow) external;

    function unwindAllLiquidity() external;

    function unwindPartial(uint256 percentBP) external;

    function rebalanceTo5050() external payable;

    function withdrawETH(uint256 amount) external;

    function withdrawTokens(uint256 amount) external;

    function withdrawAllTokens() external;

    function setOracle(address oracle) external;

    function setTreasury(address treasury) external;

    function setMaxContributionPerAddress(uint256 cap) external;

    function rescueERC20(address erc20, address to, uint256 amount) external;

    function setUniswapV3Config(
        address _factory,
        address _positionManager,
        address _weth,
        uint24 _defaultFeeTier
    ) external;

    function migrateLiquidityToUniswapV3(
        uint256 ethAmount,
        uint256 tokenAmount,
        uint24 feeTier,
        uint160 sqrtPriceX96,
        int24 tickLower,
        int24 tickUpper,
        address lpRecipient
    ) external;

    function token() external view returns (address);
}
