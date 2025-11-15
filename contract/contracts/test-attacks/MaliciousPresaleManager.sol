// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPresaleManager.sol";

interface ISecureLBPMinimal {
    function finalizeToVesting(address vestingEscrow_) external;
}

contract MaliciousPresaleManager is IPresaleManager {
    address public reentryEscrow;

    function setReentryEscrow(address escrow) external {
        reentryEscrow = escrow;
    }

    function finalizePresale(address, uint256, uint256) external override {
        if (reentryEscrow != address(0)) {
            ISecureLBPMinimal(msg.sender).finalizeToVesting(reentryEscrow);
        }
    }
    function notifyDemandCheck(address) external pure override {}

    function handleDemandCheck(address) external pure override {}
}
