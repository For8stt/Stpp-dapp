/* eslint-env es2020 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import EventsPanel from "../components/auction/EventsPanel";
import DeveloperTimeControls from "../components/common/DeveloperTimeControls";


import { useAuctionContracts } from "../hooks/useAuctionContracts";
import { useAuctionData } from "../hooks/useAuctionData";
import { useUserAuctionData } from "../hooks/useUserAuctionData";
import { useAuctionEvents } from "../hooks/useAuctionEvents";
import { useAccount } from "../hooks/useAccount";
import { useTransaction } from "../hooks/useTransaction";
import { useChainId } from "wagmi";
import { useTime } from "../time";


import { getPhase, getTimeUntil } from "../utils/auctionUtils";
import { ensureSigner } from "../services/web3/signer";
import { ensureProvider } from "../services/web3/provider";
import { generateCommitHash, parseMerkleProof, calculateDeposit } from "../utils/commitUtils";
import { REFRESH_INTERVAL_MS, PHASES, DEFAULT_LBP_CONFIG } from "../constants/auction";
import styles from "./css/AuctionView.module.css";


const AuctionView = () => {
  const { address } = useParams();
  const chainId = useChainId();

  const { account } = useAccount();
  const {
    managerContract,
    auctionContract,
    auctionAddress,
    loading: contractsLoading,
    error: contractsError,
  } = useAuctionContracts(address);

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

  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Unified time layer
  const { currentTime, refreshTime, setProvider: setTimeProvider } = useTime();

  // Set provider for time service when auction contract is available
  useEffect(() => {
    const bindProvider = async () => {
      const contractProvider = auctionContract?.provider || auctionContract?.runner?.provider;
      let providerToUse = contractProvider;
      
      if (!providerToUse) {
        try {
          providerToUse = ensureProvider();
        } catch (err) {
          // Provider not available
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

    bindProvider();
  }, [auctionContract, refreshTime, setTimeProvider]);

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
    if (phase === PHASES.NOT_STARTED) return getTimeUntil(auctionData.startTime, currentTime);
    if (phase === PHASES.COMMIT) return getTimeUntil(auctionData.commitEndTime, currentTime);
    if (phase === PHASES.REVEAL) return getTimeUntil(auctionData.revealEndTime, currentTime);
    return null;
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

  const loading = contractsLoading || auctionDataLoading;
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

  useEffect(() => {
    if (auctionData) {
      const timeStr = new Date(currentTime * 1000).toLocaleTimeString();
      console.log("currentTime:", currentTime, timeStr, "countdown:", countdown);
    }
  }, [currentTime, countdown, auctionData]);

  useEffect(() => {
    if (!auctionContract || loading || error || !auctionData) return;

    const interval = setInterval(() => {
      refetchAuctionData().catch(() => {
      });
      if (account) {
        refetchUserData().catch(() => {
        });
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [auctionContract, loading, error, auctionData, account, refetchAuctionData, refetchUserData]);

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

      {phase === PHASES.FINALIZED && !auctionData.finalized && (
        <div className={styles.finalizationPanel}>
          <p className={styles.finalizationTitle}>Auction Ready for Finalization</p>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '1rem' }}>
            The reveal phase has ended. {isOwner ? (
              <>
                You can finalize the auction on the <Link to={`/manager/${address}`} style={{ color: 'rgb(110, 231, 183)', textDecoration: 'underline' }}>Presale Manager page</Link>.
              </>
            ) : (
              "Waiting for the owner to finalize the auction on the Presale Manager page."
            )}
          </p>
          {isOwner && (
            <Link
              to={`/manager/${address}`}
              className={`${styles.actionButton} ${styles.amber}`}
              style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
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
