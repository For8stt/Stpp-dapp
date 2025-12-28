// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract SecureLBPEvents {
    event BidPlaced(address indexed user, uint256 ethIn, uint256 netEth, uint256 feeBP, uint256 tokensBought);
    event PoolInitialized(address poolAddr);
    event OracleFeeUpdated(uint256 newFeeBP);
    event OraclePaused(uint256 untilTimestamp);
    event OracleResumed();
    event FinalizedToVesting(address vestingContract, uint256 totalTokens);
    event WithdrawnETH(address to, uint256 amount);
    event TreasurySet(address treasury);
    event OracleSet(address oracleAddr);
    event PoolFinalized(uint256 totalTokens, uint256 totalETH);
    event FullUnwindExecuted(uint256 ethRemoved, uint256 tokensRemoved);
    event PartialUnwindExecuted(uint256 percentBP, uint256 ethRemoved, uint256 tokensRemoved);
    event PoolRebalancedTo5050(uint256 ethAdded, uint256 tokensAdded);
    event TokensWithdrawn(address to, uint256 amount);
    event PostPauseDecayStarted(uint256 lastUnpauseTime, uint256 initialFeeBP);
    event LiquidityMigratedToUniswapV3(
        uint256 ethAmount,
        uint256 tokenAmount,
        uint24 feeTier,
        uint256 positionTokenId
    );
    event UniswapV3ConfigSet(
        address factory,
        address positionManager,
        address weth,
        uint24 defaultFeeTier
    );
}
