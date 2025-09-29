// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TestVesting {
    mapping(address => uint256) public allocations;

    function registerAllocations(address[] calldata users, uint256[] calldata amounts) external {
        require(users.length == amounts.length, "len mismatch");
        for (uint256 i = 0; i < users.length; i++) {
            allocations[users[i]] += amounts[i];
        }
    }
}
