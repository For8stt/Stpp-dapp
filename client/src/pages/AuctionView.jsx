/* eslint-env es2020 */
/**
 * AuctionView - Production-ready refactored component
 * 
 * Improvements:
 * - Extracted custom hooks for contract management, data fetching, and transactions
 * - Separated concerns: contracts, data, UI state
 * - Optimized re-renders with proper memoization
 * - Consistent error handling
 * - Clean, maintainable structure
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";

// Components
import PriceDecayChart from "../components/presale/PriceDecayChart";
import AuctionHeader from "../components/presale/AuctionHeader";
import AuctionStatusGrid from "../components/presale/AuctionStatusGrid";
import AuctionTimeline from "../components/presale/AuctionTimeline";
import ReservePanel from "../components/presale/ReservePanel";
import CommitForm from "../components/presale/CommitForm";
import RevealForm from "../components/presale/RevealForm";
import PriceBucketPanel from "../components/presale/PriceBucketPanel";
import AllocationPanel from "../components/presale/AllocationPanel";
import FinalizedPanel from "../components/presale/FinalizedPanel";
import EventsPanel from "../components/presale/EventsPanel";

// Hooks
import { useAuctionContracts } from "../hooks/useAuctionContracts";
import { useAuctionData } from "../hooks/useAuctionData";
import { useUserAuctionData } from "../hooks/useUserAuctionData";
import { useAuctionEvents } from "../hooks/useAuctionEvents";
import { useAccount } from "../hooks/useAccount";
import { useTransaction } from "../hooks/useTransaction";

// Utils & Constants
import { getPhase, getTimeUntil } from "../utils/auctionUtils";
import { ensureSigner } from "../services/web3/signer";
import { generateCommitHash, parseMerkleProof, calculateDeposit } from "../utils/commitUtils";
import { REFRESH_INTERVAL_MS, TIME_UPDATE_INTERVAL_MS, PHASES, DEFAULT_LBP_CONFIG } from "../constants/auction";
import styles from "./css/AuctionView.module.css";

// ============ COMPONENT ============

const AuctionView = () => {
  const { address } = useParams();

  // ============ ACCOUNT & CONTRACTS ============
  const { account } = useAccount();
  const {
    managerContract,
    auctionContract,
    auctionAddress,
    loading: contractsLoading,
    error: contractsError,
  } = useAuctionContracts(address);

  // ============ DATA FETCHING ============
  const {
    data: auctionData,
    loading: auctionDataLoading,
    error: auctionDataError,
    refetch: refetchAuctionData,
  } = useAuctionData(auctionContract);

  const {
    data: userData,
    refetch: refetchUserData,
  } = useUserAuctionData(auctionContract, account, auctionData?.finalized);

  const {
    events,
    refetch: refetchEvents,
  } = useAuctionEvents(auctionContract);

  // ============ UI STATE ============
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [refreshing, setRefreshing] = useState(false);

  // Form state
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

  // Transaction management
  const tx = useTransaction();

  // ============ COMPUTED VALUES ============
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
    if (phase === PHASES.NOT_STARTED) return getTimeUntil(auctionData.startTime);
    if (phase === PHASES.COMMIT) return getTimeUntil(auctionData.commitEndTime);
    if (phase === PHASES.REVEAL) return getTimeUntil(auctionData.revealEndTime);
    return null;
  }, [phase, auctionData]);

  const isOwner = useMemo(() => {
    // TODO: Fetch from contract if needed
    return false;
  }, []);

  const loading = contractsLoading || auctionDataLoading;
  const error = contractsError || auctionDataError;

  // ============ REFRESH HANDLER ============
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchAuctionData(),
        account && refetchUserData(),
        refetchEvents(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAuctionData, refetchUserData, refetchEvents, account]);

  // ============ TRANSACTION HANDLERS ============
  const handleCommit = useCallback(async () => {
    if (!auctionContract || !auctionData) return;

    const qty = BigInt(commitForm.quantity || "0");
    if (qty <= 0n) {
      throw new Error("Quantity must be greater than zero");
    }

    if (!auctionData.priceTicks || auctionData.priceTicks.length === 0) {
      throw new Error("Price ticks not loaded");
    }

    const referencePrice = auctionData.priceTicks[0];
    const depositValue = calculateDeposit(commitForm.quantity, referencePrice);

    if (depositValue === 0n) {
      throw new Error("Unable to compute deposit. Check price ticks and quantity.");
    }

    const priceTickIndex = BigInt(commitForm.priceTickIndex || "0");
    const nonce = commitForm.nonce
      ? (commitForm.nonce.startsWith("0x") && commitForm.nonce.length === 66
          ? commitForm.nonce
          : ethers.id(commitForm.nonce))
      : ethers.ZeroHash;

    const commitHash = generateCommitHash(priceTickIndex, qty, nonce);
    if (!commitHash) {
      throw new Error("Failed to generate commit hash");
    }

    const merkleProof = parseMerkleProof(commitForm.merkleProof);

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const auctionWithSigner = auctionContract.connect(signer);
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
    if (!auctionContract) return;

    const qty = BigInt(revealForm.quantity || "0");
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

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const auctionWithSigner = auctionContract.connect(signer);
        return await auctionWithSigner.reveal(priceTickIndex, qty, nonce, commitIndex);
      },
      {
        pendingMessage: "Submitting reveal…",
        successMessage: "Reveal confirmed successfully!",
        errorMessage: "Reveal failed",
        onSuccess: async () => {
          await handleRefresh();
        },
      }
    );
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

    const lbpConfig = {
      startTime: Math.floor(Date.now() / 1000) + 3600,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      poolStartWeightToken: ethers.parseEther(DEFAULT_LBP_CONFIG.poolStartWeightToken),
      poolEndWeightToken: ethers.parseEther(DEFAULT_LBP_CONFIG.poolEndWeightToken),
      poolSwapFee: ethers.parseEther(DEFAULT_LBP_CONFIG.poolSwapFee),
      vestingStartTime: Math.floor(Date.now() / 1000) + 3600,
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
  }, [managerContract, auctionAddress, tx, refetchAuctionData, refetchEvents]);

  const handleDemandCheck = useCallback(async () => {
    if (!managerContract || !auctionAddress) return;

    await tx.execute(
      async () => {
        const signer = await ensureSigner();
        const managerWithSigner = managerContract.connect(signer);
        return await managerWithSigner.handleDemandCheck(auctionAddress);
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
  }, [managerContract, auctionAddress, tx, refetchAuctionData, refetchEvents]);

  // ============ EFFECTS ============
  // Update current time for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, TIME_UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Auto-refresh data periodically
  useEffect(() => {
    if (!auctionContract || loading || error || !auctionData) return;

    const interval = setInterval(() => {
      refetchAuctionData().catch(() => {
        // Silently handle refresh errors
      });
      if (account) {
        refetchUserData().catch(() => {
          // Silently handle refresh errors
        });
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [auctionContract, loading, error, auctionData, account, refetchAuctionData, refetchUserData]);

  // ============ RENDER ============
  // Debug logging
  useEffect(() => {
    console.log("AuctionView state:", {
      address,
      contractsLoading,
      auctionDataLoading,
      contractsError,
      auctionDataError,
      auctionContract: !!auctionContract,
      auctionAddress,
      auctionData: !!auctionData,
    });
  }, [address, contractsLoading, auctionDataLoading, contractsError, auctionDataError, auctionContract, auctionAddress, auctionData]);

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.loadingContainer}>Loading auction data…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.page}>
        <div className={styles.errorContainer}>
          <p>{error}</p>
          {contractsError && <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>Contract Error: {contractsError}</p>}
          {auctionDataError && <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>Data Error: {auctionDataError}</p>}
          {!auctionContract && <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>Auction contract not loaded</p>}
        </div>
      </section>
    );
  }

  if (!auctionData) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyContainer}>
          <p>No auction data available</p>
          {auctionContract && <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>Contract loaded but data not fetched. The auction may not be initialized yet.</p>}
          {!auctionContract && <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>Waiting for contract to load...</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
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

      <ReservePanel auctionData={auctionData} onDemandCheck={handleDemandCheck} />

      {/* Commit & Reveal Forms */}
      <div className={styles.formsGrid}>
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

      {/* Price Decay Chart */}
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
          softCap={auctionData.softCap}
          phase={phase}
        />
      )}

      <PriceBucketPanel auctionData={auctionData} priceBuckets={auctionData.priceBuckets || []} />

      {!auctionData.finalized && <AllocationPanel userData={userData} />}

      {/* Finalization Panel (Owner Only) */}
      {phase === PHASES.FINALIZED && !auctionData.finalized && isOwner && (
        <div className={styles.finalizationPanel}>
          <p className={styles.finalizationTitle}>Auction Finalization (Owner Only)</p>
          <button onClick={handleFinalize} className={`${styles.actionButton} ${styles.amber}`}>
            Finalize Auction
          </button>
        </div>
      )}

      <FinalizedPanel
        auctionData={auctionData}
        isOwner={isOwner}
        onLaunchLBP={handleLaunchLBP}
      />

      <EventsPanel events={events} />

    </section>
  );
};

export default AuctionView;
