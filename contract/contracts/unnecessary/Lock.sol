// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Lock {
    uint256 public constant LOCK_DURATION = 2; // seconds

    event Withdrawal(address indexed to, uint256 amount, uint256 when);
    event Deposit(address indexed from, uint256 amount, uint256 when);

    mapping(address => uint256) public balances;
    mapping(address => uint256) public nextUnlockTime;

    constructor() payable {}

    function withdraw() external {
        uint256 userBalance = balances[msg.sender];
        require(userBalance > 0, "Nothing to withdraw");
        require(
            block.timestamp >= nextUnlockTime[msg.sender],
            "Funds are still locked"
        );

        balances[msg.sender] = 0;
        nextUnlockTime[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: userBalance}("");
        require(success, "Transfer failed");

        emit Withdrawal(msg.sender, userBalance, block.timestamp);
    }

    function deposit() external payable {
        require(msg.value > 0, "Deposit amount must be greater than zero");

        balances[msg.sender] += msg.value;
        nextUnlockTime[msg.sender] = block.timestamp + LOCK_DURATION;

        emit Deposit(msg.sender, msg.value, block.timestamp);
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function getUnlockTime(address user) external view returns (uint256) {
        return nextUnlockTime[user];
    }
}
