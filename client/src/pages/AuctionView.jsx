/* eslint-env es2020 */
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ethers } from "ethers";

import PriceDecayChart from "../components/auction/PriceDecayChart";
import AuctionHeader from "../components/auction/AuctionHeader";
import AuctionStatusGrid from "../components/auction/AuctionStatusGrid";
import AuctionTimeline from "../components/auction/AuctionTimeline";
import ReservePanel from "../components/auction/ReservePanel";
import CommitForm from "../components/auction/CommitForm";
import RevealForm from "../components/auction/RevealForm";
import PriceBucketPanel from "../components/auction/PriceBucketPanel";
import AllocationPanel from "../components/auction/AllocationPanel";
import FinalizedPanel from "../components/auction/FinalizedPanel";
import FinalAllocationPanel from "../components/auction/FinalAllocationPanel";
import ClaimPanel from "../components/auction/ClaimPanel";
import FailedAuctionRefundPanel from "../components/auction/FailedAuctionRefundPanel";
import UnrevealedCommitsPanel from "../components/auction/UnrevealedCommitsPanel";
import EventsPanel from "../components/auction/EventsPanel";
import DeveloperTimeControls from "../components/common/DeveloperTimeControls";


import { useAuctionContracts } from "../hooks/useAuctionContracts";
import { useAuctionData } from "../hooks/useAuctionData";
import { useUserAuctionData } from "../hooks/useUserAuctionData";
import { useAuctionEvents } from "../hooks/useAuctionEvents";
import { useAccount as useWagmiAccount } from "wagmi";
import { useTransaction } from "../hooks/useTransaction";
import { useChainId } from "wagmi";
import { useTime } from "../time";


import { getPhase, getTimeUntil, formatTokenUnits } from "../utils/auctionUtils";
import { ensureSigner } from "../services/web3/signer";
import { ensureProvider, setTargetChainIdHex } from "../services/web3/provider";
import { generateCommitHash, parseMerkleProof, calculateDeposit, validateMerkleProof } from "../utils/commitUtils";
import { REFRESH_INTERVAL_MS, PHASES, DEFAULT_LBP_CONFIG } from "../constants/auction";
import { deepEqual } from "../utils/objectUtils";
import { handleTxError } from "../utils/txErrorHandler";
import { loadBonusAllocationFromIPFS } from "../utils/ipfsBonusAllocations";


