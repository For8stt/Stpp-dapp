// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./LBPOracle.sol"; // щоб підтягнути інтерфейс IChainlinkPriceFeed

contract MockPriceFeed is IChainlinkPriceFeed {
    int256 private price;

    constructor(int256 _initialPrice) {
        price = _initialPrice;
    }

    function setPrice(int256 _price) external {
        price = _price;
    }

    function latestRoundData()
    external
    view
    override
    returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    )
    {
        return (0, price, block.timestamp, block.timestamp, 0);
    }
}
