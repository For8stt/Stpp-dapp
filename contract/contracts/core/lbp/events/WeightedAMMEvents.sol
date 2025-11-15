// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract WeightedAMMEvents {
    event LiquidityAdded(address indexed user, uint256 tokenAmount, uint256 ethAmount, uint256 lpMinted);
    event LiquidityAddedSingle(address indexed user, uint256 tokenAmount, uint256 ethAmount, uint256 lpMinted);
    event LiquidityRemoved(address indexed user, uint256 tokenAmount, uint256 ethAmount, uint256 lpBurned);
    event SwapTokenForETH(address indexed user, uint256 tokenIn, uint256 ethOut, uint256 feeAmount);
    event SwapETHForToken(address indexed user, uint256 ethIn, uint256 tokenOut, uint256 feeAmount);
}
