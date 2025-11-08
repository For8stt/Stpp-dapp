// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RevertingOracle {
    function isPaused() external pure returns (bool) {
        return false;
    }

    function viewAdaptiveFee() external pure returns (uint256) {
        revert("oracle failure");
    }
}
