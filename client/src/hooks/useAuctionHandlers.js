import { useCallback } from "react";
import { ethers } from "ethers";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { handleTransactionError, executeTransaction } from "../utils/transactionUtils";
import { parseTimestamp, parseEtherValue, parseBps } from "../components/PresalePage/utils";

export const useAuctionHandlers = ({
  managerContract,
  info,
  address,
  auctionForm,
  lbpConfig,
  auctionData,
  currentTime,
  auctionContract,
  setTxStatus,
  setCreatingAuction,
  setAuctionForm,
  refreshInfo,
}) => {
  const submitAuction = useCallback(async () => {
    if (!managerContract) return;
    try {
      setCreatingAuction(true);
      const startTime = parseTimestamp(auctionForm.startTime);
      const payload = {
        saleToken: auctionForm.saleToken,
        treasury: auctionForm.treasury,
        startTime,
        commitDuration: Number(auctionForm.commitDuration || 0),
        revealDuration: Number(auctionForm.revealDuration || 0),
        perAddressCap: parseEtherValue(auctionForm.perAddressCap),
        softCap: parseEtherValue(auctionForm.softCap),
        tokensForSale: parseEtherValue(auctionForm.tokensForSale),
        bonusReserve: parseEtherValue(auctionForm.bonusReserve),
        earlyBonusWindow: Number(auctionForm.earlyBonusWindow || 0),
        earlyBonusPct: parseBps(auctionForm.earlyBonusPct),
        nonRevealPenaltyBps: 0,
        lbpStableShareBps: 4000,
        thresholdLow: 0,
        maxDecayMultiplier: ethers.parseUnits("1", 18).toString(),
        minCommitDuration: 600,
        demandCheckTime: startTime + 900,
        vestingStart: startTime + 86400,
        vestingDuration: 10800,
        merkleRoot: auctionForm.merkleRoot || ethers.ZeroHash,
        priceTicks: auctionForm.priceTicks
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((tick) => ethers.parseEther(tick).toString()),
      };

      await executeTransaction({
        txPromise: managerContract.createAuction(payload),
        pendingMessage: "Creating auction...",
        successMessage: "Auction created successfully!",
        setTxStatus,
        onSuccess: async () => {
          await refreshInfo();
        },
      });
    } catch (err) {
      handleTransactionError(err, "Unable to create auction", setTxStatus);
    } finally {
      setCreatingAuction(false);
    }
  }, [managerContract, auctionForm, setTxStatus, setCreatingAuction, refreshInfo]);

  const runAction = useCallback(async (label, action, preCheckAction = null, isAccelerateAuction = false) => {
    if (!managerContract || !info?.auction) return;
    try {
      if (preCheckAction) {
        try {
          await preCheckAction();
        } catch (preCheckErr) {
          if (preCheckErr?.message?.includes("missing revert data")) {
            console.warn("Pre-check failed with 'missing revert data', but will attempt transaction anyway");
          } else {
            console.warn("Pre-check failed:", preCheckErr);
            throw preCheckErr;
          }
        }
      }

      await executeTransaction({
        txPromise: action(),
        pendingMessage: `${label}…`,
        successMessage: `${label} completed successfully!`,
        setTxStatus,
        onSuccess: async () => {
          await refreshInfo();
        },
      });
    } catch (err) {
      let errorMessage = err?.message || `Failed to ${label.toLowerCase()}`;
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }

      if (isAccelerateAuction) {
        if (errorMessage.includes("CommitPhaseComplete") || errorMessage.includes("commit phase")) {
          errorMessage = "Commit phase has already ended. Cannot accelerate auction.";
        } else if (errorMessage.includes("dynamicAdjustmentCount") || errorMessage.includes("already adjusted")) {
          errorMessage = "Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once.";
        } else if (errorMessage.includes("AuctionNotInitialized") || errorMessage.includes("not initialized")) {
          errorMessage = "Auction is not initialized yet.";
        } else if (errorMessage.includes("ConditionsNotMet") || errorMessage.includes("conditions not met")) {
          errorMessage = "Conditions for acceleration are not met. Check that demand check time has passed and demand is below threshold.";
        } else if (errorMessage.includes("missing revert data")) {
          errorMessage = "Transaction failed. Possible reasons: 1) Demand is above threshold, 2) Auction already adjusted, 3) Commit phase ended, or 4) RPC issue.";
        }
      } else {
        if (errorMessage.includes("RevealPhaseClosed") || errorMessage.includes("reveal")) {
          errorMessage = "Reveal phase has not ended yet. Wait for the reveal phase to complete before finalizing.";
        } else if (errorMessage.includes("AuctionNotFinalized") || errorMessage.includes("not finalized")) {
          errorMessage = "Auction must be finalized before launching LBP.";
        } else if (errorMessage.includes("LbpAlreadyLaunched") || errorMessage.includes("already launched")) {
          errorMessage = "LBP has already been launched for this auction.";
        } else if (errorMessage.includes("missing revert data")) {
          errorMessage = `Transaction failed. This might be due to: 1) Invalid config parameters, or 2) RPC issue.`;
        }
      }

      handleTransactionError(err, errorMessage, setTxStatus);
    }
  }, [managerContract, info?.auction, setTxStatus, refreshInfo]);

  const handleFinalizeAuction = useCallback(async () => {
    if (!managerContract || !info?.auction) return;

    if (info.finalized) {
      handleTxError(new Error("Auction is already finalized"));
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
      
      const revealEndTime = await auctionContract.revealEndTime();
      const currentBlock = await provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
      
      if (Number(revealEndTime) > currentTime) {
        const timeRemaining = Number(revealEndTime) - currentTime;
        const hours = Math.floor(timeRemaining / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);
        handleTxError(new Error(`Reveal phase has not ended yet. Time remaining: ${hours}h ${minutes}m`));
        return;
      }
    } catch (err) {
      console.warn("Could not check reveal end time:", err);
    }

    const preCheck = async () => {
      try {
        await managerContract.finalizeAuction.staticCall(info.auction);
      } catch (staticErr) {
        throw staticErr;
      }
    };

    const onSuccessCallback = async () => {
      await refreshInfo();
      try {
        const { BrowserProvider } = await import("ethers");
        if (!window.ethereum) {
          throw new Error("No wallet provider");
        }
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const allAbis = await import("../abi/allAbis.json");
        const auctionAbi = allAbis.DutchAuction || [];
        const auctionContract = new ethers.Contract(info.auction, auctionAbi, provider);
        const successful = await auctionContract.successful();
        
        if (!successful) {
          const saleTokenAddress = await auctionContract.saleToken();
          const ownerAddress = await auctionContract.owner();
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new ethers.Contract(saleTokenAddress, tokenAbi, provider);
            const tokenBalance = await tokenContract.balanceOf(info.auction);
            
            if (tokenBalance > 0n) {
              showTxInfo("Auction was not successful. Returning tokens to owner...", { autoClose: false });
              
              try {
                const auctionContractWithSigner = new ethers.Contract(info.auction, auctionAbi, signer);
                const managerAbi = allAbis.PresaleManager || [];
                if (managerAbi.length > 0) {
                  const managerContractWithSigner = new ethers.Contract(
                    await managerContract.getAddress(),
                    managerAbi,
                    signer
                  );
                  try {
                    await executeTransaction({
                      txPromise: managerContractWithSigner.returnAuctionTokens(info.auction, { gasLimit: 200000 }),
                      pendingMessage: "Returning tokens to owner...",
                      successMessage: `Successfully returned ${ethers.formatEther(tokenBalance)} tokens to owner!`,
                      setTxStatus,
                      onSuccess: async () => {
                        await refreshInfo();
                      },
                    });
                  } catch (returnErr) {
                    console.warn("Could not return tokens via PresaleManager:", returnErr);
                    const auctionContractWithSigner = new ethers.Contract(info.auction, auctionAbi, signer);
                    try {
                      await executeTransaction({
                        txPromise: auctionContractWithSigner.returnTokensToOwner({ gasLimit: 200000 }),
                        pendingMessage: "Returning tokens to owner...",
                        successMessage: `Successfully returned ${ethers.formatEther(tokenBalance)} tokens to owner!`,
                        setTxStatus,
                        onSuccess: async () => {
                          await refreshInfo();
                        },
                      });
                    } catch (directErr) {
                      console.warn("Could not return tokens directly from auction:", directErr);
                      showTxInfo(
                        `Auction was not successful. ${ethers.formatEther(tokenBalance)} tokens need to be returned to owner (${ownerAddress}).`,
                        { autoClose: 8000 }
                      );
                    }
                  }
                } else {
                  showTxInfo("Auction was not successful. Please return tokens manually to owner.", { autoClose: 5000 });
                }
              } catch (transferErr) {
                console.warn("Could not return tokens automatically:", transferErr);
                showTxInfo("Auction was not successful. Please return tokens manually to owner.", { autoClose: 5000 });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not check auction success status or return tokens:", err);
      }
    };

    await executeTransaction({
      txPromise: managerContract.finalizeAuction(info.auction),
      pendingMessage: "Finalizing auction…",
      successMessage: "Auction finalized successfully!",
      setTxStatus,
      onSuccess: onSuccessCallback,
    });
  }, [managerContract, info, setTxStatus, refreshInfo]);

  const handleAccelerateAuction = useCallback(async () => {
    if (!managerContract || !info?.auction) return;

    if (info.finalized) {
      handleTxError(new Error("Auction is already finalized"));
      return;
    }

    if (!auctionData) {
      handleTxError(new Error("Auction data not loaded. Please wait..."));
      return;
    }

    const demandCheckTime = auctionData.demandCheckTime || 0;
    const commitEndTime = auctionData.commitEndTime || 0;

    if (currentTime < demandCheckTime) {
      const timeUntilCheck = demandCheckTime - currentTime;
      const hours = Math.floor(timeUntilCheck / 3600);
      const minutes = Math.floor((timeUntilCheck % 3600) / 60);
      handleTxError(new Error(`Demand check time has not been reached yet. Time remaining: ${hours}h ${minutes}m`));
      return;
    }

    if (currentTime >= commitEndTime) {
      handleTxError(new Error("Commit phase has already ended. Cannot accelerate auction."));
      return;
    }

    const totalDepositCommitted = auctionData.totalDepositCommitted || 0n;
    const thresholdLow = auctionData.thresholdLow || 0n;
    const isLowDemand = thresholdLow > 0n ? totalDepositCommitted < thresholdLow : false;
    const dynamicAdjustmentCount = auctionData.dynamicAdjustmentCount || 0;

    if (dynamicAdjustmentCount > 0) {
      handleTxError(new Error("Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once."));
      return;
    }

    if (!isLowDemand && thresholdLow > 0n) {
      const confirmMessage = `Current deposits (${ethers.formatEther(totalDepositCommitted)} ETH) are above the threshold (${ethers.formatEther(thresholdLow)} ETH). The auction will NOT shorten if demand is sufficient. Continue anyway?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    } else if (thresholdLow === 0n) {
      handleTxError(new Error("Threshold low is set to 0. Cannot determine if demand is low. Please configure thresholdLow in auction parameters."));
      return;
    }

    const preCheck = async () => {
      try {
        if (auctionContract) {
          const currentCommitEnd = Number(await auctionContract.commitEndTime());
          const initialCommitEnd = Number(await auctionContract.initialCommitEndTime());
          const dynamicAdjustmentCount = Number(await auctionContract.dynamicAdjustmentCount());
          const totalDeposit = await auctionContract.totalDepositCommitted();
          const threshold = await auctionContract.thresholdLow();
          
          if (currentCommitEnd <= currentTime) {
            throw new Error("Commit phase has already ended");
          }
          if (dynamicAdjustmentCount > 0) {
            throw new Error("Auction has already been adjusted");
          }
          if (threshold > 0n && totalDeposit >= threshold) {
            throw new Error("Demand is above threshold");
          }
        }
      } catch (preCheckErr) {
        throw preCheckErr;
      }
    };

    runAction("Accelerate auction", () => managerContract.checkAndAdjustAuction(info.auction), preCheck, true);
  }, [managerContract, info, auctionData, currentTime, auctionContract, runAction]);

  const handleWithdrawTreasury = useCallback(async () => {
    if (!managerContract || !info?.auction) return;

    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const allAbis = await import("../abi/allAbis.json");
      const auctionAbi = allAbis.DutchAuction || [];
      const auctionContract = new ethers.Contract(info.auction, auctionAbi, provider);
      
      // Get treasury address from auction
      const treasury = await auctionContract.treasury().catch(() => null);
      if (!treasury || treasury === ethers.ZeroAddress) {
        handleTxError(new Error("Treasury address is not set in auction contract"));
        return;
      }

      // Get ETH for treasury (based on clearing price, excluding refunds)
      const ethForTreasury = await auctionContract.ethForTreasury().catch(() => 0n);
      if (ethForTreasury === 0n) {
        handleTxError(new Error("No ETH available to withdraw from auction (ethForTreasury is 0)"));
        return;
      }

      await executeTransaction({
        txPromise: managerContract.auctionWithdrawTreasury(info.auction, treasury),
        pendingMessage: `Withdrawing ${ethers.formatEther(ethForTreasury)} ETH to treasury…`,
        successMessage: `Successfully withdrew ${ethers.formatEther(ethForTreasury)} ETH to treasury!`,
        setTxStatus,
        onSuccess: async () => {
          await refreshInfo();
        },
      });
    } catch (err) {
      handleTransactionError(err, "Failed to withdraw ETH from auction", setTxStatus);
    }
  }, [managerContract, info?.auction, setTxStatus, refreshInfo]);

  return {
    submitAuction,
    handleFinalizeAuction,
    handleAccelerateAuction,
    handleWithdrawTreasury,
    runAction,
  };
};