const AuctionView = () => {
  const { address } = useParams();
  const chainId = useChainId();

  const { address: account } = useWagmiAccount();
  const {
    managerContract,
    auctionContract,
    auctionAddress,
    loading: contractsLoading,
    error: contractsError,
  } = useAuctionContracts(address);

  const {
    data: auctionDataRaw,
    loading: auctionDataLoading,
    error: auctionDataError,
    refetch: refetchAuctionData,
  } = useAuctionData(auctionContract, managerContract, auctionAddress);

  const prevAuctionDataRef = useRef(null);
  const auctionData = useMemo(() => {
    if (!auctionDataRaw) {
      prevAuctionDataRef.current = null;
      return null;
    }
    if (prevAuctionDataRef.current && deepEqual(auctionDataRaw, prevAuctionDataRef.current)) {
      return prevAuctionDataRef.current;
    }
    prevAuctionDataRef.current = auctionDataRaw;
    return auctionDataRaw;
  }, [auctionDataRaw]);

  const {
    data: userDataRaw,
    refetch: refetchUserData,
  } = useUserAuctionData(auctionContract, account, auctionData?.finalized);

  const prevUserDataRef = useRef(null);
  const userData = useMemo(() => {
    if (!userDataRaw) {
      prevUserDataRef.current = null;
      return null;
    }
    
    if (prevUserDataRef.current && deepEqual(userDataRaw, prevUserDataRef.current)) {
      return prevUserDataRef.current;
    }
    
    prevUserDataRef.current = userDataRaw;
    return userDataRaw;
  }, [userDataRaw]);

  const {
    events: eventsRaw,
    refetch: refetchEvents,
  } = useAuctionEvents(auctionContract);

  const prevEventsRef = useRef(null);
  const events = useMemo(() => {
    if (!eventsRaw || eventsRaw.length === 0) {
      if (!prevEventsRef.current || prevEventsRef.current.length > 0) {
        prevEventsRef.current = eventsRaw || [];
      }
      return prevEventsRef.current;
    }
    if (prevEventsRef.current &&
        prevEventsRef.current.length === eventsRaw.length &&
        prevEventsRef.current.every((evt, idx) => evt === eventsRaw[idx] || deepEqual(evt, eventsRaw[idx]))) {
      return prevEventsRef.current;
    }
    
    prevEventsRef.current = eventsRaw;
    return eventsRaw;
  }, [eventsRaw]);

  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const { currentTime, refreshTime, setProvider: setTimeProvider } = useTime();

  useEffect(() => {
    if (chainId) {
      const chainIdHex = `0x${chainId.toString(16)}`;
      setTargetChainIdHex(chainIdHex);
    }
  }, [chainId]);

  useEffect(() => {
    const bindProvider = async () => {
      const contractProvider = auctionContract?.provider || auctionContract?.runner?.provider;
      let providerToUse = contractProvider;
      
      if (!providerToUse) {
        try {
          providerToUse = ensureProvider(chainId || null);
        } catch (err) {
          console.warn("Could not get provider for time service:", err);
        }
      }
      
      if (providerToUse) {
        setTimeProvider(providerToUse);
        refreshTime().catch((err) => {
          console.warn("Failed to refresh time service:", err);
        });
      }
    };

    if (auctionContract) {
      bindProvider();
    }
  }, [auctionContract, chainId, setTimeProvider, refreshTime]);

  const [commitForm, setCommitForm] = useState({
    quantity: "",
    priceTickIndex: "0",
    nonce: "",
    merkleProof: "",
  });

  const [revealForm, setRevealForm] = useState({
    commitIndex: "0",
    quantity: "",
    priceTickIndex: "0",
    nonce: "",
  });

  const tx = useTransaction();

  const phase = useMemo(() => {
    if (!auctionData) return "Loading";
    return getPhase(
      currentTime,
      auctionData.startTime,
      auctionData.commitEndTime,
      auctionData.revealEndTime,
      auctionData.finalized
    );
  }, [currentTime, auctionData]);

  const countdown = useMemo(() => {
    if (!auctionData) return null;
    
    let targetTime;
    if (phase === PHASES.NOT_STARTED) {
      targetTime = auctionData.startTime;
    } else if (phase === PHASES.COMMIT) {
      targetTime = auctionData.commitEndTime;
    } else if (phase === PHASES.REVEAL) {
      targetTime = auctionData.revealEndTime;
    } else {
      return null;
    }
    const remaining = Number(targetTime) - currentTime;
    if (remaining <= 0) return null;
    
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    
    return `${hours}h ${minutes}m ${seconds}s`;
  }, [phase, auctionData, currentTime]);

  useEffect(() => {
    const fetchOwner = async () => {
      if (!managerContract || !account) {
        setIsOwner(false);
        return;
      }
      try {
        const ownerAddress = await managerContract.owner();
        setIsOwner(ownerAddress?.toLowerCase() === account?.toLowerCase());
      } catch (error) {
        console.warn("Could not fetch owner:", error);
        setIsOwner(false);
      }
    };
    fetchOwner();
  }, [managerContract, account]);

  const isInitialLoading = contractsLoading || (auctionDataLoading && !auctionData);
  const error = contractsError || auctionDataError;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshTime();
      
      await Promise.all([
        refetchAuctionData(),
        account && refetchUserData(),
        refetchEvents(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAuctionData, refetchUserData, refetchEvents, account, refreshTime]);

  const handleCommit = useCallback(async () => {
    if (!auctionContract || !auctionData) return;

    let qty;
    if (typeof commitForm.quantity === "string") {
      qty = ethers.parseUnits(commitForm.quantity, 18);
    } else {
      qty = BigInt(commitForm.quantity || "0");
    }
    
    if (qty <= 0n) {
      throw new Error("Quantity must be greater than zero");
    }

    if (!auctionData.priceTicks || auctionData.priceTicks.length === 0) {
      throw new Error("Price ticks not loaded");
    }

    const referencePrice = auctionData.priceTicks[0];
    const depositValue = calculateDeposit(commitForm.quantity, referencePrice, 18);

    if (depositValue === 0n) {
      throw new Error("Unable to compute deposit. Check price ticks and quantity.");
    }

    const priceTickIndex = BigInt(commitForm.priceTickIndex || "0");
    const nonce = commitForm.nonce
      ? (commitForm.nonce.startsWith("0x") && commitForm.nonce.length === 66
          ? commitForm.nonce
          : ethers.id(commitForm.nonce))
      : ethers.ZeroHash;

    const commitHash = generateCommitHash(priceTickIndex, commitForm.quantity, nonce, 18);
    if (!commitHash) {
      throw new Error("Failed to generate commit hash");
    }

    const merkleProof = parseMerkleProof(commitForm.merkleProof);

    const isWhitelistEnabled = auctionData.merkleRoot && 
      auctionData.merkleRoot !== ethers.ZeroHash && 
      auctionData.merkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000";

    if (isWhitelistEnabled) {
      if (merkleProof.length === 0) {
        throw new Error("Merkle proof is required for this whitelisted auction. Please upload the whitelist JSON file or enter your proof manually.");
      }

      const validation = validateMerkleProof(merkleProof);
      if (!validation.valid) {
        throw new Error(`Invalid Merkle proof format: ${validation.error}. Please check your proof and try again.`);
      }
    }

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const auctionWithSigner = auctionContract.connect(signer);
        try {
          await auctionWithSigner.commit.estimateGas(commitHash, merkleProof, { value: depositValue });
        } catch (estimateError) {
          const errorMessage = estimateError?.message || estimateError?.reason || String(estimateError);
          const errorString = JSON.stringify(estimateError || {});
          const errorCode = estimateError?.code;
          if (
            errorMessage.includes("InvalidProof") || 
            errorMessage.includes("invalid proof") || 
            errorMessage.includes("proof") ||
            errorString.includes("InvalidProof") ||
            errorString.includes("invalid proof")
          ) {
            const userError = new Error("Invalid Merkle proof. Your address may not be in the whitelist, or the proof is incorrect. Please verify your proof and try again.");
            userError.name = "InvalidProofError";
            throw userError;
          }
          
          if (errorMessage.includes("AuctionNotActive") || errorMessage.includes("not active")) {
            const userError = new Error("Auction is not active. Please check the auction timing.");
            userError.name = "AuctionNotActiveError";
            throw userError;
          }
          
          if (errorMessage.includes("CapExceeded") || errorMessage.includes("cap")) {
            const userError = new Error("You have exceeded your per-address cap. Please reduce the quantity.");
            userError.name = "CapExceededError";
            throw userError;
          }
          if (errorCode === "CALL_EXCEPTION" || errorMessage.includes("CALL_EXCEPTION") || errorMessage.includes("missing revert data")) {
            if (isWhitelistEnabled) {
              const userError = new Error("Invalid Merkle proof. Your address may not be in the whitelist, or the proof is incorrect. Please verify your proof and try again.");
              userError.name = "InvalidProofError";
              throw userError;
            }
            const userError = new Error("Transaction would fail. Please check your inputs and try again.");
            userError.name = "TransactionError";
            throw userError;
          }
          console.warn("Gas estimation failed, but proceeding with transaction:", estimateError);
        }
        return await auctionWithSigner.commit(commitHash, merkleProof, { value: depositValue });
      },
      {
        pendingMessage: "Submitting commit…",
        successMessage: "Commit confirmed successfully!",
        errorMessage: "Commit failed",
        onSuccess: async () => {
          await handleRefresh();
        },
      }
    );
  }, [auctionContract, auctionData, commitForm, tx, handleRefresh]);

  const handleReveal = useCallback(async () => {
    if (!auctionContract || !auctionData) return;

    let qty;
    if (typeof revealForm.quantity === "string") {
      qty = ethers.parseUnits(revealForm.quantity, 18);
    } else if (typeof revealForm.quantity === "number") {
      qty = ethers.parseUnits(revealForm.quantity.toString(), 18);
    } else {
      qty = BigInt(revealForm.quantity || "0");
    }
    
    if (qty <= 0n) {
      throw new Error("Quantity must be greater than zero");
    }

    const priceTickIndex = BigInt(revealForm.priceTickIndex || "0");
    const nonce = revealForm.nonce
      ? (revealForm.nonce.startsWith("0x") && revealForm.nonce.length === 66
          ? revealForm.nonce
          : ethers.id(revealForm.nonce))
      : ethers.ZeroHash;
    const commitIndex = Number(revealForm.commitIndex || 0);

    try {
      await tx.execute(
        async () => {
          const signer = await ensureSigner();
          const auctionWithSigner = auctionContract.connect(signer);
          return await auctionWithSigner.reveal(priceTickIndex, qty, nonce, commitIndex);
        },
        {
          pendingMessage: "Submitting reveal…",
          successMessage: "Reveal confirmed successfully!",
          errorMessage: "Reveal failed. Please check your commit index, quantity, price tick, and nonce match your original commit.",
          onSuccess: async () => {
            await handleRefresh();
          },
        }
      );
    } catch (err) {
      let errorMessage = err?.message || "Reveal failed";
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      if (err?.code === "CALL_EXCEPTION" || errorMessage.includes("missing revert data")) {
        errorMessage = "Reveal transaction failed. Possible reasons: " +
          "1) Commit index is incorrect, " +
          "2) Quantity, price tick, or nonce doesn't match the original commit, " +
          "3) Reveal phase has ended, " +
          "4) This commit has already been revealed. " +
          "Please verify all values match your original commit exactly.";
      } else if (errorMessage.includes("InvalidCommitIndex") || errorMessage.includes("commit index")) {
        errorMessage = "Invalid commit index. Please check the commit index matches your commit.";
      } else if (errorMessage.includes("CommitAlreadyRevealed") || errorMessage.includes("already revealed")) {
        errorMessage = "This commit has already been revealed.";
      } else if (errorMessage.includes("RevealPhaseClosed") || errorMessage.includes("reveal phase")) {
        errorMessage = "Reveal phase has ended. You can no longer reveal commits.";
      } else if (errorMessage.includes("InvalidReveal") || errorMessage.includes("commit hash")) {
        errorMessage = "Reveal parameters don't match the original commit. Verify quantity, price tick, and nonce.";
      }
      console.error("Reveal error details:", err);
    }
  }, [auctionContract, revealForm, tx, handleRefresh]);

  const handleFinalize = useCallback(async () => {
    if (!managerContract || !auctionAddress) return;

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const managerWithSigner = managerContract.connect(signer);
        return await managerWithSigner.finalizeAuction(auctionAddress);
      },
      {
        pendingMessage: "Finalizing auction…",
        successMessage: "Auction finalized successfully!",
        errorMessage: "Finalize failed",
        onSuccess: async () => {
          await Promise.all([refetchAuctionData(), refetchEvents()]);
        },
      }
    );
  }, [managerContract, auctionAddress, tx, refetchAuctionData, refetchEvents]);

  const handleLaunchLBP = useCallback(async () => {
    if (!managerContract || !auctionAddress) return;

    const blockchainTime = currentTime;

    const lbpConfig = {
      startTime: blockchainTime + 3600, // 1 hour from now
      endTime: blockchainTime + 86400, // 24 hours from now
      poolStartWeightToken: ethers.parseEther(DEFAULT_LBP_CONFIG.poolStartWeightToken),
      poolEndWeightToken: ethers.parseEther(DEFAULT_LBP_CONFIG.poolEndWeightToken),
      poolSwapFee: ethers.parseEther(DEFAULT_LBP_CONFIG.poolSwapFee),
      vestingStartTime: blockchainTime + 3600,
      vestingCliffDuration: DEFAULT_LBP_CONFIG.vestingCliffDuration,
      vestingFinalDuration: DEFAULT_LBP_CONFIG.vestingFinalDuration,
      vestingCliffPercentBP: DEFAULT_LBP_CONFIG.vestingCliffPercentBP,
    };

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const managerWithSigner = managerContract.connect(signer);
        return await managerWithSigner.launchLBP(auctionAddress, lbpConfig);
      },
      {
        pendingMessage: "Launching LBP…",
        successMessage: "LBP launched successfully!",
        errorMessage: "LBP launch failed",
        onSuccess: async () => {
          await Promise.all([refetchAuctionData(), refetchEvents()]);
        },
      }
    );
  }, [managerContract, auctionAddress, currentTime, tx, refetchAuctionData, refetchEvents]);

  const handleDemandCheck = useCallback(async () => {
    if (!managerContract || !auctionAddress || !auctionContract || !auctionData) {
      handleTxError(new Error("Missing required contracts or data"));
      return;
    }

    try {
      const upkeepControllerAddr = await managerContract.upkeepController();
      if (!upkeepControllerAddr || upkeepControllerAddr === ethers.ZeroAddress) {
        handleTxError(new Error("UpkeepController not configured"));
        return;
      }

      const allAbis = await import("../abi/allAbis.json");
      const { ensureProvider } = await import("../services/web3/provider");
      const provider = ensureProvider();
      const { Contract } = await import("ethers");
      const upkeepControllerAbi = allAbis.UpkeepController || [];
      if (upkeepControllerAbi.length === 0) {
        handleTxError(new Error("UpkeepController ABI not found"));
        return;
      }

      const upkeepController = new Contract(upkeepControllerAddr, upkeepControllerAbi, provider);
      const isRegistered = await upkeepController.isRegistered(auctionAddress);
      if (!isRegistered) {
        handleTxError(new Error("Auction is not registered in UpkeepController. Please register it first."));
        return;
      }

      const alreadyTriggered = await upkeepController.demandCheckTriggered(auctionAddress);
      if (alreadyTriggered) {
        handleTxError(new Error("Demand check has already been triggered for this auction"));
        return;
      }

      const demandCheckTime = await upkeepController.demandCheckTime(auctionAddress);
      if (demandCheckTime === 0n) {
        handleTxError(new Error("Demand check time is not set for this auction"));
        return;
      }

      const currentTimeBigInt = BigInt(currentTime);
      if (currentTimeBigInt < demandCheckTime) {
        const timeUntil = demandCheckTime - currentTimeBigInt;
        const timeUntilNumber = Number(timeUntil);
        const hours = Math.floor(timeUntilNumber / 3600);
        const minutes = Math.floor((timeUntilNumber % 3600) / 60);
        handleTxError(new Error(`Demand check time has not been reached yet. Time remaining: ${hours}h ${minutes}m`));
        return;
      }

      const commitEndTimeBigInt = BigInt(auctionData.commitEndTime);
      if (currentTimeBigInt >= commitEndTimeBigInt) {
        handleTxError(new Error("Commit phase has already ended. Cannot trigger demand check."));
        return;
      }

      if (auctionData.dynamicAdjustmentCount > 0) {
        handleTxError(new Error("Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once."));
        return;
      }

      const totalDepositCommitted = auctionData.totalDepositCommitted || 0n;
      const thresholdLow = auctionData.thresholdLow || 0n;
      if (thresholdLow > 0n && totalDepositCommitted >= thresholdLow) {
        handleTxError(new Error(`Current deposits (${ethers.formatEther(totalDepositCommitted)} ETH) are above the threshold (${ethers.formatEther(thresholdLow)} ETH). Demand check will not trigger adjustment.`));
        return;
      }

      const DEMAND_CHECK_GRACE = 15 * 60; // 15 minutes in seconds
      if (currentTimeBigInt > demandCheckTime + BigInt(DEMAND_CHECK_GRACE)) {
        handleTxError(new Error("Demand check grace period (15 minutes) has expired. Cannot trigger demand check."));
        return;
      }
    } catch (preCheckError) {
      console.error("Pre-check error:", preCheckError);
      handleTxError(new Error(`Pre-check failed: ${preCheckError.message || "Unknown error"}`));
      return;
    }

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const managerWithSigner = managerContract.connect(signer);
        return await managerWithSigner.checkAndAdjustAuction(auctionAddress);
      },
      {
        pendingMessage: "Triggering demand check…",
        successMessage: "Demand check triggered successfully!",
        errorMessage: "Demand check failed",
        onSuccess: async () => {
          await Promise.all([refetchAuctionData(), refetchEvents()]);
        },
      }
    );
  }, [managerContract, auctionAddress, auctionContract, auctionData, currentTime, tx, refetchAuctionData, refetchEvents]);

  const handleClaim = useCallback(async () => {
    if (!auctionContract || !auctionData || !userData || !account) return;

    let bonusClaimed = false;
    let bonusQty = 0n;
    let merkleProof = [];

    console.log('[Claim] Starting claim process:', {
      auctionAddress,
      userAddress: account,
      hasAuctionContract: !!auctionContract,
      hasAuctionData: !!auctionData,
      bonusMerkleRoot: auctionData?.bonusMerkleRoot,
      bonusMerkleRootSet: auctionData?.bonusMerkleRoot && auctionData.bonusMerkleRoot !== ethers.ZeroHash
    });

    try {
      if (auctionContract && account) {
        try {
          bonusClaimed = await auctionContract.bonusClaimed(account);
          console.log('[Claim] Bonus claim status checked:', {
            bonusClaimed,
            userAddress: account
          });
        } catch (err) {
          console.warn('[Claim] Could not check bonusClaimed:', err);
        }
      }

      if (!bonusClaimed && auctionData?.bonusMerkleRoot && 
          auctionData.bonusMerkleRoot !== ethers.ZeroHash && 
          auctionAddress) {
        const merkleRoot = auctionData.bonusMerkleRoot;
        let bonusAllocation = null;
        const ipfsCID = auctionData?.bonusAllocationsCID || null;
        if (ipfsCID) {
          console.log('[Claim] Loading bonus allocation from IPFS...', { cid: ipfsCID });
          try {
            bonusAllocation = await loadBonusAllocationFromIPFS(
              ipfsCID,
              account,
              auctionAddress,
              merkleRoot
            );
            if (bonusAllocation) {
              console.log('[Claim] Bonus allocation loaded from IPFS');
            } else {
              console.warn('[Claim] No bonus allocation found in IPFS for this address');
            }
          } catch (ipfsError) {
            console.error('[Claim] Error loading from IPFS:', ipfsError);
            console.warn('[Claim] Cannot load bonus allocation from IPFS. Please ensure CID is set correctly.');
          }
        } else {
          console.warn('[Claim] No IPFS CID found for this auction. Bonus allocation cannot be loaded.');
          console.warn('   Owner should set the IPFS CID in BonusMerkleManager component.');
        }
        
        if (bonusAllocation) {
          bonusQty = BigInt(bonusAllocation.bonusQty);
          merkleProof = bonusAllocation.merkleProof || [];
          console.log('[Claim] Bonus allocation ready:', {
            bonusQty: bonusQty.toString(),
            bonusQtyFormatted: `${Number(bonusQty) / 1e18} tokens`,
            proofLength: merkleProof.length,
            willClaimBonus: bonusQty > 0n,
            source: 'IPFS'
          });
        } else {
          console.log('[Claim] No bonus allocation available. User can still claim base allocation.');
          bonusQty = 0n;
          merkleProof = [];
        }
      } else if (bonusClaimed) {
        console.log('[Claim] Bonus already claimed:', {
          bonusClaimed,
          currentBonusQty: userData?.allocation?.bonusQty?.toString() || '0'
        });
      }
    } catch (bonusError) {
      console.error('[Claim] Error loading bonus allocation:', {
        error: bonusError,
        message: bonusError?.message,
        stack: bonusError?.stack
      });
    }

    try {
      const allocation = userData.allocation;
      if (!allocation || !allocation.computed) {
      } else {
        const totalTokens = (allocation.totalQty || 0n) + (allocation.bonusQty || 0n);
        const refundAmount = allocation.paymentDue && userData.revealedDeposit
          ? (userData.revealedDeposit > allocation.paymentDue ? userData.revealedDeposit - allocation.paymentDue : 0n)
          : 0n;
        const vestingStart = Number(auctionData.vestingStart || 0);
        const vestingDuration = Number(auctionData.vestingDuration || 0);
        const now = currentTime || Math.floor(Date.now() / 1000);
        
        let unlockedBps = 0n;
        if (vestingDuration === 0) {
          unlockedBps = 10000n;
        } else if (now >= vestingStart + vestingDuration) {
          unlockedBps = 10000n;
        }
        
        const unlocked = (totalTokens * unlockedBps) / 10000n;
        const tokensClaimed = BigInt(userData.tokensClaimed || 0);
        const claimableTokens = unlocked > tokensClaimed ? unlocked - tokensClaimed : 0n;
        
        const refundAlreadyClaimed = userData.refundedAmount && refundAmount > 0n
          ? BigInt(userData.refundedAmount) >= refundAmount
          : false;
        const hasUnclaimedTokens = totalTokens > 0n && tokensClaimed < totalTokens;
        if (claimableTokens === 0n && (refundAmount === 0n || refundAlreadyClaimed) && !hasUnclaimedTokens) {
          console.warn("Pre-flight check: No tokens unlocked and no refund available, but allowing claim attempt anyway");
        }
      }
    } catch (preflightError) {
      console.warn("Pre-flight check warning:", preflightError);
    }

    try {
      await tx.execute(
        async () => {
          const signer = await ensureSigner();
          const auctionWithSigner = auctionContract.connect(signer);
          const bonusMerkleRootSet = auctionData?.bonusMerkleRoot && 
            auctionData.bonusMerkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
            auctionData.bonusMerkleRoot !== ethers.ZeroHash;

          let currentAllocationBonusQty = 0n;
          try {
            const currentAllocation = await auctionContract.accountAllocations(account);
            currentAllocationBonusQty = BigInt(currentAllocation.bonusQty?.toString() || '0');
            console.log('[Claim] Current allocation on-chain:', {
              totalQty: currentAllocation.totalQty?.toString() || '0',
              bonusQty: currentAllocationBonusQty.toString(),
              paymentDue: currentAllocation.paymentDue?.toString() || '0',
              computed: currentAllocation.computed
            });
          } catch (allocError) {
            console.warn('[Claim] Could not read current allocation:', allocError);
          }

          console.log('[Claim] Calling claim function:', {
            bonusQty: bonusQty.toString(),
            bonusQtyFormatted: `${Number(bonusQty) / 1e18} tokens`,
            merkleProofLength: merkleProof.length,
            bonusClaimed,
            currentAllocationBonusQty: currentAllocationBonusQty.toString(),
            bonusMerkleRootSet,
            willClaimBonus: bonusQty > 0n && merkleProof.length >= 0 && !bonusClaimed && bonusMerkleRootSet,
            bonusAlreadyIncluded: currentAllocationBonusQty > 0n && currentAllocationBonusQty === bonusQty
          });
          if (bonusQty > 0n && !bonusClaimed && bonusMerkleRootSet && currentAllocationBonusQty === 0n) {
            console.log('[Claim] Calling claim WITH bonus:', {
              bonusQty: bonusQty.toString(),
              bonusQtyFormatted: `${Number(bonusQty) / 1e18} tokens`,
              proofLength: merkleProof.length,
              reason: 'Bonus not yet included in allocation'
            });
            return await auctionWithSigner.claim(bonusQty, merkleProof);
          } else if (bonusClaimed && currentAllocationBonusQty === 0n) {
            console.error('[Claim] ERROR: Bonus marked as claimed but not included in allocation!', {
              bonusClaimed,
              currentAllocationBonusQty: currentAllocationBonusQty.toString(),
              expectedBonusQty: bonusQty.toString()
            });
            throw new Error('Bonus was marked as claimed but not included in allocation. This may require manual intervention.');
          } else if (currentAllocationBonusQty > 0n && currentAllocationBonusQty === bonusQty) {
            console.log('[Claim] Bonus already included in allocation, claiming base tokens only');
            return await auctionWithSigner.claim(0, []);
          } else {
            console.log('[Claim] Calling claim WITHOUT bonus', {
              reason: bonusClaimed ? 'Bonus already claimed' : 
                      !bonusMerkleRootSet ? 'Merkle root not set' :
                      bonusQty === 0n ? 'No bonus allocation found' :
                      'Unknown reason'
            });
            return await auctionWithSigner.claim(0, []);
          }
        },
        {
          pendingMessage: "Claiming tokens and refunds…",
          successMessage: "Claim successful!",
          errorMessage: "Claim failed",
          onSuccess: async () => {
            await handleRefresh();
          },
        }
      );
    } catch (err) {
      let errorMessage = err?.message || "Claim failed";
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      const vestingStart = Number(auctionData.vestingStart || 0);
      const vestingDuration = Number(auctionData.vestingDuration || 0);
      const vestingEnd = vestingStart + vestingDuration;
      const now = currentTime || Math.floor(Date.now() / 1000);
      const vestingEndDate = vestingEnd > 0 ? new Date(vestingEnd * 1000).toLocaleString() : "N/A";
      const timeRemaining = vestingEnd > now ? vestingEnd - now : 0;
      let blockchainTime = null;
      try {
        const { ensureProvider } = await import("../services/web3/provider");
        const provider = ensureProvider();
        if (provider) {
          const block = await provider.getBlock("latest");
          if (block?.timestamp) {
            blockchainTime = Number(block.timestamp);
          }
        }
      } catch (blockchainTimeError) {
      }
      
      if (errorMessage.includes("NothingToClaim") || errorMessage.includes("nothing to claim")) {
        if (vestingEnd > 0 && now < vestingEnd) {
          const hoursRemaining = Math.floor(timeRemaining / 3600);
          const daysRemaining = Math.floor(hoursRemaining / 24);
          const blockchainTimeInfo = blockchainTime ? ` (Blockchain time: ${new Date(blockchainTime * 1000).toLocaleString()})` : "";
          errorMessage = `Nothing to claim at this time. ` +
            `Tokens are locked until vesting completes (cliff vesting - all tokens unlock at once when vesting ends). ` +
            `Vesting ends: ${vestingEndDate} ` +
            `(${daysRemaining > 0 ? `${daysRemaining} day${daysRemaining > 1 ? 's' : ''} ` : ''}${hoursRemaining % 24} hour${(hoursRemaining % 24) !== 1 ? 's' : ''} remaining).${blockchainTimeInfo} ` +
            `If you have a refund, it may have already been claimed.`;
        } else {
          const blockchainTimeInfo = blockchainTime 
            ? ` Blockchain time: ${new Date(blockchainTime * 1000).toLocaleString()}. ` +
              (blockchainTime >= vestingEnd 
                ? "Vesting has ended on blockchain - if claim still fails, there may be no tokens or refunds to claim."
                : `Vesting ends in ${Math.floor((vestingEnd - blockchainTime) / 3600)} hours.`)
            : "";
          errorMessage = "Nothing to claim at this time. " +
            "Tokens are locked until vesting completes (cliff vesting - all tokens unlock at once when vesting ends). " +
            `Vesting ends: ${vestingEndDate}.${blockchainTimeInfo} ` +
            "If you have a refund, it may have already been claimed. " +
            "If vesting has ended, the blockchain time may differ from your local time - try again in a few minutes.";
        }
      } else if (errorMessage.includes("AuctionNotFinalized") || errorMessage.includes("not finalized")) {
        errorMessage = "Auction is not finalized yet.";
      } else if (errorMessage.includes("missing revert data") || err?.code === "CALL_EXCEPTION") {
        if (vestingEnd > 0 && now < vestingEnd) {
          const hoursRemaining = Math.floor(timeRemaining / 3600);
          const daysRemaining = Math.floor(hoursRemaining / 24);
          const blockchainTimeInfo = blockchainTime ? ` (Blockchain time: ${new Date(blockchainTime * 1000).toLocaleString()})` : "";
          errorMessage = "Claim transaction failed. " +
            `Tokens are still locked. Vesting ends: ${vestingEndDate} ` +
            `(${daysRemaining > 0 ? `${daysRemaining} day${daysRemaining > 1 ? 's' : ''} ` : ''}${hoursRemaining % 24} hour${(hoursRemaining % 24) !== 1 ? 's' : ''} remaining).${blockchainTimeInfo} ` +
            "Cliff vesting - tokens unlock all at once when vesting completes.";
        } else {
          const blockchainTimeInfo = blockchainTime 
            ? ` Blockchain time: ${new Date(blockchainTime * 1000).toLocaleString()}. ` +
              (blockchainTime >= vestingEnd 
                ? "Vesting has ended on blockchain - if claim still fails, there may be no tokens or refunds to claim."
                : `Vesting ends in ${Math.floor((vestingEnd - blockchainTime) / 3600)} hours.`)
            : "";
          errorMessage = "Claim transaction failed. " +
            `This usually means: 1) No tokens are unlocked yet (vesting ends: ${vestingEndDate}), ` +
            `2) Refunds have already been claimed, or 3) No allocation available.${blockchainTimeInfo} ` +
            "If vesting has ended, the blockchain time may differ from your local time - try again in a few minutes.";
        }
      }
      
      console.error("Claim error details:", {
        error: err,
        auctionData: {
          finalized: auctionData.finalized,
          successful: auctionData.successful,
          vestingStart: auctionData.vestingStart,
          vestingDuration: auctionData.vestingDuration,
          vestingEnd,
          currentTime: now,
          blockchainTime,
          timeRemaining,
          vestingEndDate,
        },
        userData: {
          allocation: userData.allocation,
          tokensClaimed: userData.tokensClaimed,
          refundedAmount: userData.refundedAmount,
        }
      });
      const { toast } = await import("react-toastify");
      toast.error(errorMessage, {
        position: "bottom-right",
        autoClose: 10000, // Show for 10 seconds to allow reading
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  }, [auctionContract, auctionData, userData, currentTime, tx, handleRefresh]);

  const handleRefundUnsuccessful = useCallback(async () => {
    if (!auctionContract) return;

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const auctionWithSigner = auctionContract.connect(signer);
        return await auctionWithSigner.refundUnsuccessful();
      },
      {
        pendingMessage: "Processing refund…",
        successMessage: "Refund successful!",
        errorMessage: "Refund failed",
        onSuccess: async () => {
          await handleRefresh();
        },
      }
    );
  }, [auctionContract, tx, handleRefresh]);

  const handleWithdrawUnrevealed = useCallback(async (commitIndex) => {
    if (!auctionContract) return;

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const auctionWithSigner = auctionContract.connect(signer);
        return await auctionWithSigner.withdrawUnrevealed(commitIndex);
      },
      {
        pendingMessage: "Withdrawing unrevealed commit…",
        successMessage: "Withdrawal successful!",
        errorMessage: "Withdrawal failed",
        onSuccess: async () => {
          await handleRefresh();
        },
      }
    );
  }, [auctionContract, tx, handleRefresh]);

  const auctionDataRef = useRef(auctionData);
  useEffect(() => {
    auctionDataRef.current = auctionData;
  }, [auctionData]);

  useEffect(() => {
    if (!auctionContract || isInitialLoading || error || !auctionDataRef.current) return;

    const interval = setInterval(() => {
      refetchAuctionData().catch(() => {
      });
      if (account) {
        refetchUserData().catch(() => {
        });
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [auctionContract, isInitialLoading, error, account, refetchAuctionData, refetchUserData]);

  if (isInitialLoading) {
    return (
      <section className="mx-auto min-h-screen max-w-[1400px] animate-[fadeInUp_0.6s_ease-out] px-6 pb-16 pt-8">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.12)] bg-gradient-to-br from-[rgba(15,23,42,0.8)] to-[rgba(30,41,59,0.8)] p-12 text-center text-[rgba(255,255,255,0.7)] shadow-[0_10px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">Loading auction data…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto min-h-screen max-w-[1400px] animate-[fadeInUp_0.6s_ease-out] px-6 pb-16 pt-8">
        <div className="rounded-2xl border border-[rgba(239,68,68,0.4)] bg-gradient-to-br from-[rgba(239,68,68,0.1)] to-[rgba(220,38,38,0.1)] p-12 text-center text-[rgb(254,202,202)] shadow-[0_10px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p>{error}</p>
          {contractsError && <p className="mt-4 text-sm">Contract Error: {contractsError}</p>}
          {auctionDataError && <p className="mt-4 text-sm">Data Error: {auctionDataError}</p>}
          {!auctionContract && <p className="mt-4 text-sm">Auction contract not loaded</p>}
        </div>
      </section>
    );
  }

  if (!auctionData) {
    return (
      <section className="mx-auto min-h-screen max-w-[1400px] animate-[fadeInUp_0.6s_ease-out] px-6 pb-16 pt-8">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.12)] bg-gradient-to-br from-[rgba(15,23,42,0.8)] to-[rgba(30,41,59,0.8)] p-12 text-center text-[rgba(255,255,255,0.7)] shadow-[0_10px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p>No auction data available</p>
          {auctionContract && <p className="mt-4 text-sm">Contract loaded but data not fetched. The auction may not be initialized yet.</p>}
          {!auctionContract && <p className="mt-4 text-sm">Waiting for contract to load...</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-8 px-6 pb-16 pt-8 animate-[fadeInUp_0.6s_ease-out]">
      <AuctionHeader
        address={address}
        auctionAddress={auctionAddress}
        auctionData={auctionData}
        phase={phase}
        countdown={countdown}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <AuctionStatusGrid auctionData={auctionData} />

      <AuctionTimeline auctionData={auctionData} phase={phase} />

      <ReservePanel auctionData={auctionData} onDemandCheck={handleDemandCheck} isOwner={isOwner} />

      {/* Commit & Reveal Forms */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {phase === PHASES.COMMIT && (
          <CommitForm
            form={commitForm}
            setForm={setCommitForm}
            auctionData={auctionData}
            userData={userData}
            onSubmit={handleCommit}
            txState={tx.state}
          />
        )}

        {phase === PHASES.REVEAL && (
          <RevealForm
            form={revealForm}
            setForm={setRevealForm}
            auctionData={auctionData}
            userData={userData}
            onSubmit={handleReveal}
            txState={tx.state}
          />
        )}
      </div>

      {auctionData?.priceTicks && auctionData.priceTicks.length > 0 && (
        <PriceDecayChart
          priceTicks={auctionData.priceTicks}
          startTime={auctionData.startTime}
          commitEndTime={auctionData.commitEndTime}
          revealEndTime={auctionData.revealEndTime}
          currentTime={currentTime}
          finalized={auctionData.finalized}
          clearingPrice={auctionData.clearingPrice}
          clearingTickIndex={auctionData.clearingTickIndex}
          totalDepositCommitted={auctionData.totalDepositCommitted}
          totalDepositsRevealed={auctionData.totalDepositsRevealed}
          softCap={auctionData.softCap}
          phase={phase}
          initialCommitEndTime={auctionData.initialCommitEndTime}
          demandCheckTime={auctionData.demandCheckTime}
          earlyBonusWindow={auctionData.earlyBonusWindow}
          earlyBonusPct={auctionData.earlyBonusPct}
        />
      )}

      {/* Early Bonus Info Panel */}
      {auctionData?.bonusReserve > 0n && auctionData?.earlyBonusPct > 0n && (
        <div className="mb-8 rounded-2xl border border-[rgba(251,191,36,0.3)] bg-gradient-to-br from-[rgba(251,191,36,0.1)] to-[rgba(217,119,6,0.05)] p-6 shadow-lg">
          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-[rgb(251,191,36)]">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            Early Incentives
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="mb-1 text-sm text-[rgba(255,255,255,0.7)]">Bonus Percentage</p>
              <p className="text-2xl font-bold text-[rgb(251,191,36)]">
                {(Number(auctionData.earlyBonusPct) / 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="mb-1 text-sm text-[rgba(255,255,255,0.7)]">Bonus Pool</p>
              <p className="text-2xl font-bold text-white">
                {formatTokenUnits(auctionData.bonusReserve)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-sm text-[rgba(255,255,255,0.7)]">Early Window</p>
              <p className="text-2xl font-bold text-white">
                {auctionData.earlyBonusWindow ? Math.floor(Number(auctionData.earlyBonusWindow) / 60) : 0} min
              </p>
            </div>
          </div>
          {auctionData.startTime && auctionData.earlyBonusWindow && (
            <div className="mt-4 rounded-xl border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.05)] p-4">
              <p className="text-sm text-[rgba(255,255,255,0.8)]">
                <strong>Early Bonus Window:</strong> Participants who commit within the first{" "}
                {Math.floor(Number(auctionData.earlyBonusWindow) / 60)} minutes after auction start
                {auctionData.startTime && (
                  <> (until {new Date((Number(auctionData.startTime) + Number(auctionData.earlyBonusWindow)) * 1000).toLocaleString()})</>
                )}
                {" "}are eligible for bonus tokens. Bonuses are distributed proportionally after finalization.
              </p>
            </div>
          )}
        </div>
      )}

      <PriceBucketPanel auctionData={auctionData} priceBuckets={auctionData.priceBuckets || []} />

      {!auctionData.finalized && <AllocationPanel userData={userData} />}

      {auctionData.finalized && <FinalAllocationPanel auctionData={auctionData} userData={userData} />}

      {auctionData.finalized && auctionData.successful && (
        <ClaimPanel
          auctionContract={auctionContract}
          auctionAddress={auctionAddress}
          auctionData={auctionData}
          userData={userData}
          onClaim={handleClaim}
          txState={tx.state}
        />
      )}

      {auctionData.finalized && !auctionData.successful && (
        <FailedAuctionRefundPanel
          auctionContract={auctionContract}
          auctionData={auctionData}
          userData={userData}
          onRefund={handleRefundUnsuccessful}
          txState={tx.state}
        />
      )}

      {auctionData.finalized && (
        <UnrevealedCommitsPanel
          auctionContract={auctionContract}
          auctionData={auctionData}
          userCommits={userData?.commits || []}
          onWithdraw={handleWithdrawUnrevealed}
          txState={tx.state}
        />
      )}

      {phase === PHASES.FINALIZED && !auctionData.finalized && (
        <div className="rounded-2xl border border-[rgba(245,158,11,0.4)] bg-gradient-to-br from-[rgba(245,158,11,0.1)] to-[rgba(217,119,6,0.1)] p-6 shadow-[0_10px_30px_rgba(245,158,11,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="mb-4 text-base font-bold text-[rgb(251,191,36)]">Auction Ready for Finalization</p>
          <p className="mb-4 text-sm text-[rgba(255,255,255,0.7)]">
            The reveal phase has ended. {isOwner ? (
              <>
                You can finalize the auction on the <Link to={`/manager/${address}`} className="text-[rgb(110,231,183)] underline">Presale Manager page</Link>.
              </>
            ) : (
              "Waiting for the owner to finalize the auction on the Presale Manager page."
            )}
          </p>
          {isOwner && (
            <Link
              to={`/manager/${address}`}
              className="inline-block rounded-2xl border-0 bg-gradient-to-r from-[rgb(245,158,11)] to-[rgb(217,119,6)] px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-[rgb(15,23,42)] no-underline transition-all duration-300 hover:-translate-y-0.5 hover:bg-gradient-to-r hover:from-[rgb(217,119,6)] hover:to-[rgb(245,158,11)] hover:shadow-[0_8px_20px_rgba(245,158,11,0.3)]"
            >
              Go to Presale Manager →
            </Link>
          )}
        </div>
      )}
      <FinalizedPanel
        auctionData={auctionData}
        isOwner={isOwner}
        onLaunchLBP={null}
        managerAddress={address}
        auctionAddress={auctionAddress}
      />

      <EventsPanel events={events} />

      <DeveloperTimeControls 
        onTimeAdvanced={async () => {
          console.log("Time advanced, refreshing...");

          await new Promise(resolve => setTimeout(resolve, 1000));
          await refreshTime();
          await new Promise(resolve => setTimeout(resolve, 500));

          await handleRefresh();
          console.log("All data refreshed, currentTime:", currentTime);
        }} 
      />

    </section>
  );
};

export default AuctionView;
