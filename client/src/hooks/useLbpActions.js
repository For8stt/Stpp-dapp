import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { Contract } from "ethers";
import { ensureProvider } from "../services/web3/provider";
import { ensureSigner } from "../services/web3/signer";
import { useTransaction } from "./useTransaction";
import { handleTxError } from "../utils/txErrorHandler";
import allAbis from "../abi/allAbis.json";

export const useLbpActions = (lbpAddress, lbpData, poolData, account, weights, reserves, adaptiveFee, refetchLbpData, refetchUserData) => {
  const tx = useTransaction();

  const [bidForm, setBidForm] = useState({
    ethAmount: "",
    slippage: "1",
    minTokensOut: "",
  });

  const calculateExpectedTokens = useCallback(
    async (ethAmount) => {
      if (!poolData || !lbpData || !ethAmount || ethAmount === "0") {
        setBidForm((prev) => ({ ...prev, minTokensOut: "" }));
        return;
      }

      try {
        const provider = ensureProvider();
        if (!provider) return;

        const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
          ? allAbis.LBPWeightedAMM
          : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;
        const ammContract = new Contract(lbpData.amm, ammAbi, provider);

        const ethAmountWei = ethers.parseEther(ethAmount);
        const feeBP = (adaptiveFee !== null && adaptiveFee !== undefined)
          ? BigInt(adaptiveFee)
          : (lbpData.currentFee || 0n);
        const BP_SCALE = 10000n;
        
        const secureLBPFee = (ethAmountWei * feeBP) / BP_SCALE;
        const netValue = ethAmountWei - secureLBPFee;

        let tokensOut = 0n;
        try {
          tokensOut = await ammContract.quoteETHForToken(netValue).catch(() => {
            const currentReserveETH = reserves?.eth !== null && reserves?.eth !== undefined ? reserves.eth : poolData.reserveETH;
            const currentReserveToken = reserves?.token !== null && reserves?.token !== undefined ? reserves.token : poolData.reserveToken;
            const currentTokenWeight = weights?.token !== null && weights?.token !== undefined ? weights.token : poolData.tokenWeight;
            const currentEthWeight = weights?.eth !== null && weights?.eth !== undefined ? weights.eth : poolData.ethWeight;
            
            const reserveETHNum = Number(ethers.formatEther(currentReserveETH));
            const reserveTokenNum = Number(
              ethers.formatUnits(currentReserveToken, lbpData.tokenInfo?.decimals || 18)
            );
            const tokenWeightNum = Number(ethers.formatEther(currentTokenWeight));
            const ethWeightNum = Number(ethers.formatEther(currentEthWeight));

            if (reserveTokenNum > 0 && ethWeightNum > 0 && netValue > 0n) {
              const netValueNum = Number(ethers.formatEther(netValue));
              const k = Math.pow(reserveETHNum, ethWeightNum) * Math.pow(reserveTokenNum, tokenWeightNum);
              const newReserveETH = reserveETHNum + netValueNum;
              const newReserveToken = Math.pow(k / Math.pow(newReserveETH, ethWeightNum), 1 / tokenWeightNum);
              const tokensOutNum = reserveTokenNum - newReserveToken;
              return ethers.parseUnits(tokensOutNum.toString(), lbpData.tokenInfo?.decimals || 18);
            }
            return 0n;
          });
        } catch (err) {
          console.warn("Could not get quote:", err);
          return;
        }

        const slippageBps = BigInt(Math.floor(Number(bidForm.slippage) * 100));
        const minTokensOut = (tokensOut * (10000n - slippageBps)) / 10000n;

        setBidForm((prev) => ({
          ...prev,
          minTokensOut: ethers.formatUnits(
            minTokensOut,
            lbpData.tokenInfo?.decimals || 18
          ),
        }));
      } catch (err) {
        console.warn("Could not calculate expected tokens:", err);
        setBidForm((prev) => ({ ...prev, minTokensOut: "" }));
      }
    },
    [poolData, lbpData, bidForm.slippage, weights, reserves, adaptiveFee]
  );

  const handleBidFormChange = useCallback((field, value) => {
    setBidForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    if (bidForm.ethAmount) {
      calculateExpectedTokens(bidForm.ethAmount);
    }
  }, [bidForm.ethAmount, bidForm.slippage, calculateExpectedTokens]);

  const handlePlaceBid = useCallback(async () => {
    if (!lbpData || !poolData || !account) {
      handleTxError(new Error("Please connect your wallet"));
      return;
    }

    if (!bidForm.ethAmount || bidForm.ethAmount === "0") {
      handleTxError(new Error("Please enter ETH amount"));
      return;
    }

    if (!bidForm.minTokensOut) {
      handleTxError(new Error("Please wait for token calculation"));
      return;
    }

    const poolAddr = lbpData?.amm || lbpData?.pool;

    try {
      const provider = ensureProvider();
      if (!provider) {
        throw new Error("No wallet provider");
      }

      const lbpAbi = Array.isArray(allAbis.SecureLBP)
        ? allAbis.SecureLBP
        : allAbis.SecureLBP?.abi || allAbis.SecureLBP;
      const lbpContractRead = new Contract(lbpAddress, lbpAbi, provider);

      const poolInitialized = await lbpContractRead.poolInitialized().catch(() => false);
      if (!poolInitialized) {
        handleTxError(new Error("Pool is not initialized yet"));
        return;
      }

      const currentBlock = await provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
      if (currentTime < lbpData.startTime) {
        const timeUntilStart = lbpData.startTime - currentTime;
        const hours = Math.floor(timeUntilStart / 3600);
        const minutes = Math.floor((timeUntilStart % 3600) / 60);
        handleTxError(new Error(`LBP has not started yet. Starts in ${hours}h ${minutes}m`));
        return;
      }
      if (currentTime > lbpData.endTime) {
        handleTxError(new Error("LBP trading window has ended"));
        return;
      }

      const paused = await lbpContractRead.paused().catch(() => false);
      if (paused) {
        handleTxError(new Error("LBP is currently paused"));
        return;
      }

      if (lbpData.oraclePaused) {
        handleTxError(new Error("LBP is paused by oracle"));
        return;
      }

      const ethAmountWei = ethers.parseEther(bidForm.ethAmount);
      const currentContribution = await lbpContractRead.totalContributed(account).catch(() => 0n);
      const newContribution = currentContribution + ethAmountWei;
      const maxContribution = lbpData.maxContributionPerAddress || 0n;
      
      if (maxContribution > 0n && newContribution > maxContribution) {
        const remaining = maxContribution > currentContribution ? maxContribution - currentContribution : 0n;
        handleTxError(
          new Error(
            `Contribution cap exceeded. Maximum: ${ethers.formatEther(maxContribution)} ETH. ` +
            `You can contribute up to ${ethers.formatEther(remaining)} ETH more.`
          )
        );
        return;
      }

      const finalized = await lbpContractRead.finalized().catch(() => false);
      if (finalized) {
        handleTxError(new Error("LBP has been finalized. Trading is no longer available"));
        return;
      }

      const feeBP = await lbpContractRead.currentFeeBP().catch(() => 0n);
      const BP_SCALE = 10000n;
      const fee = (ethAmountWei * feeBP) / BP_SCALE;
      const netValue = ethAmountWei - fee;
      
      if (netValue === 0n) {
        handleTxError(new Error("ETH amount is too small. After fees, net value would be zero"));
        return;
      }

      const minTokensOutWei = ethers.parseUnits(
        bidForm.minTokensOut,
        lbpData.tokenInfo?.decimals || 18
      );

      if (minTokensOutWei === 0n) {
        handleTxError(new Error("Minimum tokens out cannot be zero"));
        return;
      }

      try {
        const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
          ? allAbis.LBPWeightedAMM
          : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;
        const ammContract = new Contract(lbpData.amm, ammAbi, provider);
        const expectedTokens = await ammContract.quoteETHForToken(netValue).catch(() => 0n);
        
        if (expectedTokens === 0n) {
          handleTxError(new Error("Cannot get quote from pool. Pool may be empty or invalid"));
          return;
        }

        if (expectedTokens < minTokensOutWei) {
          handleTxError(
            new Error(
              `Slippage too high. Expected: ${ethers.formatUnits(expectedTokens, lbpData.tokenInfo?.decimals || 18)}, ` +
              `Minimum: ${bidForm.minTokensOut}. Try increasing slippage tolerance.`
            )
          );
          return;
        }
      } catch (quoteErr) {
        console.warn("Could not verify quote, proceeding anyway:", quoteErr);
      }

      if (lbpData.oracle && lbpData.oracle !== ethers.ZeroAddress && poolAddr && poolAddr !== ethers.ZeroAddress) {
        try {
          const oracleAbi = [
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "isPaused",
              outputs: [{ name: "", type: "bool" }],
              type: "function",
            },
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "pausedUntilForPool",
              outputs: [{ name: "", type: "uint256" }],
              type: "function",
            },
          ];
          const oracleContract = new Contract(lbpData.oracle, oracleAbi, provider);
          const oraclePaused = await oracleContract.isPaused(poolAddr);
          if (oraclePaused) {
            const pausedUntilBigInt = await oracleContract.pausedUntilForPool(poolAddr);
            const pausedUntil = Number(pausedUntilBigInt);
            const currentBlock = await provider.getBlock("latest").catch(() => null);
            const currentBlockTimestamp = currentBlock ? currentBlock.timestamp : Math.floor(Date.now() / 1000);
            const remaining = pausedUntil > 0 ? pausedUntil - currentBlockTimestamp : 0;
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            
            handleTxError(
              new Error(`OraclePausedError`),
              `Trading is paused by Oracle due to rapid price movement. Please wait ${minutes}m ${seconds}s before placing another bid.`
            );
            return;
          }
        } catch (oracleCheckErr) {
          console.warn("Could not check oracle pause status before transaction:", oracleCheckErr);
        }
      }

      const signer = await ensureSigner();
      const lbpContract = new Contract(lbpAddress, lbpAbi, signer);

      await tx.execute(
        async () => {
          return await lbpContract.placeBid(minTokensOutWei, { value: ethAmountWei });
        },
        {
          pendingMessage: "Placing bid…",
          successMessage: "Bid placed successfully!",
          errorMessage: "Bid placement failed",
          onSuccess: async () => {
            setBidForm({ ethAmount: "", slippage: "1", minTokensOut: "" });
            await new Promise(resolve => setTimeout(resolve, 4000));
            await refetchLbpData();
            await new Promise(resolve => setTimeout(resolve, 3000));
            await refetchLbpData();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await refetchLbpData();
            await refetchUserData();
          },
        }
      );
    } catch (err) {
      let isOraclePaused = false;
      let oraclePauseMessage = null;
      const errorString = JSON.stringify(err || {});
      const checkNestedError = (errObj, depth = 0) => {
        if (depth > 5) return false; // Prevent infinite recursion
        if (!errObj) return false;
        
        const checks = [
          errObj?.reason === "OraclePausedError",
          errObj?.name === "OraclePausedError",
          errObj?.message?.includes("OraclePausedError"),
          errObj?.message?.includes("OraclePaused"), // Also check without "Error"
          errObj?.error && checkNestedError(errObj.error, depth + 1),
          errObj?.info?.error && checkNestedError(errObj.info.error, depth + 1),
          errObj?.info?.error?.message && errObj.info.error.message.includes("OraclePausedError"), // Direct check
          errObj?.info?.error?.message && errObj.info.error.message.includes("OraclePaused"), // Direct check
        ];
        
        return checks.some(Boolean);
      };
      const errorStringLower = errorString?.toLowerCase() || "";
      const hasOraclePausedInString = errorStringLower.includes("oraclepausederror") || 
                                      errorStringLower.includes("oracle paused") ||
                                      errorString?.includes("OraclePausedError") ||
                                      errorString?.includes("OraclePaused");
      
      if (checkNestedError(err) || hasOraclePausedInString) {
        isOraclePaused = true;
      }
      if ((!isOraclePaused || hasOraclePausedInString) && lbpData?.oracle && lbpData?.oracle !== ethers.ZeroAddress && poolAddr && poolAddr !== ethers.ZeroAddress) {
        try {
          const oracleAbi = [
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "isPaused",
              outputs: [{ name: "", type: "bool" }],
              type: "function",
            },
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "pausedUntilForPool",
              outputs: [{ name: "", type: "uint256" }],
              type: "function",
            },
          ];
          const provider = ensureProvider();
          if (provider) {
            const oracleContract = new Contract(lbpData.oracle, oracleAbi, provider);
            const paused = await oracleContract.isPaused(poolAddr);
            if (paused) {
              isOraclePaused = true;
              const pausedUntilBigInt = await oracleContract.pausedUntilForPool(poolAddr);
              const pausedUntil = Number(pausedUntilBigInt);
              const currentBlock = await provider.getBlock("latest").catch(() => null);
              const currentBlockTimestamp = currentBlock ? currentBlock.timestamp : Math.floor(Date.now() / 1000);
              const remaining = pausedUntil > 0 ? pausedUntil - currentBlockTimestamp : 0;
              const minutes = Math.floor(remaining / 60);
              const seconds = remaining % 60;
              if (pausedUntil > 0 && remaining > 0) {
                oraclePauseMessage = `Trading is paused by Oracle due to rapid price movement. Please wait ${minutes}m ${seconds}s before placing another bid.`;
              } else {
                oraclePauseMessage = `Trading is paused by Oracle due to rapid price movement. Please wait for the pause to end before placing another bid.`;
              }
            }
          }
        } catch (oracleCheckErr) {
          console.warn("Could not check oracle pause status after error:", oracleCheckErr);
        }
      }
      
      if (isOraclePaused) {
        try {
          await refetchLbpData(true); // Force immediate refetch
          await new Promise(resolve => setTimeout(resolve, 1000));
          await refetchLbpData(true); // Force immediate refetch again
        } catch (refetchErr) {
          console.warn("Could not refetch LBP data after oracle pause error:", refetchErr);
        }
        
        handleTxError(
          err,
          oraclePauseMessage || "Trading is paused by Oracle due to rapid price movement. Please wait for the pause to end before placing another bid."
        );
        return;
      }
      
      let errorMessage = err?.message || "Failed to place bid";
      
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      } else if (err?.error?.error?.message) {
        errorMessage = err.error.error.message;
      }
      if (errorMessage.includes("missing revert data") || errorMessage.includes("CALL_EXCEPTION")) {
        const errorStringLower = errorString.toLowerCase();
        const hasOraclePausedInString = errorStringLower.includes("oraclepausederror") || 
                                        errorStringLower.includes("oracle paused");
        
        if (hasOraclePausedInString || (lbpData?.oracle && lbpData?.oracle !== ethers.ZeroAddress && poolAddr && poolAddr !== ethers.ZeroAddress)) {
          try {
            const oracleAbi = [
              {
                constant: true,
                inputs: [{ name: "lbpPool", type: "address" }],
                name: "isPaused",
                outputs: [{ name: "", type: "bool" }],
                type: "function",
              },
              {
                constant: true,
                inputs: [{ name: "lbpPool", type: "address" }],
                name: "pausedUntilForPool",
                outputs: [{ name: "", type: "uint256" }],
                type: "function",
              },
            ];
            const provider = ensureProvider();
            if (provider) {
              const oracleContract = new Contract(lbpData.oracle, oracleAbi, provider);
              const paused = await oracleContract.isPaused(poolAddr);
              if (paused || hasOraclePausedInString) {
                let pauseMessage = "Trading is paused by Oracle due to rapid price movement. Please wait for the pause to end before placing another bid.";
                if (paused) {
                  try {
                    const pausedUntilBigInt = await oracleContract.pausedUntilForPool(poolAddr);
                    const pausedUntil = Number(pausedUntilBigInt);
                    const currentBlock = await provider.getBlock("latest").catch(() => null);
                    const currentBlockTimestamp = currentBlock ? currentBlock.timestamp : Math.floor(Date.now() / 1000);
                    const remaining = pausedUntil > 0 ? pausedUntil - currentBlockTimestamp : 0;
                    if (remaining > 0) {
                      const minutes = Math.floor(remaining / 60);
                      const seconds = remaining % 60;
                      pauseMessage = `Trading is paused by Oracle due to rapid price movement. Please wait ${minutes}m ${seconds}s before placing another bid.`;
                    }
                  } catch (pauseTimeErr) {
                  }
                }
                handleTxError(err, pauseMessage);
                return;
              }
            }
          } catch (oracleCheckErr) {
            if (hasOraclePausedInString) {
              handleTxError(err, "Trading is paused by Oracle due to rapid price movement. Please wait for the pause to end before placing another bid.");
              return;
            }
          }
        }
        
        errorMessage = "Transaction failed. Possible reasons: " +
          "1) Pool not initialized, 2) Outside trading window, 3) Contribution cap exceeded, " +
          "4) Slippage too high, 5) Pool has insufficient liquidity, 6) Oracle has paused trading. " +
          "Please check the LBP status and try again.";
      } else if (errorMessage.includes("PoolNotInitialized")) {
        errorMessage = "Pool is not initialized yet. Please wait for the pool to be initialized.";
      } else if (errorMessage.includes("OutsideBidWindow")) {
        errorMessage = "Outside trading window. Check start and end times.";
      } else if (errorMessage.includes("ContributionCapExceeded")) {
        errorMessage = "Your contribution would exceed the maximum allowed per address.";
      } else if (errorMessage.includes("SlippageExceeded") || errorMessage.includes("slippage")) {
        errorMessage = "Slippage tolerance exceeded. Try increasing slippage or reducing ETH amount.";
      } else if (errorMessage.includes("ZeroTokensBought")) {
        errorMessage = "No tokens would be received. Pool may be empty or ETH amount too small.";
      } else if (errorMessage.includes("NetValueZero")) {
        errorMessage = "ETH amount is too small. After fees, net value would be zero.";
      }
      
      handleTxError(err, errorMessage);
    }
  }, [lbpData, poolData, account, bidForm, lbpAddress, refetchLbpData, refetchUserData, tx]);

  return {
    bidForm,
    handleBidFormChange,
    handlePlaceBid,
    isPending: tx.isPending,
  };
};

