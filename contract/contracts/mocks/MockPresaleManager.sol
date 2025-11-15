// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPresaleManager.sol";

contract MockPresaleManager is IPresaleManager {
    event FinalizeCalled(
        address auction,
        uint256 ethAmount,
        uint256 tokenAmount
    );

    function finalizePresale(
        address auction,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external override {
        emit FinalizeCalled(auction, ethAmount, tokenAmount);
    }

    function notifyDemandCheck(address) external pure override {}

    function handleDemandCheck(address) external pure override {}

    receive() external payable {}
}
