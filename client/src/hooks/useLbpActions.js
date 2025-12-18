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
            console.log("[LBP Actions] Purchase successful, starting refetch...");
            // Wait for the transaction to be mined and events to be indexed
            // Increase wait time to ensure events are available
            await new Promise(resolve => setTimeout(resolve, 4000));
            console.log("[LBP Actions] First refetch after 4 seconds...");
            // Refetch LBP data (which includes swap events)
            await refetchLbpData();
            // Wait longer and refetch again to catch any delayed events
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log("[LBP Actions] Second refetch after 3 more seconds...");
            await refetchLbpData();
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log("[LBP Actions] Final refetch...");
            await refetchLbpData();
            await refetchUserData();
            console.log("[LBP Actions] Refetch complete");
          },
        }
      );
    } catch (err) {
      console.error("Error placing bid:", err);
      
      let errorMessage = err?.message || "Failed to place bid";
      
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      
      if (errorMessage.includes("missing revert data") || errorMessage.includes("CALL_EXCEPTION")) {
        errorMessage = "Transaction failed. Possible reasons: " +
          "1) Pool not initialized, 2) Outside trading window, 3) Contribution cap exceeded, " +
          "4) Slippage too high, 5) Pool has insufficient liquidity. " +
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

