import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { Contract } from "ethers";
import { safeContractCall } from "../utils/contractUtils";
import { ensureProvider } from "../services/web3/provider";
import allAbis from "../abi/allAbis.json";

const DEFAULT_TOKEN_SYMBOL = "TOKEN";

/**
 * Fetches auction data from contract
 */
export const useAuctionData = (auctionContract, managerContract = null, auctionAddress = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTokenSymbol = useCallback(async (tokenAddress) => {
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      return DEFAULT_TOKEN_SYMBOL;
    }

    try {
      const tokenAbi = allAbis.TestToken || [];
      if (tokenAbi.length === 0) return DEFAULT_TOKEN_SYMBOL;

      const provider = ensureProvider();
      const tokenContract = new Contract(tokenAddress, tokenAbi, provider);
      return await tokenContract.symbol().catch(() => DEFAULT_TOKEN_SYMBOL);
    } catch {
      return DEFAULT_TOKEN_SYMBOL;
    }
  }, []);

  const fetchPriceTicks = useCallback(async (contract, tickLength) => {
    const ticks = [];
    for (let i = 0; i < tickLength; i++) {
      const tick = await safeContractCall(() => contract.priceTicks(i), 0n);
      if (tick === null) break; // Stop on error
      ticks.push(tick);
    }
    return ticks;
  }, []);

  const fetchPriceBuckets = useCallback(async (contract, ticks) => {
    const buckets = [];
    for (let i = 0; i < ticks.length; i++) {
      const total = await safeContractCall(() => contract.priceBucketTotals(i), 0n);
      buckets.push({ index: i, price: ticks[i], total: total || 0n });
    }
    return buckets;
  }, []);

  const fetchData = useCallback(async () => {
    if (!auctionContract) {
      setData(null);
      return;
    }

    const isInitialLoad = data === null;
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const initialized = await safeContractCall(
        () => auctionContract.initialized(),
        false
      );

      if (!initialized) {
        console.log("Auction contract is not initialized yet");
        setData(null);
        setError("Auction contract is not initialized yet. Please wait for initialization.");
        if (isInitialLoad) {
          setLoading(false);
        }
        return;
      }

      const [
        startTime,
        commitEndTime,
        revealEndTime,
        tokensForSale,
        bonusReserve,
        bonusReserveRemaining,
        perAddressCap,
        softCap,
        treasury,
        saleTokenAddr,
        totalDepositCommitted,
        totalQtyRevealed,
        totalDepositsRevealed,
        finalized,
        successful,
        clearingPrice,
        clearingTickIndex,
        tokensSold,
        totalRaised,
        ethForTreasury,
        decayMultiplier,
        dynamicAdjustmentCount,
        thresholdLow,
        maxDecayMultiplier,
        priceTicksLength,
        lbpLaunched,
        lbpTokenRecipient,
        lbpStableRecipient,
        merkleRoot,
        nonRevealPenaltyBps,
        vestingStart,
        vestingDuration,
        initialCommitEndTime,
        earlyBonusPct,
        earlyBonusWindow,
        bonusMerkleRoot,
        bonusAllocationsCID,
        whitelistCID,
      ] = await Promise.all([
        safeContractCall(() => auctionContract.startTime(), 0n),
        safeContractCall(() => auctionContract.commitEndTime(), 0n),
        safeContractCall(() => auctionContract.revealEndTime(), 0n),
        safeContractCall(() => auctionContract.tokensForSale(), 0n),
        safeContractCall(() => auctionContract.bonusReserve(), 0n),
        safeContractCall(() => auctionContract.bonusReserveRemaining(), 0n),
        safeContractCall(() => auctionContract.perAddressCap(), 0n),
        safeContractCall(() => auctionContract.softCap(), 0n),
        safeContractCall(() => auctionContract.treasury(), ethers.ZeroAddress),
        safeContractCall(() => auctionContract.saleToken(), ethers.ZeroAddress),
        safeContractCall(() => auctionContract.totalDepositCommitted(), 0n),
        safeContractCall(() => auctionContract.totalQtyRevealed(), 0n),
        safeContractCall(() => auctionContract.totalDepositsRevealed(), 0n),
        safeContractCall(() => auctionContract.finalized(), false),
        safeContractCall(() => auctionContract.successful(), false),
        safeContractCall(() => auctionContract.clearingPrice(), 0n),
        safeContractCall(() => auctionContract.clearingTickIndex(), 0n),
        safeContractCall(() => auctionContract.tokensSold(), 0n),
        safeContractCall(() => auctionContract.totalRaised(), 0n),
        safeContractCall(() => auctionContract.ethForTreasury(), 0n),
        safeContractCall(() => auctionContract.decayMultiplier(), 0n),
        safeContractCall(() => auctionContract.dynamicAdjustmentCount(), 0n),
        safeContractCall(() => auctionContract.thresholdLow(), 0n),
        safeContractCall(() => auctionContract.maxDecayMultiplier(), 0n),
        safeContractCall(() => auctionContract.priceTicksLength(), 0n),
        safeContractCall(() => auctionContract.lbpLaunched(), false),
        safeContractCall(
          () => auctionContract.lbpTokenRecipient?.() || Promise.resolve(ethers.ZeroAddress),
          ethers.ZeroAddress
        ),
        safeContractCall(
          () => auctionContract.lbpStableRecipient?.() || Promise.resolve(ethers.ZeroAddress),
          ethers.ZeroAddress
        ),
        safeContractCall(() => auctionContract.merkleRoot(), ethers.ZeroHash),
        safeContractCall(() => auctionContract.nonRevealPenaltyBps(), 0n),
        safeContractCall(() => auctionContract.vestingStart(), 0n),
        safeContractCall(() => auctionContract.vestingDuration(), 0n),
        safeContractCall(() => auctionContract.initialCommitEndTime(), 0n),
        safeContractCall(() => auctionContract.earlyBonusPct(), 0n),
        safeContractCall(() => auctionContract.earlyBonusWindow(), 0n),
        safeContractCall(() => auctionContract.bonusMerkleRoot(), ethers.ZeroHash),
        safeContractCall(() => auctionContract.bonusAllocationsCID(), ""),
        safeContractCall(
          async () => {
            try {
              if (typeof auctionContract.whitelistCID === 'function') {
                return await auctionContract.whitelistCID();
              }
              return "";
            } catch {
              return "";
            }
          },
          ""
        ),
      ]);

      const tickLength = Number(priceTicksLength);
      const ticks = tickLength > 0 ? await fetchPriceTicks(auctionContract, tickLength) : [];
      const buckets = ticks.length > 0 ? await fetchPriceBuckets(auctionContract, ticks) : [];

      const tokenSymbol = await fetchTokenSymbol(saleTokenAddr);

      let demandCheckTime = 0;
      if (managerContract && auctionAddress) {
        try {
          const upkeepControllerAddr = await safeContractCall(
            () => managerContract.upkeepController(),
            ethers.ZeroAddress
          );
          if (upkeepControllerAddr && upkeepControllerAddr !== ethers.ZeroAddress) {
            const upkeepControllerAbi = allAbis.UpkeepController || [];
            if (upkeepControllerAbi.length > 0) {
              const provider = ensureProvider();
              const upkeepController = new Contract(upkeepControllerAddr, upkeepControllerAbi, provider);
              const checkTime = await safeContractCall(
                () => upkeepController.demandCheckTime(auctionAddress),
                0n
              );
              demandCheckTime = Number(checkTime);
            }
          }
        } catch (err) {
          console.warn("Failed to fetch demandCheckTime:", err);
        }
      }

      setData({
        startTime: Number(startTime),
        commitEndTime: Number(commitEndTime),
        revealEndTime: Number(revealEndTime),
        initialCommitEndTime: Number(initialCommitEndTime),
        tokensForSale,
        bonusReserve,
        bonusReserveRemaining,
        perAddressCap,
        softCap,
        treasury,
        saleToken: saleTokenAddr,
        tokenSymbol,
        totalDepositCommitted,
        totalQtyRevealed,
        totalDepositsRevealed,
        finalized,
        successful,
        clearingPrice,
        clearingTickIndex: Number(clearingTickIndex),
        tokensSold,
        totalRaised,
        ethForTreasury,
        decayMultiplier,
        dynamicAdjustmentCount: Number(dynamicAdjustmentCount),
        thresholdLow,
        maxDecayMultiplier,
        priceTicks: ticks,
        priceBuckets: buckets,
        lbpLaunched,
        lbpTokenRecipient,
        lbpStableRecipient,
        merkleRoot: merkleRoot || ethers.ZeroHash,
        nonRevealPenaltyBps,
        vestingStart: Number(vestingStart),
        vestingDuration: Number(vestingDuration),
        demandCheckTime,
        earlyBonusPct,
        earlyBonusWindow: Number(earlyBonusWindow),
        bonusMerkleRoot: bonusMerkleRoot || ethers.ZeroHash,
        bonusAllocationsCID: bonusAllocationsCID || "",
        whitelistCID: whitelistCID || "",
        auctionAddress: auctionAddress || null,
      });
    } catch (err) {
      console.error("Failed to fetch auction data:", err);
      setError(err.message || "Failed to load auction data");
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [auctionContract, managerContract, auctionAddress, data, fetchPriceTicks, fetchPriceBuckets, fetchTokenSymbol]);

  useEffect(() => {
    if (auctionContract) {
      fetchData();
    } else {
      setData(null);
      setError(null);
      setLoading(false);
    }
  }, [auctionContract, managerContract, auctionAddress, fetchData]);

  return {
    data,
    loading,
    error,
    fetchData,
    refetch: fetchData,
  };
};

