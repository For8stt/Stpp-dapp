// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PriceTickLib
 * @notice Encapsulates clearing price calculations for the Dutch auction buckets.
 */
library PriceTickLib {
    struct ClearingData {
        uint256 clearingPrice;
        uint256 clearingTickIndex;
        uint256 tokensSold;
        uint256 totalRaised;
        uint256 filledAboveClearing;
        uint256 totalAtClearingTick;
        uint256 proRataNumerator;
        uint256 proRataDenominator;
    }

    function determineClearing(
        mapping(uint256 => uint256) storage bucketTotals,
        uint256[] storage priceTicks,
        uint256 tokensForSale
    ) internal view returns (ClearingData memory data) {
        uint256 cumulative;
        uint256 clearingIdx = type(uint256).max;
        uint256 len = priceTicks.length;

        for (uint256 i = 0; i < len; i++) {
            cumulative += bucketTotals[i];
            if (cumulative >= tokensForSale && clearingIdx == type(uint256).max) {
                clearingIdx = i;
                data.filledAboveClearing = cumulative - bucketTotals[i];
                data.totalAtClearingTick = bucketTotals[i];
            }
        }

        if (clearingIdx == type(uint256).max) {
            data.tokensSold = cumulative;
            if (len == 0) {
                data.clearingTickIndex = 0;
                data.clearingPrice = 0;
            } else {
                data.clearingTickIndex = len - 1;
                data.clearingPrice = priceTicks[len - 1];
            }
            // tokensSold is in wei, clearingPrice is in wei (ETH per token)
            // totalRaised in wei (ETH) = (tokensSold * clearingPrice) / 1e18
            data.totalRaised = (data.tokensSold * data.clearingPrice) / 1e18;
            return data;
        }

        data.clearingTickIndex = clearingIdx;
        data.clearingPrice = priceTicks[clearingIdx];
        data.tokensSold = tokensForSale;

        uint256 remaining = tokensForSale - data.filledAboveClearing;
        data.proRataNumerator = remaining;
        data.proRataDenominator = data.totalAtClearingTick;
        // tokensSold is in wei, clearingPrice is in wei (ETH per token)
        // totalRaised in wei (ETH) = (tokensSold * clearingPrice) / 1e18
        data.totalRaised = (data.tokensSold * data.clearingPrice) / 1e18;
    }
}
