import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ethers } from "ethers";

import AuctionControls from "../components/presale/AuctionControls";
import BonusMerkleManager from "../components/presale/BonusMerkleManager";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { useAuctionData } from "../hooks/useAuctionData";
import { useTime } from "../time";

const toDateInput = (secondsFromNow = 0) =>
  new Date((Math.floor(Date.now() / 1000) + secondsFromNow) * 1000).toISOString().slice(0, 16);

const defaultAuctionForm = {
  saleToken: "",
  treasury: "",
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  tokensForSale: "",
  bonusReserve: "",
  perAddressCap: "",
  softCap: "",
  merkleRoot: ethers.ZeroHash,
  priceTicks: "1,0.9,0.8",
};

const defaultLbpConfig = {
  startTime: toDateInput(10800), // +3 година від зараз
  endTime: toDateInput(21600), // +6 години від зараз (кінець через 1 годину після початку)
  poolStartWeightToken: "80",
  poolEndWeightToken: "20",
  poolSwapFee: "0.003",
  initialFeePreset: "1", // Default: 10% (enum value 1 = TEN_PERCENT)
  feeDecayDurationPreset: "1", // Default: 15 minutes (enum value 1 = FIFTEEN_MINUTES)
  vestingCliffDuration: "259200", // 3 days (3 * 24 * 60 * 60 = 259200 seconds)
  vestingFinalDuration: "2592000", // 30 days for LBP (30 * 24 * 60 * 60 = 2592000 seconds)
  vestingCliffPercentBP: "1500", // 15% (15 * 100 = 1500 BPS)
  maxContributionPerAddress: "5", // Default: 5 ETH
};

const parseTimestamp = (value) => {
  if (!value) return Math.floor(Date.now() / 1000) + 600;
  const result = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(result) ? result : Math.floor(Date.now() / 1000) + 600;
};
const parseEtherValue = (value) => (value ? ethers.parseUnits(value, 18).toString() : "0");
const parseBps = (value) => Number(value || 0);
const parseWeight = (value) => ethers.parseUnits(((Number(value || 0) / 100) || 0).toString(), 18).toString();

