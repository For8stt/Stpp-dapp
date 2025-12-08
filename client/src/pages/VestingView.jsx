/**
 * VestingView - Complete Vesting Page
 * 
 * Production-ready vesting interface for STTP protocol.
 * Displays vesting information and allows users to claim vested tokens.
 * 
 * Route: /vesting/:escrowAddress
 * 
 * Features:
 * - Real-time vesting data monitoring
 * - Vesting progress visualization
 * - Countdown timers for cliff and final unlock
 * - Vesting curve graph
 * - Claim functionality
 * - Automatic polling every 2 seconds or on each new block
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { BrowserProvider, Contract } from "ethers";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { useAccount } from "../hooks/useAccount";
import { useTransaction } from "../hooks/useTransaction";
import { useChainId } from "wagmi";
import { handleTxError, showTxSuccess } from "../utils/txErrorHandler";
import { ensureSigner } from "../services/web3/signer";
import { ensureProvider } from "../services/web3/provider";
import { useVestingData } from "../hooks/useVestingData";
import allAbis from "../abi/allAbis.json";
import styles from "./css/VestingView.module.css";
import DeveloperTimeControls from "../components/presale/DeveloperTimeControls";

const VestingView = () => {
  const { escrowAddress } = useParams();
  const [searchParams] = useSearchParams();
  const expectedLBPAddress = searchParams.get("lbp"); // Optional LBP address from query param
  const lbpAddressParam = searchParams.get("lbpAddress"); // Alternative: direct LBP address
  const { account } = useAccount();
  const chainId = useChainId();
  const tx = useTransaction();
  
  // Use lbpAddressParam if provided, otherwise use expectedLBPAddress
  const lbpAddressToCheck = lbpAddressParam || expectedLBPAddress;

  // Real-time vesting data hook
  // If we have an expected LBP address, use it to override the one from escrow
  const {
    data: vestingData,
    loading,
    error,
    refetch: refetchVestingData,
  } = useVestingData(escrowAddress, account, lbpAddressToCheck || undefined);

  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [vestingCurveData, setVestingCurveData] = useState([]);
  const [correctEscrowAddress, setCorrectEscrowAddress] = useState(null);
  const [checkingEscrow, setCheckingEscrow] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [lbpFinalized, setLbpFinalized] = useState(false);

  /**
   * Format token amount with decimals
   */
  const formatToken = useCallback((amount, decimals = 18) => {
    if (!amount || amount === 0n) return "0";
    try {
      return ethers.formatUnits(amount, decimals);
    } catch {
      return "0";
    }
  }, []);

  /**
   * Format time remaining
   */
  const formatTimeRemaining = useCallback((seconds) => {
    if (seconds <= 0) return "Unlocked";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }, []);

  /**
   * Check if we need to get correct escrow from expected LBP
   * Only check once when component mounts or when lbpAddressToCheck changes
   */
  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const fetchCorrectEscrow = async () => {
      if (!lbpAddressToCheck || checkingEscrow) {
        return;
      }
      
      try {
        setCheckingEscrow(true);
        
        const provider = await ensureProvider();
        if (!provider) {
          return;
        }

        const secureLBPAbi = allAbis.SecureLBP || [];
        if (secureLBPAbi.length === 0) {
          return;
        }
        
        const secureLBPContract = new Contract(lbpAddressToCheck, secureLBPAbi, provider);
        
        const [finalized, vestingEscrow] = await Promise.all([
          secureLBPContract.finalized().catch(() => false),
          secureLBPContract.vestingEscrow().catch(() => ethers.ZeroAddress),
        ]);

        if (!isMounted) return;

        setLbpFinalized(finalized);

        // Always set correct escrow address if found, even if not finalized
        if (vestingEscrow !== ethers.ZeroAddress) {
          setCorrectEscrowAddress(vestingEscrow);
          
          if (finalized) {
            const escrowMatch = vestingEscrow.toLowerCase() === escrowAddress.toLowerCase();
            
            if (!escrowMatch) {
              // Escrow addresses don't match - redirect to correct one
              setShouldRedirect(true);
              // Auto-redirect after a short delay
              timeoutId = setTimeout(() => {
                if (isMounted) {
                  window.location.href = `/vesting/${vestingEscrow}?lbp=${lbpAddressToCheck}`;
                }
              }, 1500);
            }
          }
        } else {
          setCorrectEscrowAddress(null);
        }
      } catch (err) {
        console.error("[Vesting] Error checking correct escrow:", err);
      } finally {
        if (isMounted) {
          setCheckingEscrow(false);
        }
      }
    };

    // Only check if we have an LBP address to check
    if (lbpAddressToCheck) {
      fetchCorrectEscrow();
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [lbpAddressToCheck, escrowAddress]); // Removed checkingEscrow from dependencies to prevent loops

  /**
   * Calculate vesting curve data for graph
   */
  useEffect(() => {
    if (!vestingData || !vestingData.vestingConfigured) {
      setVestingCurveData([]);
      return;
    }

    const {
      vestingStart,
      vestingCliffDuration,
      vestingFinalDuration,
      vestingCliffPercentBP,
      userAllocation,
    } = vestingData;

    if (!userAllocation || userAllocation === 0n) {
      setVestingCurveData([]);
      return;
    }

    const cliffTime = vestingStart + vestingCliffDuration;
    const finalTime = vestingStart + vestingFinalDuration;
    const now = currentTime;

    // Generate data points for the vesting curve
    const dataPoints = [];
    const startTime = Math.min(vestingStart, now);
    const endTime = Math.max(finalTime, now);
    const duration = endTime - startTime;
    const numPoints = 100;

    for (let i = 0; i <= numPoints; i++) {
      const timestamp = startTime + (duration * i) / numPoints;
      let vestedAmount = 0n;

      if (timestamp < cliffTime) {
        vestedAmount = 0n;
      } else if (timestamp >= finalTime || vestingFinalDuration === 0) {
        vestedAmount = userAllocation;
      } else {
        // During linear vesting period
        // Note: Current contract implementation only unlocks cliff percent at cliff
        // Full unlock happens at final time
        // This matches VestingMath.lbpVestedAmount behavior
        const cliffAmount = (userAllocation * BigInt(vestingCliffPercentBP)) / 10000n;
        const remainingAmount = userAllocation - cliffAmount;
        const vestingPeriod = finalTime - cliffTime;
        const elapsed = timestamp - cliffTime;
        
        if (vestingPeriod > 0) {
          // Round to integers before converting to BigInt to avoid floating point errors
          const elapsedInt = Math.floor(elapsed);
          const vestingPeriodInt = Math.floor(vestingPeriod);
          if (vestingPeriodInt > 0) {
            const linearAmount = (remainingAmount * BigInt(elapsedInt)) / BigInt(vestingPeriodInt);
            vestedAmount = cliffAmount + linearAmount;
          } else {
            vestedAmount = cliffAmount;
          }
        } else {
          vestedAmount = cliffAmount;
        }
      }

      dataPoints.push({
        timestamp,
        time: new Date(timestamp * 1000).toISOString(),
        vested: Number(vestedAmount),
        vestedFormatted: formatToken(vestedAmount, vestingData.tokenDecimals),
        percent: userAllocation > 0n
          ? Number((vestedAmount * 10000n) / userAllocation) / 100
          : 0,
      });
    }

    setVestingCurveData(dataPoints);
  }, [vestingData, currentTime, formatToken]);

  /**
   * Update current time
   */
  useEffect(() => {
    const updateTime = async () => {
      try {
        const provider = await ensureProvider();
        if (provider) {
          try {
            const block = await provider.getBlock("latest");
            if (block?.timestamp) {
              setCurrentTime(Number(block.timestamp));
              return;
            }
          } catch (blockErr) {
            console.warn("Could not fetch blockchain time:", blockErr);
          }
        }
      } catch (err) {
        console.warn("Could not get provider for time update:", err);
      }
      
      setCurrentTime(Math.floor(Date.now() / 1000));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [chainId]);

  /**
   * Handle claim transaction
   */
  const handleClaim = useCallback(async () => {
    if (!vestingData || !account) {
      handleTxError(new Error("Please connect your wallet"));
      return;
    }

    // Double-check claimable amount directly from contract before claiming
    try {
      const provider = await ensureProvider();
      if (provider) {
        const escrowAbi = allAbis.TokenVestingEscrow || [];
        const escrowContract = new Contract(escrowAddress, escrowAbi, provider);
        
        // Check both claimable and vestedAmount from SecureLBP
        const [directClaimable, directVested, directClaimed] = await Promise.all([
          escrowContract.claimable(account).catch(() => 0n),
          escrowContract.secureLBP().then(async (lbpAddr) => {
            const secureLBPAbi = allAbis.SecureLBP || [];
            const lbpContract = new Contract(lbpAddr, secureLBPAbi, provider);
            return await lbpContract.vestedAmount(account).catch(() => 0n);
          }).catch(() => 0n),
          escrowContract.claimed(account).catch(() => 0n),
        ]);
        
        console.log("[Vesting] Claim check:", {
          userClaimableFromData: vestingData.userClaimable?.toString(),
          directClaimableFromContract: directClaimable.toString(),
          directVestedFromLBP: directVested.toString(),
          directClaimedFromEscrow: directClaimed.toString(),
          calculatedClaimable: (directVested > directClaimed ? (directVested - directClaimed).toString() : "0"),
          userVested: vestingData.userVested?.toString(),
          userClaimed: vestingData.userClaimed?.toString(),
        });

        // Use calculated claimable if contract returns 0 but we have vested > claimed
        const calculatedClaimable = directVested > directClaimed ? directVested - directClaimed : 0n;
        
        if (directClaimable === 0n && calculatedClaimable === 0n) {
          handleTxError(new Error(`No tokens available to claim. Vested: ${directVested.toString()}, Claimed: ${directClaimed.toString()}`));
          return;
        }
        
        // If contract claimable is 0 but calculated is > 0, still allow claim
        // The contract will recalculate on-chain
        if (directClaimable === 0n && calculatedClaimable > 0n) {
          console.warn("[Vesting] Contract claimable is 0, but calculation shows claimable. Attempting claim anyway...");
        }
      }
    } catch (checkErr) {
      console.warn("[Vesting] Could not check claimable amount:", checkErr);
    }

    // Allow claim if vested > claimed, even if claimable shows 0
    const effectiveClaimable = vestingData.userClaimable || 
                               (vestingData.userVested > vestingData.userClaimed 
                                 ? vestingData.userVested - vestingData.userClaimed 
                                 : 0n);
    
    if (effectiveClaimable === 0n) {
      handleTxError(new Error("No tokens available to claim"));
      return;
    }

    try {
      const signer = await ensureSigner();
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      const escrowContract = new Contract(escrowAddress, escrowAbi, signer);

      await tx.execute(
        async () => {
          return await escrowContract.claim();
        },
        {
          pendingMessage: "Claiming tokens…",
          successMessage: "Tokens claimed successfully!",
          errorMessage: "Claim failed",
          onSuccess: async () => {
            // Refresh vesting data after successful claim
            await refetchVestingData();
          },
        }
      );
    } catch (err) {
      console.error("Error claiming tokens:", err);
      handleTxError(err, "Failed to claim tokens");
    }
  }, [vestingData, account, escrowAddress, tx, refetchVestingData]);

  /**
   * Calculate progress percentage
   */
  const progressPercent = useMemo(() => {
    if (!vestingData || !vestingData.userAllocation || vestingData.userAllocation === 0n) {
      return 0;
    }
    return vestingData.vestingPercent || 0;
  }, [vestingData]);

  /**
   * Calculate cliff progress
   */
  const cliffProgress = useMemo(() => {
    if (!vestingData || !vestingData.vestingConfigured) return 0;
    const { vestingStart, vestingCliffDuration, currentTime } = vestingData;
    const cliffTime = vestingStart + vestingCliffDuration;
    
    if (currentTime >= cliffTime) return 100;
    if (currentTime < vestingStart) return 0;
    
    const elapsed = currentTime - vestingStart;
    return (elapsed / vestingCliffDuration) * 100;
  }, [vestingData]);

  /**
   * Calculate final unlock progress
   */
  const finalProgress = useMemo(() => {
    if (!vestingData || !vestingData.vestingConfigured) return 0;
    const { vestingStart, vestingFinalDuration, currentTime } = vestingData;
    const finalTime = vestingStart + vestingFinalDuration;
    
    if (currentTime >= finalTime) return 100;
    if (currentTime < vestingStart) return 0;
    
    const elapsed = currentTime - vestingStart;
    return (elapsed / vestingFinalDuration) * 100;
  }, [vestingData]);

  // Loading state
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading vesting data…</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>Error Loading Vesting Data</h2>
          <p className={styles.errorMessage}>{error}</p>
          <button
            onClick={refetchVestingData}
            className={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!vestingData) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyContent}>
          <p className={styles.emptyText}>No vesting data available</p>
        </div>
      </div>
    );
  }

  const {
    escrowAddress: dataEscrowAddress,
    secureLBPAddress,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    finalized,
    vestingConfigured,
    vestingStart,
    vestingCliffDuration,
    vestingFinalDuration,
    vestingCliffPercentBP,
    userAllocation,
    userVested,
    userClaimed,
    userClaimable,
    timeUntilCliff,
    timeUntilFinal,
    cliffTime,
    finalTime,
  } = vestingData;

  const hasAllocation = userAllocation && userAllocation > 0n;
  // Allow claiming if there's any vested amount that hasn't been claimed yet
  // Even if claimable shows 0, try to claim if vested > claimed
  const canClaim = (userClaimable && userClaimable > 0n) || 
                  (userVested && userClaimed !== undefined && userVested > userClaimed);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Token Vesting</h1>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link 
              to={`/lbp/${lbpAddressToCheck || secureLBPAddress}`} 
              className={styles.backLink}
            >
              ← Back to LBP
            </Link>
          </div>
        </div>
        <p className={styles.subtitle}>
          View and claim your vested tokens from the LBP sale
        </p>
      </div>

      {/* Warning if wrong escrow or LBP mismatch */}
      {lbpAddressToCheck && 
       lbpAddressToCheck.toLowerCase() !== secureLBPAddress.toLowerCase() && (
        <div style={{
          background: "linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(234, 179, 8, 0.1) 100%)",
          border: "1px solid rgba(234, 179, 8, 0.5)",
          borderRadius: "1rem",
          padding: "1.5rem",
          marginBottom: "2rem",
        }}>
          <h3 style={{ color: "rgb(250, 204, 21)", marginBottom: "1rem", fontSize: "1.125rem", fontWeight: 700 }}>
            ⚠️ Wrong Escrow Address Detected
          </h3>
          <p style={{ color: "rgba(255, 255, 255, 0.9)", marginBottom: "1rem" }}>
            This escrow ({escrowAddress.slice(0, 8)}...{escrowAddress.slice(-6)}) is linked to a different LBP contract ({secureLBPAddress.slice(0, 8)}...{secureLBPAddress.slice(-6)}).
            <br />
            The expected LBP ({lbpAddressToCheck.slice(0, 8)}...{lbpAddressToCheck.slice(-6)}) {lbpFinalized ? "has" : "will have"} a different escrow address.
          </p>
          {correctEscrowAddress ? (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <Link
                to={`/vesting/${correctEscrowAddress}?lbp=${lbpAddressToCheck}`}
                style={{
                  background: "linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.15) 100%)",
                  border: "1px solid rgba(34, 197, 94, 0.5)",
                  color: "rgb(74, 222, 128)",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.75rem",
                  textDecoration: "none",
                  fontWeight: 700,
                  transition: "all 0.3s ease",
                  display: "inline-block",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.2) 100%)";
                  e.target.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.15) 100%)";
                  e.target.style.transform = "translateY(0)";
                }}
              >
                Go to Correct Escrow →
              </Link>
              <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.875rem" }}>
                Correct Escrow: {correctEscrowAddress.slice(0, 8)}...{correctEscrowAddress.slice(-6)}
              </span>
            </div>
          ) : (
            <div style={{ 
              padding: "0.75rem", 
              background: "rgba(59, 130, 246, 0.2)", 
              border: "1px solid rgba(59, 130, 246, 0.5)",
              borderRadius: "0.5rem",
              color: "rgb(96, 165, 250)",
              fontSize: "0.875rem"
            }}>
              {checkingEscrow 
                ? "🔍 Checking escrow address..."
                : lbpFinalized 
                  ? "⚠️ LBP is finalized but escrow address is not set yet. Please check the LBP contract."
                  : "⏳ LBP is not finalized yet. Escrow will be set after finalization."}
            </div>
          )}
        </div>
      )}

      {/* Contract Info Cards */}
      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Escrow Contract</div>
          <div className={styles.infoValue}>{dataEscrowAddress}</div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>LBP Contract</div>
          <div className={styles.infoValue}>{secureLBPAddress}</div>
          {lbpAddressToCheck && 
           lbpAddressToCheck.toLowerCase() !== secureLBPAddress.toLowerCase() && (
            <div style={{ 
              marginTop: "0.5rem", 
              padding: "0.75rem", 
              background: "rgba(234, 179, 8, 0.2)", 
              border: "1px solid rgba(234, 179, 8, 0.5)",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
              color: "rgb(250, 204, 21)"
            }}>
              <div style={{ marginBottom: "0.5rem" }}>
                ⚠️ Expected LBP: {lbpAddressToCheck.slice(0, 8)}...{lbpAddressToCheck.slice(-6)}
              </div>
              {correctEscrowAddress && (
                <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid rgba(234, 179, 8, 0.3)" }}>
                  <div style={{ marginBottom: "0.5rem", fontSize: "0.7rem", opacity: 0.9 }}>
                    Correct Escrow for this LBP:
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.7rem", wordBreak: "break-all", marginBottom: "0.5rem" }}>
                    {correctEscrowAddress}
                  </div>
                  <Link
                    to={`/vesting/${correctEscrowAddress}?lbp=${lbpAddressToCheck}`}
                    style={{
                      display: "inline-block",
                      padding: "0.375rem 0.75rem",
                      background: "rgba(34, 197, 94, 0.2)",
                      border: "1px solid rgba(34, 197, 94, 0.5)",
                      borderRadius: "0.375rem",
                      color: "rgb(74, 222, 128)",
                      textDecoration: "none",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      marginTop: "0.25rem",
                    }}
                  >
                    Go to Correct Escrow →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Token</div>
          <div className={styles.infoValueBold}>
            {tokenSymbol} ({tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)})
          </div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Status</div>
          <div className={styles.infoValueBold}>
            {finalized ? "Finalized" : "Not Finalized"}
          </div>
          {!finalized && (
            <div className={styles.infoValueSmall} style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
              SecureLBP: {secureLBPAddress.slice(0, 8)}...{secureLBPAddress.slice(-6)}
            </div>
          )}
        </div>
      </div>

      {/* Vesting Configuration */}
      {vestingConfigured && (
        <div className={styles.configCard}>
          <h2 className={styles.sectionTitle}>Vesting Configuration</h2>
          <div className={styles.configGrid}>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Vesting Start:</span>
              <span className={styles.configValue}>
                {new Date(vestingStart * 1000).toLocaleString()}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Cliff Duration:</span>
              <span className={styles.configValue}>
                {formatTimeRemaining(vestingCliffDuration)}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Final Duration:</span>
              <span className={styles.configValue}>
                {formatTimeRemaining(vestingFinalDuration)}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>Cliff Percent:</span>
              <span className={styles.configValue}>
                {(vestingCliffPercentBP / 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* User Stats */}
      {account && (
        <>
          {hasAllocation ? (
            <>
              {/* Stats Cards */}
              <div className={styles.statsGrid}>
                <div className={`${styles.statCard} ${styles.statCardAllocation}`}>
                  <h4 className={styles.statLabel}>Total Allocation</h4>
                  <p className={styles.statValue}>
                    {formatToken(userAllocation, tokenDecimals)} {tokenSymbol}
                  </p>
                </div>
                <div className={`${styles.statCard} ${styles.statCardVested}`}>
                  <h4 className={styles.statLabel}>Vested Amount</h4>
                  <p className={styles.statValue}>
                    {formatToken(userVested, tokenDecimals)} {tokenSymbol}
                  </p>
                  <p className={styles.statSubtext}>
                    {progressPercent.toFixed(2)}% of allocation
                  </p>
                </div>
                <div className={`${styles.statCard} ${styles.statCardClaimed}`}>
                  <h4 className={styles.statLabel}>Claimed Amount</h4>
                  <p className={styles.statValue}>
                    {formatToken(userClaimed, tokenDecimals)} {tokenSymbol}
                  </p>
                </div>
                <div className={`${styles.statCard} ${styles.statCardAvailable}`}>
                  <h4 className={styles.statLabel}>Available to Claim</h4>
                  <p className={styles.statValue}>
                    {formatToken(userClaimable, tokenDecimals)} {tokenSymbol}
                  </p>
                </div>
              </div>

              {/* Progress Bars */}
              <div className={styles.progressSection}>
                <h2 className={styles.sectionTitle}>Vesting Progress</h2>
                
                {/* Overall Progress */}
                <div className={styles.progressCard}>
                  <div className={styles.progressHeader}>
                    <span className={styles.progressLabel}>Overall Vesting</span>
                    <span className={styles.progressPercent}>{progressPercent.toFixed(2)}%</span>
                  </div>
                  <div className={styles.progressBarContainer}>
                    <div
                      className={styles.progressBar}
                      style={{ width: `${Math.min(progressPercent, 100)}%` }}
                    />
                  </div>
                  <div className={styles.progressInfo}>
                    <span>{formatToken(userVested, tokenDecimals)} / {formatToken(userAllocation, tokenDecimals)} {tokenSymbol}</span>
                  </div>
                </div>

                {/* Cliff Progress */}
                {vestingConfigured && (
                  <div className={styles.progressCard}>
                    <div className={styles.progressHeader}>
                      <span className={styles.progressLabel}>Cliff Progress</span>
                      <span className={styles.progressPercent}>
                        {timeUntilCliff > 0 ? formatTimeRemaining(timeUntilCliff) : "Unlocked"}
                      </span>
                    </div>
                    <div className={styles.progressBarContainer}>
                      <div
                        className={`${styles.progressBar} ${styles.progressBarCliff}`}
                        style={{ width: `${Math.min(cliffProgress, 100)}%` }}
                      />
                    </div>
                    <div className={styles.progressInfo}>
                      <span>
                        {currentTime >= cliffTime
                          ? "Cliff unlocked"
                          : `Cliff unlocks: ${new Date(cliffTime * 1000).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Final Unlock Progress */}
                {vestingConfigured && vestingFinalDuration > 0 && (
                  <div className={styles.progressCard}>
                    <div className={styles.progressHeader}>
                      <span className={styles.progressLabel}>Full Unlock Progress</span>
                      <span className={styles.progressPercent}>
                        {timeUntilFinal > 0 ? formatTimeRemaining(timeUntilFinal) : "Fully Unlocked"}
                      </span>
                    </div>
                    <div className={styles.progressBarContainer}>
                      <div
                        className={`${styles.progressBar} ${styles.progressBarFinal}`}
                        style={{ width: `${Math.min(finalProgress, 100)}%` }}
                      />
                    </div>
                    <div className={styles.progressInfo}>
                      <span>
                        {currentTime >= finalTime
                          ? "Fully unlocked"
                          : `Full unlock: ${new Date(finalTime * 1000).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Vesting Curve Graph */}
              {vestingCurveData.length > 0 && (
                <div className={styles.chartPanel}>
                  <h2 className={styles.sectionTitle}>Vesting Curve</h2>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={vestingCurveData}>
                      <defs>
                        <linearGradient id="vestingGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                      <XAxis
                        dataKey="timestamp"
                        stroke="rgba(255, 255, 255, 0.6)"
                        style={{ fontSize: "0.75rem" }}
                        type="number"
                        scale="linear"
                        domain={[vestingStart, finalTime]}
                        tickFormatter={(value) => {
                          const date = new Date(Number(value) * 1000);
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }}
                      />
                      <YAxis
                        stroke="rgba(255, 255, 255, 0.6)"
                        style={{ fontSize: "0.75rem" }}
                        label={{
                          value: `Vested Amount (${tokenSymbol})`,
                          angle: -90,
                          position: "insideLeft",
                          style: { fill: "rgba(255, 255, 255, 0.6)" },
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.95)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "0.5rem",
                          color: "white",
                        }}
                        formatter={(value) => [
                          `${formatToken(BigInt(value), tokenDecimals)} ${tokenSymbol}`,
                          "Vested",
                        ]}
                        labelFormatter={(label) => {
                          const date = new Date(Number(label) * 1000);
                          return `Time: ${date.toLocaleString()}`;
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="vested"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#vestingGradient)"
                        name={`Vested ${tokenSymbol}`}
                      />
                      {currentTime >= vestingStart && currentTime <= finalTime && (
                        <ReferenceLine
                          x={currentTime}
                          stroke="rgba(255, 255, 255, 0.6)"
                          strokeDasharray="5 5"
                          label={{ value: "Now", position: "top" }}
                        />
                      )}
                      {userVested > 0n && (
                        <ReferenceLine
                          y={Number(userVested)}
                          stroke="rgba(16, 185, 129, 0.6)"
                          strokeDasharray="5 5"
                          label={{
                            value: `Current: ${formatToken(userVested, tokenDecimals)} ${tokenSymbol}`,
                            position: "right",
                          }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Claim Section */}
              <div className={styles.claimSection}>
                <h2 className={styles.sectionTitle}>Claim Tokens</h2>
                <div className={styles.claimCard}>
                  <div className={styles.claimInfo}>
                    <p className={styles.claimLabel}>Available to Claim:</p>
                    <p className={styles.claimAmount}>
                      {formatToken(userClaimable, tokenDecimals)} {tokenSymbol}
                    </p>
                  </div>
                  <button
                    onClick={handleClaim}
                    disabled={!canClaim || tx.isPending}
                    className={`${styles.claimButton} ${!canClaim ? styles.claimButtonDisabled : ""}`}
                  >
                    {tx.isPending ? "Claiming…" : "Claim Tokens"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>
                You don't have any tokens allocated in this vesting escrow.
              </p>
            </div>
          )}
        </>
      )}

      {/* Not Connected State */}
      {!account && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            Please connect your wallet to view your vesting information.
          </p>
        </div>
      )}

      {/* Not Configured State */}
      {!vestingConfigured && finalized && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            Vesting is not configured for this escrow. All tokens may be immediately claimable.
          </p>
        </div>
      )}

      {/* Developer Time Controls */}
      <DeveloperTimeControls onTimeAdvanced={refetchVestingData} useDays={true} />
    </div>
  );
};

export default VestingView;

