// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPresaleManager {
    function transitionToLBP(uint256 collectedETH, uint256 remainingTokens) external;
    function handleFailedAuction(uint256 collectedETH) external;
    function finalizePresale(address[] calldata beneficiaries, uint256[] calldata amounts) external;
}
