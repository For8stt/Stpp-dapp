import { useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { executeTransaction, handleTransactionError } from "../utils/transactionUtils";
import { parseTimestamp, parseWeight, parseBps } from "../components/PresalePage/utils";

export const useLbpHandlers = ({
  managerContract,
  info,
  address,
  lbpConfig,
  auctionContract,
  auctionData,
  currentTime,
  setTxStatus,
  setLbpState,
  refreshInfo,
  refetchAuctionData,
}) => {
  const launchLbpConfig = useMemo(
    () => ({
      startTime: parseTimestamp(lbpConfig.startTime),
      endTime: parseTimestamp(lbpConfig.endTime),
      poolStartWeightToken: parseWeight(lbpConfig.poolStartWeightToken),
      poolEndWeightToken: parseWeight(lbpConfig.poolEndWeightToken),
      poolSwapFee: ethers.parseUnits(lbpConfig.poolSwapFee || "0.003", 18).toString(),
      vestingStartTime: info?.vesting ? parseTimestamp(lbpConfig.startTime) : parseTimestamp(lbpConfig.startTime),
      vestingCliffDuration: Number(lbpConfig.vestingCliffDuration || 0),
      vestingFinalDuration: Number(lbpConfig.vestingFinalDuration || 0),
      vestingCliffPercentBP: parseBps(lbpConfig.vestingCliffPercentBP),
      initialFeePreset: Number(lbpConfig.initialFeePreset ?? "1"),
      feeDecayDurationPreset: Number(lbpConfig.feeDecayDurationPreset ?? "1"),
      maxContributionPerAddress: (lbpConfig.maxContributionPerAddress && lbpConfig.maxContributionPerAddress.trim() !== "")
        ? ethers.parseEther(lbpConfig.maxContributionPerAddress).toString()
        : "0",
    }),
    [lbpConfig, info]
  );

  const handleLaunchLbp = useCallback(async () => {
    if (!managerContract || !info?.auction) return;

    if (!info.finalized) {
      handleTxError(new Error("Auction must be finalized before launching LBP"));
      return;
    }

    if (info.lbpInitialized) {
      handleTxError(new Error("LBP has already been launched"));
      return;
    }

    if (launchLbpConfig.startTime >= launchLbpConfig.endTime) {
      handleTxError(new Error("LBP start time must be before end time"));
      return;
    }

    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const allAbis = await import("../abi/allAbis.json");
      const auctionAbi = allAbis.DutchAuction || [];
      const auctionContract = new ethers.Contract(info.auction, auctionAbi, provider);

      const [finalized, successful, tokensForSale, tokensSold, lbpLaunched, lbpTokenRecipient, lbpStableRecipient, ethForTreasury, totalRaised] = await Promise.all([
        auctionContract.finalized(),
        auctionContract.successful(),
        auctionContract.tokensForSale(),
        auctionContract.tokensSold(),
        auctionContract.lbpLaunched ? auctionContract.lbpLaunched() : Promise.resolve(false),
        auctionContract.lbpTokenRecipient ? auctionContract.lbpTokenRecipient() : Promise.resolve(ethers.ZeroAddress),
        auctionContract.lbpStableRecipient ? auctionContract.lbpStableRecipient() : Promise.resolve(ethers.ZeroAddress),
        auctionContract.ethForTreasury(),
        auctionContract.totalRaised(),
      ]);

      const unsoldTokens = tokensForSale - tokensSold;
      const lbpStableShareBps = await auctionContract.lbpStableShareBps();
      const BPS_DENOMINATOR = 10000n;
      let stableForLBP = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR;

      if (stableForLBP > ethForTreasury) {
        stableForLBP = ethForTreasury;
      }
      
      const actualStableForLBP = stableForLBP;

      if (!finalized) {
        handleTxError(new Error("Auction is not finalized. Please finalize the auction first."));
        return;
      }

      if (!successful) {
        handleTxError(new Error("Auction was not successful (did not reach soft cap or no tokens sold). LBP can only be launched for successful auctions."));
        return;
      }

      if (lbpLaunched) {
        handleTxError(new Error("LBP has already been launched for this auction."));
        return;
      }

      if (unsoldTokens === 0n) {
        handleTxError(new Error("No unsold tokens available for LBP. All tokens were sold."));
        return;
      }

      if (lbpTokenRecipient === ethers.ZeroAddress) {
        handleTxError(new Error("LBP token recipient is not set in auction. This must be set to PresaleManager address during auction initialization."));
        return;
      }

      if (lbpTokenRecipient.toLowerCase() !== address.toLowerCase()) {
        handleTxError(new Error(`LBP token recipient (${lbpTokenRecipient}) is not set to PresaleManager (${address}). Tokens must be sent to PresaleManager.`));
        return;
      }

      if (actualStableForLBP === 0n) {
        const errorMsg = `Cannot launch LBP: stableForLBP is 0, but PresaleManager.launchLBP() requires ETH to be received. ` +
          `This will cause 'NoEthReceived' error. ` +
          `Please ensure lbpStableShareBps > 0 (current: ${lbpStableShareBps.toString()}) and totalRaised > 0 (current: ${ethers.formatEther(totalRaised)} ETH).`;
        handleTxError(new Error(errorMsg));
        return;
      }

      if (lbpStableRecipient === ethers.ZeroAddress) {
        handleTxError(new Error(`LBP stable recipient is not set but ETH share is required (${ethers.formatEther(actualStableForLBP)} ETH). Please check auction configuration.`));
        return;
      }
      if (lbpStableRecipient.toLowerCase() !== address.toLowerCase()) {
        handleTxError(new Error(`LBP stable recipient (${lbpStableRecipient}) is not set to PresaleManager (${address}). ETH must be sent to PresaleManager.`));
        return;
      }

      if (ethForTreasury === 0n && stableForLBP > 0n) {
        handleTxError(new Error(`No ETH available in treasury for LBP. Required: ${ethers.formatEther(stableForLBP)} ETH, Available: 0 ETH`));
        return;
      }

      const launchAction = async () => {
        const signer = await provider.getSigner();
        const managerContractWithSigner = managerContract.connect(signer);
        const lbpConfig = {
          startTime: launchLbpConfig.startTime,
          endTime: launchLbpConfig.endTime,
          poolStartWeightToken: launchLbpConfig.poolStartWeightToken,
          poolEndWeightToken: launchLbpConfig.poolEndWeightToken,
          poolSwapFee: launchLbpConfig.poolSwapFee,
          vestingStartTime: launchLbpConfig.vestingStartTime,
          vestingCliffDuration: Number(launchLbpConfig.vestingCliffDuration),
          vestingFinalDuration: Number(launchLbpConfig.vestingFinalDuration),
          vestingCliffPercentBP: launchLbpConfig.vestingCliffPercentBP,
          initialFeePreset: Number(launchLbpConfig.initialFeePreset),
          feeDecayDurationPreset: Number(launchLbpConfig.feeDecayDurationPreset),
          maxContributionPerAddress: launchLbpConfig.maxContributionPerAddress,
        };
        let gasLimit = 15000000; // Start with high default
        try {
          const estimatedGas = await managerContractWithSigner.launchLBP.estimateGas(
            info.auction,
            lbpConfig
          );
          gasLimit = (estimatedGas * 130n) / 100n;
          if (gasLimit < 12000000n) {
            gasLimit = 12000000n;
          }
          if (gasLimit > 20000000n) {
            gasLimit = 20000000n;
          }
        } catch (estimateErr) {
          console.warn("Could not estimate gas, using high default:", estimateErr);
          gasLimit = 18000000;
        }
        
        const tx = await managerContractWithSigner.launchLBP(
          info.auction,
          lbpConfig,
          { gasLimit }
        );
        return tx;
      };
      
      try {
        await executeTransaction({
          txPromise: launchAction(),
          pendingMessage: "Launch LBP…",
          successMessage: "LBP launched successfully!",
          setTxStatus,
          onSuccess: async () => {
            await refreshInfo();
          },
        });
      } catch (err) {
        handleTransactionError(err, "Failed to launch LBP", setTxStatus);
      }
    } catch (err) {
      handleTransactionError(err, "Failed to launch LBP", setTxStatus);
    }
  }, [managerContract, info, address, launchLbpConfig, setTxStatus, refreshInfo]);

  const handleFinalizeLbp = useCallback(async () => {
    if (!managerContract || !info?.auction) return;
    
    try {
      const provider = await import("ethers").then(m => m.BrowserProvider ? new m.BrowserProvider(window.ethereum) : null);
      if (!provider) throw new Error("No provider");
      
      const allAbis = await import("../abi/allAbis.json");
      const managerAbi = allAbis.PresaleManager || [];
      const lbpAbi = allAbis.SecureLBP || [];
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      const record = await managerContract.getAuctionRecord(info.auction);
      const recordVestingEscrow = record.vestingEscrow;
      const recordLbp = record.lbp;
      
      let lbpVestingEscrow = ethers.ZeroAddress;
      let lbpTotalTokensAllocated = 0n;
      let lbpTokenBalance = 0n;
      let lbpFinalized = false;
      
      if (recordLbp && recordLbp !== ethers.ZeroAddress) {
        const lbpContract = new ethers.Contract(recordLbp, lbpAbi, provider);
        [lbpVestingEscrow, lbpTotalTokensAllocated, lbpFinalized] = await Promise.all([
          lbpContract.vestingEscrow().catch(() => ethers.ZeroAddress),
          lbpContract.totalTokensAllocated().catch(() => 0n),
          lbpContract.finalized().catch(() => false),
        ]);
        const tokenAddress = await lbpContract.token().catch(() => ethers.ZeroAddress);
        if (tokenAddress !== ethers.ZeroAddress) {
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
            lbpTokenBalance = await tokenContract.balanceOf(recordLbp).catch(() => 0n);
          }
        }
      }
      
      let vestingEscrowToUse = recordVestingEscrow;
      if (vestingEscrowToUse === ethers.ZeroAddress || !vestingEscrowToUse) {
        vestingEscrowToUse = info.vesting || ethers.ZeroAddress;
      }
      if (vestingEscrowToUse === ethers.ZeroAddress && lbpVestingEscrow !== ethers.ZeroAddress) {
        vestingEscrowToUse = lbpVestingEscrow;
      }

      try {
        await executeTransaction({
          txPromise: managerContract.finalizeLbp(info.auction, vestingEscrowToUse !== ethers.ZeroAddress ? vestingEscrowToUse : ethers.ZeroAddress),
          pendingMessage: "Finalize LBP…",
          successMessage: "LBP finalized successfully!",
          setTxStatus,
          onSuccess: async () => {
            await refreshInfo();
          },
          onError: (err) => {
            let errorMessage = err?.message || "Failed to finalize LBP";
            
            if (errorMessage.includes("missing revert data") || err?.code === "CALL_EXCEPTION") {
              if (lbpFinalized) {
                errorMessage = "LBP has already been finalized. No action needed.";
              } else if (lbpTokenBalance < lbpTotalTokensAllocated) {
                errorMessage = `Cannot finalize LBP: Insufficient token balance. Required: ${ethers.formatEther(lbpTotalTokensAllocated)} tokens, Available: ${ethers.formatEther(lbpTokenBalance)} tokens. This may happen if liquidity was unwound before finalization.`;
              } else {
                errorMessage = "Transaction failed. Possible reasons:\n" +
                  "1. LBP has already been finalized\n" +
                  "2. LBP is not initialized\n" +
                  "3. Insufficient tokens in LBP contract (may occur after unwinding liquidity)\n" +
                  "4. Invalid vesting escrow address\n" +
                  "Please check the LBP state and try again.";
              }
            } else if (err?.reason) {
              errorMessage = err.reason;
            } else if (err?.data?.message) {
              errorMessage = err.data.message;
            } else if (err?.error?.message) {
              errorMessage = err.error.message;
            }
            
            handleTransactionError(err, errorMessage, setTxStatus);
          },
        });
      } catch (err) {
        let errorMessage = err?.message || "Failed to finalize LBP";
        
        if (errorMessage.includes("missing revert data") || err?.code === "CALL_EXCEPTION") {
          if (lbpFinalized) {
            errorMessage = "LBP has already been finalized. No action needed.";
          } else if (lbpTokenBalance < lbpTotalTokensAllocated) {
            errorMessage = `Cannot finalize LBP: Insufficient token balance. Required: ${ethers.formatEther(lbpTotalTokensAllocated)} tokens, Available: ${ethers.formatEther(lbpTokenBalance)} tokens. This may happen if liquidity was unwound before finalization.`;
          } else {
            errorMessage = "Transaction failed. Possible reasons:\n" +
              "1. LBP has already been finalized\n" +
              "2. LBP is not initialized\n" +
              "3. Insufficient tokens in LBP contract (may occur after unwinding liquidity)\n" +
              "4. Invalid vesting escrow address\n" +
              "Please check the LBP state and try again.";
          }
        }
        
        handleTransactionError(err, errorMessage, setTxStatus);
      }
    } catch (err) {
      handleTransactionError(err, "Failed to finalize LBP", setTxStatus);
    }
  }, [managerContract, info, setTxStatus, refreshInfo]);

  const handleUnwind = useCallback(async () => {
    if (!managerContract || !info?.auction || !info?.lbp) {
      handleTxError(new Error("LBP not initialized. Please launch LBP first."));
      return;
    }

    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const allAbis = await import("../abi/allAbis.json");
      const lbpAbi = allAbis.SecureLBP || [];
      const lbpContract = new ethers.Contract(info.lbp, lbpAbi, provider);
      const lbpFinalized = await lbpContract.finalized().catch(() => false);
      if (!lbpFinalized) {
        handleTxError(new Error("LBP must be finalized before unwinding. Please finalize LBP first."));
        return;
      }
      const poolInitialized = await lbpContract.poolInitialized().catch(() => false);
      if (!poolInitialized) {
        handleTxError(new Error("LBP pool is not initialized. Please launch LBP first."));
        return;
      }
      const endTime = await lbpContract.endTime().catch(() => 0n);
      const currentBlock = await provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
      
      if (endTime > 0n && Number(endTime) > currentTime) {
        const timeRemaining = Number(endTime) - currentTime;
        const hours = Math.floor(timeRemaining / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);
        handleTxError(new Error(`LBP has not ended yet. Time remaining: ${hours}h ${minutes}m. Unwind can only be performed after LBP end time.`));
        return;
      }

      const poolAddress = await lbpContract.pool().catch(() => ethers.ZeroAddress);
      if (poolAddress !== ethers.ZeroAddress) {
        const poolAbi = allAbis.LBPWeightedAMM || [];
        if (poolAbi.length > 0) {
          const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);
          const lpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
          
          if (lpBalance === 0n) {
            const lbpEthBalance = await provider.getBalance(info.lbp).catch(() => 0n);
            const saleTokenAddress = await lbpContract.token().catch(() => ethers.ZeroAddress);
            let lbpTokenBalance = 0n;
            if (saleTokenAddress !== ethers.ZeroAddress) {
              const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
              if (tokenAbi.length > 0) {
                const tokenContract = new ethers.Contract(saleTokenAddress, tokenAbi, provider);
                lbpTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
              }
            }
            
            if (lbpEthBalance > 0n || lbpTokenBalance > 0n) {
              const ethStr = lbpEthBalance > 0n ? ethers.formatEther(lbpEthBalance) : "0";
              const tokenStr = lbpTokenBalance > 0n ? ethers.formatEther(lbpTokenBalance) : "0";
              const signer = await provider.getSigner();
              const managerContractWithSigner = managerContract.connect(signer);
              
              try {
                if (lbpEthBalance > 0n) {
                  await executeTransaction({
                    txPromise: managerContractWithSigner.withdrawLbpEth(info.auction, lbpEthBalance, { gasLimit: 200000 }),
                    pendingMessage: `Withdrawing ${ethStr} ETH from LBP…`,
                    successMessage: `Successfully withdrew ${ethStr} ETH from LBP!`,
                    setTxStatus,
                    onSuccess: async () => {
                      await refreshInfo();
                      await refetchAuctionData();
                    },
                  });
                }
                if (lbpTokenBalance > 0n) {
                  await executeTransaction({
                    txPromise: managerContractWithSigner.withdrawLbpAllTokens(info.auction, { gasLimit: 200000 }),
                    pendingMessage: `Withdrawing ${tokenStr} tokens from LBP…`,
                    successMessage: `Successfully withdrew ${tokenStr} tokens from LBP!`,
                    setTxStatus,
                    onSuccess: async () => {
                      await refreshInfo();
                      await refetchAuctionData();
                    },
                  });
                }
                
                showTxInfo(
                  `All funds withdrawn: ${ethStr} ETH, ${tokenStr} tokens. Funds have been sent to treasury.`,
                  { autoClose: 5000 }
                );
              } catch (withdrawErr) {
                console.warn("Failed to withdraw funds after unwind:", withdrawErr);
                showTxInfo(
                  `Liquidity already unwound. Available: ${ethStr} ETH, ${tokenStr} tokens. Use Post-LBP Settlement to distribute funds.`,
                  { autoClose: 8000 }
                );
              }
              return;
            } else {
              showTxInfo("No liquidity to unwind. Liquidity has already been unwound and all funds have been withdrawn.", { autoClose: 5000 });
              setTxStatus({ status: "info", message: "No liquidity to unwind. All funds have been withdrawn." });
              return;
            }
          }
        }
      }

      await executeTransaction({
        txPromise: managerContract.unwindLbpAll(info.auction, { gasLimit: 500000 }),
        pendingMessage: "Unwinding LBP…",
        successMessage: "LBP unwound successfully!",
        setTxStatus,
        onSuccess: async () => {
          await refreshInfo();
          await refetchAuctionData();
          try {
            const signer = await provider.getSigner();
            const managerContractWithSigner = managerContract.connect(signer);
            const lbpEthBalance = await provider.getBalance(info.lbp).catch(() => 0n);
            const saleTokenAddress = await lbpContract.token().catch(() => ethers.ZeroAddress);
            let lbpTokenBalance = 0n;
            if (saleTokenAddress !== ethers.ZeroAddress) {
              const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
              if (tokenAbi.length > 0) {
                const tokenContract = new ethers.Contract(saleTokenAddress, tokenAbi, provider);
                lbpTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
              }
            }
            if (lbpEthBalance > 0n) {
              await executeTransaction({
                txPromise: managerContractWithSigner.withdrawLbpEth(info.auction, lbpEthBalance, { gasLimit: 200000 }),
                pendingMessage: `Withdrawing ${ethers.formatEther(lbpEthBalance)} ETH to treasury…`,
                successMessage: `Successfully withdrew ${ethers.formatEther(lbpEthBalance)} ETH to treasury!`,
                setTxStatus,
                onSuccess: async () => {
                  await refreshInfo();
                  await refetchAuctionData();
                },
              });
            }
            if (lbpTokenBalance > 0n) {
              await executeTransaction({
                txPromise: managerContractWithSigner.withdrawLbpAllTokens(info.auction, { gasLimit: 200000 }),
                pendingMessage: `Withdrawing ${ethers.formatEther(lbpTokenBalance)} tokens to treasury…`,
                successMessage: `Successfully withdrew ${ethers.formatEther(lbpTokenBalance)} tokens to treasury!`,
                setTxStatus,
                onSuccess: async () => {
                  await refreshInfo();
                  await refetchAuctionData();
                },
              });
            }
            
            if (lbpEthBalance > 0n || lbpTokenBalance > 0n) {
              showTxInfo(
                `All funds from unwound liquidity have been withdrawn to treasury: ${ethers.formatEther(lbpEthBalance)} ETH, ${ethers.formatEther(lbpTokenBalance)} tokens.`,
                { autoClose: 6000 }
              );
            }
          } catch (withdrawErr) {
            console.warn("Failed to automatically withdraw funds after unwind:", withdrawErr);
            showTxInfo(
              "LBP unwound successfully. You can now withdraw funds manually or use Post-LBP Settlement to distribute them.",
              { autoClose: 5000 }
            );
          }
        },
        onError: (err) => {
          const errorString = JSON.stringify(err || {});
          const errorMessage = err?.message || err?.reason || "";
          if (
            errorMessage.includes("NoLPTokens") ||
            errorMessage.includes("No LP tokens") ||
            errorString.includes("NoLPTokens") ||
            err?.error?.error?.errorName === "NoLPTokens" ||
            err?.error?.error?.name === "NoLPTokens"
          ) {
            showTxInfo("No liquidity to unwind. Liquidity has already been unwound.", { autoClose: 5000 });
            setTxStatus({ status: "info", message: "No liquidity to unwind. Liquidity has already been unwound." });
            return;
          }
          let finalErrorMessage = errorMessage || "Failed to unwind LBP";
          
          if (finalErrorMessage.includes("missing revert data") || err?.code === "CALL_EXCEPTION") {
            if (err?.transaction?.to?.toLowerCase() === info.lbp?.toLowerCase()) {
              finalErrorMessage = "Transaction failed on LBP contract. Possible reasons:\n" +
                "1. LBP has not ended yet (check endTime)\n" +
                "2. LBP is not finalized (use 'Finalize LBP' first)\n" +
                "3. Pool is not initialized\n" +
                "4. Insufficient tokens/ETH in contract\n" +
                "Please check the LBP state and try again.";
            } else {
              finalErrorMessage = "Transaction failed. The contract may have reverted. Check:\n" +
                "1. All prerequisites are met (LBP ended, finalized, etc.)\n" +
                "2. Contract state is correct\n" +
                "3. You have sufficient gas";
            }
          } else if (finalErrorMessage.includes("NotFinalized")) {
            finalErrorMessage = "LBP must be finalized before unwinding. Please finalize LBP first.";
          } else if (finalErrorMessage.includes("AuctionActive") || finalErrorMessage.includes("NotEnded")) {
            finalErrorMessage = "LBP must have ended (block.timestamp > endTime) before unwinding.";
          } else if (finalErrorMessage.includes("InsufficientBalance") || finalErrorMessage.includes("InsufficientTokens")) {
            finalErrorMessage = "Insufficient balance to withdraw. Funds may have already been withdrawn.";
          } else if (finalErrorMessage.includes("PoolNotInitialized") || finalErrorMessage.includes("pool is not initialized")) {
            finalErrorMessage = "LBP pool is not initialized. Please launch LBP first.";
          }
          
          handleTransactionError(err, finalErrorMessage, setTxStatus);
        },
      });
    } catch (err) {
      if (err?.code === "ACTION_REJECTED" || err?.message?.includes("user rejected")) {
        return; // User cancelled, don't show error
      }
      
      let errorMessage = err?.message || "Failed to unwind LBP";
      const errorString = JSON.stringify(err || {});
      if (
        errorMessage.includes("NoLPTokens") ||
        errorMessage.includes("No LP tokens") ||
        errorString.includes("NoLPTokens")
      ) {
        showTxInfo("No liquidity to unwind. Liquidity has already been unwound.", { autoClose: 5000 });
        setTxStatus({ status: "info", message: "No liquidity to unwind. Liquidity has already been unwound." });
        return;
      }
      
      handleTransactionError(err, errorMessage, setTxStatus);
    }
  }, [managerContract, info?.auction, info?.lbp, setTxStatus, refreshInfo, refetchAuctionData]);

  return {
    handleLaunchLbp,
    handleFinalizeLbp,
    handleUnwind,
    launchLbpConfig,
  };
};

