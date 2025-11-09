// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../oracle/LBPOracle.sol";

contract MockPriceFeed is IChainlinkPriceFeed {
    int256 private price;
    bool private anomaly;

    constructor(int256 _initialPrice) {
        price = _initialPrice;
        anomaly = false;
    }

    function setPrice(int256 _price) external {
        price = _price;
    }

    function setPriceAnomaly(bool _anomaly) external {
        anomaly = _anomaly;
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
        if (anomaly) {
            revert("Price anomaly detected");
        }
        return (0, price, block.timestamp, block.timestamp, 0);
    }
}
