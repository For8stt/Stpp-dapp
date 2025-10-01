// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IChainlinkPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract LBPOracle {
    // Chainlink price feed (token/ETH)
    IChainlinkPriceFeed public priceFeed;

    // Fee parameters
    uint256 public baseFeeBP = 100;     // 1%
    uint256 public maxFeeBP = 1000;     // 10%
    uint256 public lastComputedFeeBP;   // Store last computed fee

    // Pause mechanism
    uint256 public pausedUntil;
    uint256 public pauseDuration = 30 minutes;

    // Anomaly detection threshold (basis points, 10000 = 100%)
    uint256 public anomalyThresholdBP = 2000; // 20% change triggers pause

    // Price history (for volatility check)
    int256 public lastPrice;

    event PauseActivated(uint256 untilTimestamp);
    event FeeUpdated(uint256 baseFeeBP, uint256 maxFeeBP);
    event AnomalyThresholdUpdated(uint256 newThresholdBP);

    constructor(address _priceFeed) {
        require(_priceFeed != address(0), "zero price feed");
        priceFeed = IChainlinkPriceFeed(_priceFeed);

        (,int256 price,,,) = priceFeed.latestRoundData();
        lastPrice = price;
    }

    // ============ PRICE / FEE LOGIC ============
    function getLatestPrice() public view returns (int256) {
        (,int256 price,,,) = priceFeed.latestRoundData();
        return price;
    }

    /// @notice Compute adaptive fee based on price volatility
    function computeAdaptiveFee() external returns (uint256) {
        int256 priceNow = getLatestPrice();
        _checkForAnomaly(priceNow);

        uint256 feeBP = baseFeeBP;
        if (lastPrice > 0 && priceNow > 0) {
            uint256 lastPriceU = uint256(lastPrice);
            uint256 priceNowU = uint256(priceNow);
            if (priceNowU < (lastPriceU * (10000 - anomalyThresholdBP)) / 10000) {
                feeBP = maxFeeBP;
            }
        }

        lastPrice = priceNow;
        lastComputedFeeBP = feeBP; // Store the computed fee
        return feeBP;
    }

    /// @notice Returns current adaptive fee without changing state
    function viewAdaptiveFee() external view returns (uint256) {
        return lastComputedFeeBP; // Return stored fee
    }

    // ============ AUTOMATIC PAUSE ============
    function _checkForAnomaly(int256 priceNow) internal {
        if (lastPrice > 0 && priceNow > 0) {
            uint256 lastPriceU = uint256(lastPrice);
            uint256 priceNowU = uint256(priceNow);
            if (priceNowU < (lastPriceU * (10000 - anomalyThresholdBP)) / 10000) {
                pausedUntil = block.timestamp + pauseDuration;
                emit PauseActivated(pausedUntil);
            }
        }
    }

    function isPaused() external view returns (bool) {
        return block.timestamp < pausedUntil;
    }

    // ============ CONFIGURATION ============
    function setFeeBP(uint256 _baseFeeBP, uint256 _maxFeeBP) external {
        baseFeeBP = _baseFeeBP;
        maxFeeBP = _maxFeeBP;
        emit FeeUpdated(_baseFeeBP, _maxFeeBP);
    }

    function setAnomalyThreshold(uint256 _thresholdBP) external {
        anomalyThresholdBP = _thresholdBP;
        emit AnomalyThresholdUpdated(_thresholdBP);
    }

    function setPauseDuration(uint256 _duration) external {
        pauseDuration = _duration;
    }
}