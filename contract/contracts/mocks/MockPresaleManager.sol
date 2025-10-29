// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPresaleManager.sol";

contract MockPresaleManager is IPresaleManager {
    event FinalizeCalled(
        address auction,
        address vesting,
        uint256 ethAmount,
        uint256 tokenAmount
    );

    function finalizePresale(
        address auction,
        address vestingContract,
        address[] calldata,
        uint256[] calldata,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external override {
        emit FinalizeCalled(auction, vestingContract, ethAmount, tokenAmount);
    }

    receive() external payable {}
}