const shortenHash = (hash) => {
  if (!hash) return "";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

const PresalePage = ({ account }) => {
  const { address } = useParams();
  const [managerContract, setManagerContract] = useState(null);
  const [info, setInfo] = useState(null);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [auctionForm, setAuctionForm] = useState(defaultAuctionForm);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [lbpConfig, setLbpConfig] = useState(defaultLbpConfig);

  const [auctionContract, setAuctionContract] = useState(null);

  useEffect(() => {
    const loadAuctionContract = async () => {
      if (!info?.auction || !managerContract) {
        setAuctionContract(null);
        return;
      }
      try {
        const allAbis = await import("../abi/allAbis.json");
        const { ensureProvider } = await import("../services/web3/provider");
        const provider = ensureProvider();
        const auctionAbi = allAbis.DutchAuction || [];
        if (auctionAbi.length > 0) {
          const { Contract } = await import("ethers");
          const contract = new Contract(info.auction, auctionAbi, provider);
          setAuctionContract(contract);
        }
      } catch (err) {
        console.warn("Failed to load auction contract:", err);
        setAuctionContract(null);
      }
    };
    loadAuctionContract();
  }, [info?.auction, managerContract]);
  
  const {
    data: auctionData,
    refetch: refetchAuctionData,
  } = useAuctionData(auctionContract, managerContract, info?.auction);

  const { currentTime } = useTime();

  const refreshInfo = useCallback(async () => {
    if (!address) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const normalizedAddress = address.toLowerCase();
      let factoryContract = null;
      try {
        factoryContract = await loadContract("PublicPresaleFactory");
      } catch {}
      if (factoryContract) {
        const factoryAddress = (factoryContract.target || factoryContract.address || "").toString().toLowerCase();
        if (factoryAddress === normalizedAddress) {
          setError(
            "This address is the public factory. Open one of the PresaleManager clones emitted by the factory (see All presales)."
          );
          setManagerContract(null);
          setAuctions([]);
          setInfo(null);
          return;
        }
      }
      const contract = await loadContract("PresaleManager", address);
      setManagerContract(contract);
      const ownerAddress = await contract.owner();
      const auctionsList = await contract.getAllAuctions();
      setAuctions(auctionsList);

      let latestInfo = null;
      if (auctionsList.length > 0) {
        const targetAuction = auctionsList[auctionsList.length - 1];
        let details = null;

        if (typeof contract.getPresaleInfo === "function") {
          details = await contract.getPresaleInfo(targetAuction);
        } else if (typeof contract.getLatestPresaleInfo === "function") {
          details = await contract.getLatestPresaleInfo();
        } else if (typeof contract.getAuctionRecord === "function") {
          const record = await contract.getAuctionRecord(targetAuction);
          details = [
            ownerAddress,
            targetAuction,
            record.lbp,
            record.vestingEscrow,
            record.finalized,
            record.lbpInitialized,
            record.lbpFinalized,
            record.tokensForSale,
            record.bonusReserve,
            record.totalRaised,
            record.clearingPrice,
          ];
        }

        if (details) {
          latestInfo = {
            owner: details[0],
            auction: details[1],
            lbp: details[2],
            vesting: details[3],
            finalized: details[4],
            lbpInitialized: details[5],
            lbpFinalized: details[6],
            tokensForSale: details[7],
            bonusReserve: details[8],
            totalRaised: details[9],
            clearingPrice: details[10],
          };
        }
      }

      setInfo(latestInfo);
      setIsOwner(ownerAddress?.toLowerCase() === account?.toLowerCase());
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load presale");
    } finally {
      setLoading(false);
    }
  }, [address, account]);

  useEffect(() => {
    refreshInfo();
  }, [refreshInfo]);

  const handleAuctionFormChange = (name, value) => {
    setAuctionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLbpConfigChange = (name, value) => {
    setLbpConfig((prev) => ({ ...prev, [name]: value }));
  };

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

  const submitAuction = async () => {
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
        vestingDuration: 10800, // 3 hours (3 * 60 * 60 = 10800 seconds)
        merkleRoot: auctionForm.merkleRoot || ethers.ZeroHash,
        priceTicks: auctionForm.priceTicks
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((tick) => ethers.parseEther(tick).toString()),
      };

      setTxStatus({ status: "pending", message: "Creating auction..." });
      showTxInfo("Please confirm the transaction in your wallet", { autoClose: false });
      const tx = await managerContract.createAuction(payload);
      showTxInfo("Transaction submitted to the network", { autoClose: 3000 });
      setTxStatus({ status: "pending", message: "Transaction submitted", hash: tx.hash });
      await tx.wait();
      showTxSuccess("Auction created successfully!", { autoClose: 3000 });
      setTxStatus({ status: "success", message: "Auction created", hash: tx.hash });
      await refreshInfo();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Unable to create auction");
      setTxStatus({ status: "error", message: err?.message || "Unable to create auction" });
    } finally {
      setCreatingAuction(false);
    }
  };

  const runAction = async (label, action, preCheckAction = null, isAccelerateAuction = false) => {
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

      setTxStatus({ status: "pending", message: `${label}…` });
      showTxInfo(`Please confirm ${label.toLowerCase()} in your wallet`, { autoClose: false });
      const tx = await action();
      showTxInfo(`${label} submitted to the network`, { autoClose: 3000 });
      setTxStatus({ status: "pending", message: `${label} submitted`, hash: tx.hash });
      await tx.wait();
      showTxSuccess(`${label} completed successfully!`, { autoClose: 3000 });
      setTxStatus({ status: "success", message: `${label} confirmed`, hash: tx.hash });
      await refreshInfo();
    } catch (err) {
      console.error("Transaction error:", err);

      let errorMessage = err?.message || `Failed to ${label.toLowerCase()}`;

      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }

      if (err?.receipt) {
        console.log("Transaction receipt:", err.receipt);
      }

      if (err?.transaction?.hash) {
        console.log("Transaction hash:", err.transaction.hash);
      }

      if (isAccelerateAuction) {
        if (errorMessage.includes("CommitPhaseComplete") || errorMessage.includes("commit phase")) {
          errorMessage = "Commit phase has already ended. Cannot accelerate auction.";
        } else if (errorMessage.includes("dynamicAdjustmentCount") || errorMessage.includes("already adjusted") || errorMessage.includes("CommitPhaseComplete")) {
          errorMessage = "Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once.";
        } else if (errorMessage.includes("AuctionNotInitialized") || errorMessage.includes("not initialized")) {
          errorMessage = "Auction is not initialized yet.";
        } else if (errorMessage.includes("ConditionsNotMet") || errorMessage.includes("conditions not met")) {
          errorMessage = "Conditions for acceleration are not met. Check that demand check time has passed and demand is below threshold.";
        } else if (errorMessage.includes("totalDepositCommitted") || errorMessage.includes("thresholdLow")) {
          errorMessage = "Demand is above the threshold. Auction will not shorten if participation is sufficient.";
        } else if (errorMessage.includes("missing revert data")) {
          errorMessage = "Transaction failed. Possible reasons: 1) Demand is above threshold, 2) Auction already adjusted, 3) Commit phase ended, or 4) RPC issue. Check console for details.";
        }
      } else {
        if (errorMessage.includes("RevealPhaseClosed") || errorMessage.includes("reveal")) {
          errorMessage = "Reveal phase has not ended yet. Wait for the reveal phase to complete before finalizing.";
        } else if (errorMessage.includes("AuctionNotFinalized") || errorMessage.includes("not finalized")) {
          errorMessage = "Auction must be finalized before launching LBP.";
        } else if (errorMessage.includes("LbpAlreadyLaunched") || errorMessage.includes("already launched")) {
          errorMessage = "LBP has already been launched for this auction.";
        } else if (errorMessage.includes("InvalidLbpTimes") || errorMessage.includes("startTime") || errorMessage.includes("endTime")) {
          errorMessage = "Invalid LBP time configuration. Start time must be before end time.";
        } else if (errorMessage.includes("InvalidVestingDurations") || errorMessage.includes("vesting")) {
          errorMessage = "Invalid vesting configuration. Check vestingCliffDuration and vestingFinalDuration.";
        } else if (errorMessage.includes("CliffPercentTooHigh")) {
          errorMessage = "vestingCliffPercentBP must be <= 10000 (100%).";
        } else if (errorMessage.includes("missing revert data")) {
          errorMessage = `Transaction failed. This might be due to: 1) _deploySecureLBP() failing, 2) auction.launchLbp() failing, 3) Invalid LBP config parameters, or 4) RPC issue. Check Hardhat console for more details.`;
        }
      }
      
      handleTxError(err, errorMessage);
      setTxStatus({ status: "error", message: errorMessage });
    }
  };

  const handleFinalizeAuction = async () => {
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

    runAction("Finalize auction", () => managerContract.finalizeAuction(info.auction), preCheck);
  };

  const handleAccelerateAuction = async () => {
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
          
          console.log('[Accelerate Auction] Pre-check state:', {
            currentCommitEnd: new Date(currentCommitEnd * 1000).toLocaleString(),
            initialCommitEnd: new Date(initialCommitEnd * 1000).toLocaleString(),
            dynamicAdjustmentCount,
            totalDeposit: ethers.formatEther(totalDeposit),
            threshold: ethers.formatEther(threshold),
            isLowDemand: totalDeposit < threshold,
            canShorten: currentCommitEnd < initialCommitEnd
          });
          
          if (dynamicAdjustmentCount > 0) {
            throw new Error("Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once.");
          }
          if (totalDeposit >= threshold && threshold > 0n) {
            throw new Error(`Demand is above threshold (${ethers.formatEther(totalDeposit)} ETH >= ${ethers.formatEther(threshold)} ETH). Auction will not shorten.`);
          }
        }
        await managerContract.checkAndAdjustAuction.staticCall(info.auction);
      } catch (staticErr) {
        if (staticErr?.message?.includes("already adjusted") || 
            staticErr?.message?.includes("Demand is above threshold")) {
          throw staticErr;
        }
        console.warn("Pre-check failed, but will attempt transaction:", staticErr);
      }
    };

    runAction(
      "Accelerate auction",
      () => managerContract.checkAndAdjustAuction(info.auction),
      preCheck,
      true // isAccelerateAuction flag
    ).then(async () => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await refetchAuctionData();
      await refreshInfo();
      if (auctionData) {
        const oldCommitEndTime = auctionData.commitEndTime;
        const oldInitialCommitEndTime = auctionData.initialCommitEndTime;
        if (auctionContract) {
          try {
            const newCommitEndTime = Number(await auctionContract.commitEndTime());
            const newInitialCommitEndTime = Number(await auctionContract.initialCommitEndTime());
            const dynamicAdjustmentCount = Number(await auctionContract.dynamicAdjustmentCount());
            
            console.log('[Accelerate Auction] Status check:', {
              oldCommitEndTime: new Date(oldCommitEndTime * 1000).toLocaleString(),
              newCommitEndTime: new Date(newCommitEndTime * 1000).toLocaleString(),
              oldInitialCommitEndTime: new Date(oldInitialCommitEndTime * 1000).toLocaleString(),
              newInitialCommitEndTime: new Date(newInitialCommitEndTime * 1000).toLocaleString(),
              dynamicAdjustmentCount,
              wasShortened: newCommitEndTime < newInitialCommitEndTime,
              timeDifference: newInitialCommitEndTime - newCommitEndTime
            });
            
            if (dynamicAdjustmentCount > 0 && newCommitEndTime < newInitialCommitEndTime) {
              showTxSuccess("Auction timeline successfully shortened due to low demand.", { autoClose: 5000 });
            } else if (dynamicAdjustmentCount > 0) {
              const timeDiff = newInitialCommitEndTime - newCommitEndTime;
              if (timeDiff === 0) {
                showTxInfo("Dynamic adjustment executed, but commit end time could not be shortened further (minimum duration reached or insufficient reduction).", { autoClose: 8000 });
              } else {
                showTxInfo("Dynamic adjustment executed. Check auction view for updated timeline.", { autoClose: 5000 });
              }
            }
          } catch (err) {
            console.warn("Could not verify auction shortening:", err);
            showTxSuccess("Accelerate auction transaction completed. Refreshing data...", { autoClose: 3000 });
          }
        }
      }
    }).catch((err) => {
      console.error("Accelerate auction error:", err);
    });
  };

  const handleLaunchLbp = async () => {
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

      console.log("=== LBP Launch Diagnostics ===");
      console.log("Auction state:", {
        finalized,
        successful,
        tokensForSale: tokensForSale.toString(),
        tokensSold: tokensSold.toString(),
        unsoldTokens: unsoldTokens.toString(),
        lbpLaunched,
        lbpTokenRecipient: lbpTokenRecipient || "NOT SET",
        lbpStableRecipient: lbpStableRecipient || "NOT SET",
        ethForTreasury: ethers.formatEther(ethForTreasury) + " ETH",
        totalRaised: ethers.formatEther(totalRaised) + " ETH",
        stableForLBP: ethers.formatEther(stableForLBP) + " ETH",
        actualStableForLBP: ethers.formatEther(actualStableForLBP) + " ETH",
        lbpStableShareBps: lbpStableShareBps.toString() + " (=" + (Number(lbpStableShareBps) / 100) + "%)",
      });
      console.log("PresaleManager address:", address);
      console.log("lbpTokenRecipient matches PresaleManager:", lbpTokenRecipient?.toLowerCase() === address.toLowerCase());
      console.log("lbpStableRecipient matches PresaleManager:", lbpStableRecipient?.toLowerCase() === address.toLowerCase());
      console.log("actualStableForLBP > 0:", actualStableForLBP > 0n);
      console.log("CRITICAL: PresaleManager.launchLBP() requires ethReceived > 0 (line 255), but auction.launchLbp() only sends ETH if stableForLBP > 0");
      if (actualStableForLBP === 0n) {
        console.error("PROBLEM: actualStableForLBP is 0! This will cause 'NoEthReceived' error in PresaleManager.launchLBP()");
      }
      console.log("=============================");

      try {
        console.log("Testing auction.launchLbp() directly...");
        const signer = await provider.getSigner();
        const auctionContractWithSigner = auctionContract.connect(signer);
        try {
          await auctionContractWithSigner.launchLbp.staticCall();
          console.log("auction.launchLbp() would succeed (but we're not the manager)");
        } catch (auctionErr) {
          console.error("auction.launchLbp() would fail:", auctionErr?.reason || auctionErr?.message || auctionErr);
        }
      } catch (testErr) {
        console.warn("Could not test auction.launchLbp() directly:", testErr);
      }

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
        console.error("", errorMsg);
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

      try {
        const record = await managerContract.getAuctionRecord(info.auction);
        const recordSaleToken = record.saleToken;

        const saleTokenAddress = await auctionContract.saleToken();
        
        console.log("=== Token Address Check ===");
        console.log("Sale Token Address (from auction):", saleTokenAddress);
        console.log("Sale Token Address (from record):", recordSaleToken);
        console.log("Addresses match:", saleTokenAddress.toLowerCase() === recordSaleToken.toLowerCase());
        console.log("===========================");

        if (saleTokenAddress.toLowerCase() !== recordSaleToken.toLowerCase()) {
          const errorMsg = `Token address mismatch! ` +
            `Auction has: ${saleTokenAddress}, but AuctionRecord has: ${recordSaleToken}. ` +
            `This indicates a configuration error.`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }

        const code = await provider.getCode(saleTokenAddress);
        if (code === "0x" || code === "0x0") {
          const errorMsg = `Token contract does not exist at address ${saleTokenAddress}! ` +
            `\n\nThis means the token was never deployed or the address is wrong. ` +
            `\n\nFrom your deployment, TestToken is at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 ` +
            `\nBut your auction is using: ${saleTokenAddress} ` +
            `\n\nSOLUTION: ` +
            `\n1. Create a new auction with the correct token address (0xa513E6E4b8f2a923D98304ec87F64353C4D5C853), OR ` +
            `\n2. Deploy a token to address ${saleTokenAddress} if you want to use this address.`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }

        const saleTokenAbi = [
          { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
          { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
          { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
        ];
        const saleTokenContract = new ethers.Contract(saleTokenAddress, saleTokenAbi, provider);

        let tokenSymbol = "UNKNOWN";
        try {
          tokenSymbol = await saleTokenContract.symbol();
        } catch (e) {
          console.warn("Could not get token symbol:", e);
        }
        
        const auctionTokenBalance = await saleTokenContract.balanceOf(info.auction);
        const managerTokenBalance = await saleTokenContract.balanceOf(address);
        const managerEthBalance = await provider.getBalance(address);
        
        console.log("=== Token Balance Check ===");
        console.log("Token Symbol:", tokenSymbol);
        console.log("Auction Token Balance:", ethers.formatEther(auctionTokenBalance) + " tokens");
        console.log("Unsold Tokens (need to transfer):", ethers.formatEther(unsoldTokens) + " tokens");
        console.log("PresaleManager Token Balance:", ethers.formatEther(managerTokenBalance) + " tokens");
        console.log("PresaleManager ETH Balance:", ethers.formatEther(managerEthBalance) + " ETH");
        console.log("Expected ETH from auction:", ethers.formatEther(actualStableForLBP) + " ETH");
        console.log("===========================");

        if (auctionTokenBalance < unsoldTokens) {
          const missing = unsoldTokens - auctionTokenBalance;
          const errorMsg = `Auction does not have enough tokens! ` +
            `Required: ${ethers.formatEther(unsoldTokens)} tokens, ` +
            `Available: ${ethers.formatEther(auctionTokenBalance)} tokens, ` +
            `Missing: ${ethers.formatEther(missing)} tokens. ` +
            `\n\nSOLUTION: You need to transfer tokens to the auction address (${info.auction}) before calling launchLbp(). ` +
            `Transfer at least ${ethers.formatEther(unsoldTokens)} tokens (${unsoldTokens.toString()} wei) to the auction. ` +
            `This is likely why launchLbp() is failing with "missing revert data".`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
        
        console.log("Token contract exists and is valid");
        console.log("Token addresses match");
        console.log("Auction has sufficient tokens to transfer unsold tokens");
        console.log("PresaleManager will receive tokens and ETH when auction.launchLbp() is called.");
      } catch (balanceErr) {
        console.error("Error checking token balances:", balanceErr);
        if (balanceErr?.message?.includes("missing revert data") || balanceErr?.code === "CALL_EXCEPTION") {
          try {
            const record = await managerContract.getAuctionRecord(info.auction);
            const recordSaleToken = record.saleToken;
            const code = await provider.getCode(recordSaleToken);
            if (code === "0x" || code === "0x0") {
              const errorMsg = `Token contract does not exist at address ${recordSaleToken}! ` +
                `\n\nThis means the token was never deployed or the address is wrong. ` +
                `\n\nFrom your deployment, TestToken is at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 ` +
                `\nBut your auction is using: ${recordSaleToken} ` +
                `\n\nSOLUTION: ` +
                `\n1. Create a new auction with the correct token address (0xa513E6E4b8f2a923D98304ec87F64353C4D5C853), OR ` +
                `\n2. Deploy a token to address ${recordSaleToken} if you want to use this address.`;
              console.error(errorMsg);
              handleTxError(new Error(errorMsg));
              return;
            }
          } catch (recordErr) {
            console.warn("Could not check record:", recordErr);
          }
          
          const errorMsg = `Cannot read token balance. This might mean: ` +
            `1) Token address is invalid or doesn't exist, ` +
            `2) Token contract is not deployed, or ` +
            `3) Token address in AuctionRecord is wrong. ` +
            `\n\nPlease verify the saleToken address is correct. ` +
            `\nFrom your deployment, TestToken should be at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
      }

      console.log("Validating LBP config parameters...");
      console.log("LBP Config:", {
        startTime: launchLbpConfig.startTime,
        endTime: launchLbpConfig.endTime,
        poolStartWeightToken: launchLbpConfig.poolStartWeightToken,
        poolEndWeightToken: launchLbpConfig.poolEndWeightToken,
        poolSwapFee: launchLbpConfig.poolSwapFee,
        vestingStartTime: launchLbpConfig.vestingStartTime,
        vestingCliffDuration: launchLbpConfig.vestingCliffDuration,
        maxContributionPerAddress: launchLbpConfig.maxContributionPerAddress,
        vestingFinalDuration: launchLbpConfig.vestingFinalDuration,
        vestingCliffPercentBP: launchLbpConfig.vestingCliffPercentBP,
      });

      if (info.lbp === ethers.ZeroAddress || !info.lbp) {
        console.log("LBP will be deployed (record.lbp is zero)");
        if (launchLbpConfig.startTime >= launchLbpConfig.endTime) {
          handleTxError(new Error("LBP start time must be before end time"));
          return;
        }
        if (Number(launchLbpConfig.poolStartWeightToken) === 0 || Number(launchLbpConfig.poolEndWeightToken) === 0) {
          handleTxError(new Error("Pool weights must be greater than 0"));
          return;
        }
        if (launchLbpConfig.vestingCliffPercentBP > 10000) {
          handleTxError(new Error("vestingCliffPercentBP must be <= 10000 (100%)"));
          return;
        }
        if (launchLbpConfig.vestingFinalDuration < launchLbpConfig.vestingCliffDuration) {
          handleTxError(new Error("vestingFinalDuration must be >= vestingCliffDuration"));
          return;
        }
        console.log("All LBP deployment parameters are valid");
      } else {
        console.log("LBP already exists:", info.lbp);
      }

      console.log("All pre-checks passed. Ready to launch LBP.");

    } catch (err) {
      console.warn("Could not check auction state:", err);
    }

    try {
      const record = await managerContract.getAuctionRecord(info.auction);
      console.log("AuctionRecord:", {
        saleToken: record.saleToken || "NOT SET",
        treasury: record.treasury || "NOT SET",
        lbp: record.lbp || "NOT SET (will be deployed)",
      });
      
      if (!record.saleToken || record.saleToken === ethers.ZeroAddress) {
        handleTxError(new Error("AuctionRecord.saleToken is not set. This is required for LBP deployment."));
        return;
      }
      
      if (!record.treasury || record.treasury === ethers.ZeroAddress) {
        handleTxError(new Error("AuctionRecord.treasury is not set. This is required for LBP deployment."));
        return;
      }
    } catch (recordErr) {
      console.warn("Could not check AuctionRecord:", recordErr);
    }

    console.log("Attempting transaction without preCheck to see real error...");
    
    const launchAction = async () => {
      const tx = await managerContract.launchLBP(info.auction, launchLbpConfig);
      await tx.wait();
      if (lbpConfig.maxContributionPerAddress && Number(lbpConfig.maxContributionPerAddress) > 0) {
        try {
          const record = await managerContract.getAuctionRecord(info.auction);
          if (record.lbp && record.lbp !== ethers.ZeroAddress) {
            const allAbis = await import("../abi/allAbis.json");
            const lbpAbi = allAbis.SecureLBP || [];
            const { BrowserProvider } = await import("ethers");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const lbpContract = new ethers.Contract(record.lbp, lbpAbi, signer);
            const maxContributionWei = ethers.parseEther(lbpConfig.maxContributionPerAddress);
            const setMaxTx = await lbpContract.setMaxContributionPerAddress(maxContributionWei);
            await setMaxTx.wait();
            console.log("Max contribution per address set to", lbpConfig.maxContributionPerAddress, "ETH");
          }
        } catch (err) {
          console.warn("Failed to set max contribution per address:", err);
        }
      }
      
      return tx;
    };
    
    runAction("Launch LBP", launchAction, null);
  };

  const handleFinalizeLbp = async () => {
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
      
      console.log("=== Finalize LBP - Pre-check ===");
      console.log("Auction Address:", info.auction);
      console.log("LBP Address (from record):", recordLbp);
      console.log("Vesting Escrow (from record):", recordVestingEscrow);
      console.log("Vesting Escrow (from info):", info.vesting);
      console.log("Record LBP Initialized:", record.lbpInitialized);
      console.log("Record LBP Finalized:", record.lbpFinalized);
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
      
      console.log("LBP State:", {
        lbpAddress: recordLbp,
        lbpVestingEscrow,
        lbpTotalTokensAllocated: lbpTotalTokensAllocated.toString(),
        lbpTokenBalance: lbpTokenBalance.toString(),
        lbpFinalized,
        hasEnoughTokens: lbpTokenBalance >= lbpTotalTokensAllocated,
      });
      let vestingEscrowToUse = recordVestingEscrow;
      if (vestingEscrowToUse === ethers.ZeroAddress || !vestingEscrowToUse) {
        vestingEscrowToUse = info.vesting || ethers.ZeroAddress;
      }
      if (vestingEscrowToUse === ethers.ZeroAddress && lbpVestingEscrow !== ethers.ZeroAddress) {
        vestingEscrowToUse = lbpVestingEscrow;
        console.log("⚠️ Using vesting escrow from LBP:", vestingEscrowToUse);
      }
      if (vestingEscrowToUse === ethers.ZeroAddress) {
        console.log("⚠️ No vesting escrow found. A new one will be created automatically.");
      } else {
        try {
          const escrowContract = new ethers.Contract(vestingEscrowToUse, escrowAbi, provider);
          const [escrowToken, escrowLBP] = await Promise.all([
            escrowContract.token().catch(() => ethers.ZeroAddress),
            escrowContract.secureLBP().catch(() => ethers.ZeroAddress),
          ]);
          
          console.log("Vesting Escrow Verification:", {
            escrowAddress: vestingEscrowToUse,
            escrowToken,
            escrowLBP,
            matchesRecordLBP: escrowLBP.toLowerCase() === recordLbp.toLowerCase(),
          });
          
          if (escrowLBP.toLowerCase() !== recordLbp.toLowerCase()) {
            console.warn("⚠️ WARNING: Vesting escrow is linked to a different LBP!", {
              escrowLBP,
              recordLbp,
            });
          }
        } catch (err) {
          console.warn("Could not verify vesting escrow:", err);
        }
      }
      
      console.log("=== Final Vesting Escrow Selection ===");
      console.log("Vesting Escrow to use:", vestingEscrowToUse);
      console.log("=====================================");
      await runAction(
        "Finalize LBP",
        () => managerContract.finalizeLbp(info.auction, vestingEscrowToUse !== ethers.ZeroAddress ? vestingEscrowToUse : ethers.ZeroAddress),
        null
      );
      if (vestingEscrowToUse && vestingEscrowToUse !== ethers.ZeroAddress) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for block confirmation
          const escrowContract = new ethers.Contract(vestingEscrowToUse, escrowAbi, provider);
          const tokenAddress = await escrowContract.token().catch(() => ethers.ZeroAddress);
          if (tokenAddress !== ethers.ZeroAddress) {
            const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
            if (tokenAbi.length > 0) {
              const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
              const escrowBalance = await tokenContract.balanceOf(vestingEscrowToUse).catch(() => 0n);
              console.log("=== Post-Finalize Verification ===");
              console.log("Vesting Escrow Balance:", ethers.formatEther(escrowBalance));
              console.log("Expected Tokens:", ethers.formatEther(lbpTotalTokensAllocated));
              console.log("Tokens transferred:", escrowBalance >= lbpTotalTokensAllocated ? "✓ Yes" : "✗ No");
              console.log("==================================");
              
              if (escrowBalance < lbpTotalTokensAllocated) {
                console.warn("⚠️ WARNING: Not all tokens were transferred to vesting escrow!");
                const shortfall = lbpTotalTokensAllocated - escrowBalance;
                console.warn("Missing tokens:", ethers.formatEther(shortfall));
              } else {
                console.log("✓ Tokens successfully transferred to vesting escrow!");
              }
            }
          }
        } catch (verifyErr) {
          console.warn("Could not verify token transfer:", verifyErr);
        }
      }
    } catch (err) {
      console.error("Error in handleFinalizeLbp:", err);
      handleTxError(err, "Failed to finalize LBP");
    }
  };

  const handleUnwind = () =>
    runAction("Unwind LBP", () => managerContract.unwindLbpAll(info.auction));

  const heroStats = info
    ? [
        { label: "Owner", value: info.owner || "—" },
        { label: "Auction", value: info.auction || "Pending" },
        { label: "LBP", value: info.lbp || "Not initialized" },
        { label: "Vesting escrow", value: info.vesting || "Not created" },
      ]
    : [];

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[radial-gradient(circle_at_15%_-5%,rgba(99,102,241,0.3),transparent_45%),radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.25),transparent_50%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.2),transparent_60%),linear-gradient(135deg,rgba(2,6,23,0.95),rgba(15,23,42,0.9))] p-10 shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset,0_1px_0_rgba(255,255,255,0.1)_inset] backdrop-blur-[20px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_70px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_0_rgba(255,255,255,0.15)_inset] before:absolute before:inset-0 before:pointer-events-none before:bg-[linear-gradient(135deg,rgba(99,102,241,0.1),transparent_60%),linear-gradient(225deg,rgba(16,185,129,0.08),transparent_70%)] before:opacity-60 after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.03),transparent_50%)] md:p-8 sm:p-6">
        <div className="relative z-10 mb-2 flex flex-col gap-6">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-white/65 before:content-['⚡'] before:text-base before:opacity-80">Presale manager</p>
            <h1 className="m-0 bg-gradient-to-br from-white to-white/85 bg-clip-text text-4xl font-bold leading-tight tracking-[-0.02em] text-transparent break-all sm:text-3xl sm:text-2xl">{address}</h1>
          </div>
          {info?.auction && (
            <Link 
              to={`/presale/${address}/auction`} 
              className="inline-flex w-1/5 items-center gap-2 whitespace-nowrap rounded-2xl border-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-green-400 px-7 py-3 text-sm font-semibold text-white no-underline shadow-[0_8px_20px_rgba(99,102,241,0.3),0_0_0_1px_rgba(255,255,255,0.1)_inset] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_12px_30px_rgba(99,102,241,0.4),0_0_0_1px_rgba(255,255,255,0.15)_inset] active:translate-y-0 active:scale-100 after:content-['→'] after:text-lg after:transition-transform after:duration-300 hover:after:translate-x-1"
            >
              Open auction view
            </Link>
          )}
        </div>
        {info && (
          <div className="relative z-10 mt-8 grid grid-cols-1 gap-5 border-t border-white/8 pt-8 sm:mt-6 sm:gap-4 sm:pt-6 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {heroStats.map((stat) => (
              <div 
                key={stat.label} 
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/70 to-slate-800/50 p-5 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[10px] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-gradient-to-br hover:from-slate-900/85 hover:to-slate-800/65 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-indigo-500/60 before:via-green-500/60 before:to-indigo-500/60 before:bg-[length:200%_100%] before:animate-shimmer sm:p-4"
              >
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/65">{stat.label}</span>
                <strong className="mt-1 block font-mono text-[0.95rem] font-medium leading-snug text-white break-all">{stat.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {txStatus && (
        <div className={`flex items-center justify-between gap-4 rounded-2xl border px-6 py-4 text-base font-medium backdrop-blur-[10px] shadow-[0_4px_12px] animate-slideIn sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-4 ${
          txStatus.status === "success" 
            ? "border-green-500/50 bg-green-500/15 text-green-100 shadow-green-500/20" 
            : txStatus.status === "error"
            ? "border-red-500/50 bg-red-500/12 text-red-100 shadow-red-500/15"
            : "border-blue-500/40 bg-blue-500/12 text-blue-100 shadow-blue-500/15"
        }`}>
          <span>{txStatus.message}</span>
          {txStatus.hash && (
            <span className={`font-mono text-sm rounded-lg border px-3 py-1.5 ${
              txStatus.status === "success"
                ? "border-green-500/30 bg-green-500/15 text-green-500/95"
                : txStatus.status === "error"
                ? "border-red-500/30 bg-red-500/15 text-red-500/95"
                : "border-yellow-500/20 bg-yellow-500/10 text-yellow-500/95"
            }`}>
              {shortenHash(txStatus.hash)}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 text-center text-lg text-white/70 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">Loading…</div>
      ) : error ? (
        <div className="rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-900/20 to-red-800/15 p-8 text-red-100 shadow-[0_20px_50px_rgba(239,68,68,0.15),0_0_0_1px_rgba(239,68,68,0.2)_inset] sm:p-6 sm:p-5">{error}</div>
      ) : (
        <>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
            <AuctionControls
              isOwner={isOwner}
              auctionAddress={info?.auction}
              onFinalizeAuction={handleFinalizeAuction}
              onLaunchLbp={handleLaunchLbp}
              onFinalizeLbp={handleFinalizeLbp}
              onUnwind={handleUnwind}
              onAccelerateAuction={handleAccelerateAuction}
              lbpConfig={lbpConfig}
              onLbpConfigChange={handleLbpConfigChange}
              disabled={!info?.auction}
              auctionData={auctionData}
              currentTime={currentTime}
            />
          </div>

          {/* Early Incentives Management (Owner Only) */}
          {isOwner && auctionContract && info?.auction && (
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
              <BonusMerkleManager
                auctionContract={auctionContract}
                auctionAddress={info.auction}
                auctionData={auctionData}
                onUpdate={async () => {
                  await refetchAuctionData();
                  await refreshInfo();
                }}
              />
            </div>
          )}

          {auctions.length > 0 && (
            <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
              <p className="mb-5 flex items-center gap-2 text-lg font-semibold text-white before:content-['📋'] before:text-xl">Deployed auctions</p>
              <ul className="m-0 flex flex-col gap-3.5 p-0 list-none">
                {auctions.map((auctionAddress) => (
                  <li 
                    key={auctionAddress}
                    className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-4 font-mono text-sm text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:translate-x-1 hover:border-white/12 hover:bg-gradient-to-br hover:from-slate-900/95 hover:to-slate-800/75 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-gradient-to-b before:from-indigo-500/80 before:to-green-500/80 before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100"
                  >
                    {auctionAddress}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default PresalePage;
