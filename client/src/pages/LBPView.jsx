/**
 * LbpView - Complete LBP Trading Page
 * 
 * Production-ready LBP trading interface for STPP protocol.
 * Displays live LBP AMM pool data and allows users to place bids through SecureLBP.placeBid()
 * 
 * Route: /lbp/:lbpAddress
 * 
 * Features:
 * - Live pool state monitoring with real-time updates
 * - Real-time price chart with smooth transitions
 * - Weight schedule visualization
 * - Interactive bid placement with slippage protection
 * - Automatic polling every 5 seconds
 * - Error handling and loading states
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
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
} from "recharts";
import allAbis from "../abi/allAbis.json";
import { useAccount } from "../hooks/useAccount";
import { useTransaction } from "../hooks/useTransaction";
import { useChainId } from "wagmi";
import { handleTxError, showTxSuccess } from "../utils/txErrorHandler";
import { ensureSigner } from "../services/web3/signer";
import { ensureProvider } from "../services/web3/provider";
import DeveloperTimeControls from "../components/presale/DeveloperTimeControls";
import { useRealtimeLbpData } from "../hooks/useRealtimeLbpData";
import styles from "./css/LBPView.module.css";

// Constants
const REFRESH_RATE_MS = 2000; // 2 seconds - real-time refresh rate for polling

const LbpView = () => {
  const { lbpAddress } = useParams();
  const { account } = useAccount();
  const chainId = useChainId();
  const tx = useTransaction();

  // Real-time LBP data hook
  // This hook continuously polls view functions to get time-dependent values
  // (weights, prices, fees) that change based on block.timestamp
  const {
    lbpData,
    poolData,
    priceChartData, // Legacy alias for chartData
    chartData, // New API - progressive chart data
    weights,
    spotPrice,
    reserves,
    adaptiveFee,
    totalTokensAllocated,
    totalEthRaised,
    loading,
    error: lbpError,
    refetch: refetchLbpData,
  } = useRealtimeLbpData(lbpAddress, REFRESH_RATE_MS);
  
  // Use chartData if available, fallback to priceChartData for compatibility
  const activeChartData = chartData && chartData.length > 0 ? chartData : priceChartData;

  // User data and other local state
  const [userData, setUserData] = useState(null);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [weightScheduleData, setWeightScheduleData] = useState([]);
  const [error, setError] = useState("");

  // Bid form state
  const [bidForm, setBidForm] = useState({
    ethAmount: "",
    slippage: "1", // 1% default
    minTokensOut: "",
  });

  // Get provider helper
  const getProvider = useCallback(() => {
    try {
      return ensureProvider();
    } catch (err) {
      console.warn("Provider not available:", err);
      return null;
    }
  }, []);

  /**
   * Fetch user-specific data
   */
  const fetchUserData = useCallback(async () => {
    if (!lbpAddress || !account || !lbpData) {
      setUserData(null);
      return;
    }

    try {
      const provider = getProvider();
      if (!provider) return;

      const lbpAbi = Array.isArray(allAbis.SecureLBP)
        ? allAbis.SecureLBP
        : allAbis.SecureLBP?.abi || allAbis.SecureLBP;
      const lbpContract = new Contract(lbpAddress, lbpAbi, provider);

      const [totalContributed, allocation] = await Promise.all([
        lbpContract.totalContributed(account).catch(() => 0n),
        lbpContract.allocations(account).catch(() => 0n),
      ]);

      setUserData({
        totalContributed,
        allocation,
      });
    } catch (err) {
      console.warn("Could not fetch user data:", err);
      setUserData(null);
    }
  }, [lbpAddress, account, lbpData, getProvider]);

  // Fetch user data when account or lbpData changes
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  /**
   * Generate weight schedule data when pool data is available
   */
  useEffect(() => {
    if (!poolData || !lbpData?.amm || lbpData.amm === ethers.ZeroAddress) {
      setWeightScheduleData([]);
      return;
    }

    const generateWeightSchedule = async () => {
      try {
        const provider = getProvider();
        if (!provider) return;

        const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
          ? allAbis.LBPWeightedAMM
          : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;
        const ammContract = new Contract(lbpData.amm, ammAbi, provider);

        const [startWeightToken, endWeightToken, poolStartTime, poolEndTime] = await Promise.all([
          ammContract.startWeightToken().catch(() => 0n),
          ammContract.endWeightToken().catch(() => 0n),
          ammContract.startTime().catch(() => 0n),
          ammContract.endTime().catch(() => 0n),
        ]);

        const ammStartTime = Number(poolStartTime);
        const ammEndTime = Number(poolEndTime);
        const initialWeight = startWeightToken;
        const finalWeight = endWeightToken;

        if (ammStartTime && ammEndTime && ammStartTime < ammEndTime && initialWeight && finalWeight) {
          const scheduleData = [];
          const points = 100;
          const duration = ammEndTime - ammStartTime;

          for (let i = 0; i <= points; i++) {
            const progress = i / points;
            const timestamp = ammStartTime + duration * progress;

            let currentTokenWeight;
            if (timestamp <= ammStartTime) {
              currentTokenWeight = Number(ethers.formatEther(initialWeight));
            } else if (timestamp >= ammEndTime) {
              currentTokenWeight = Number(ethers.formatEther(finalWeight));
            } else {
              const elapsed = timestamp - ammStartTime;
              const initialWeightNum = Number(ethers.formatEther(initialWeight));
              const finalWeightNum = Number(ethers.formatEther(finalWeight));
              const weightDiff = Math.abs(initialWeightNum - finalWeightNum);
              const change = (weightDiff * elapsed) / duration;
              const isDecreasing = initialWeightNum > finalWeightNum;
              currentTokenWeight = isDecreasing
                ? initialWeightNum - change
                : initialWeightNum + change;
            }

            const currentEthWeight = 1 - currentTokenWeight;

            scheduleData.push({
              timestamp,
              time: new Date(timestamp * 1000).toLocaleTimeString(),
              tokenWeight: currentTokenWeight * 100,
              ethWeight: currentEthWeight * 100,
            });
          }

          setWeightScheduleData(scheduleData);
        }
      } catch (err) {
        console.error("Error generating weight schedule:", err);
      }
    };

    generateWeightSchedule();
  }, [poolData, lbpData?.amm, getProvider]);

  /**
   * Calculate expected tokens for ETH amount
   */
  const calculateExpectedTokens = useCallback(
    async (ethAmount) => {
      if (!poolData || !lbpData || !ethAmount || ethAmount === "0") {
        setBidForm((prev) => ({ ...prev, minTokensOut: "" }));
        return;
      }

      try {
        const provider = getProvider();
        if (!provider) return;

        const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
          ? allAbis.LBPWeightedAMM
          : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;
        const ammContract = new Contract(lbpData.amm, ammAbi, provider);

        const ethAmountWei = ethers.parseEther(ethAmount);
        // Use adaptiveFee from hook if available, otherwise fallback to lbpData.currentFee
        const feeBP = (adaptiveFee !== null && adaptiveFee !== undefined)
          ? BigInt(adaptiveFee)
          : (lbpData.currentFee || 0n); // Fee in basis points (10000 = 100%)
        const BP_SCALE = 10000n;
        
        // Calculate SecureLBP fee (in wei) - this is the fee that SecureLBP takes before sending to pool
        const secureLBPFee = (ethAmountWei * feeBP) / BP_SCALE;
        const netValue = ethAmountWei - secureLBPFee;

        // Get quote from AMM (quoteETHForToken already includes pool swapFee)
        let tokensOut = 0n;
        try {
          // Use quoteETHForToken which includes pool fee automatically
          // It takes netValue (after SecureLBP fee) and applies pool swapFee internally
          tokensOut = await ammContract.quoteETHForToken(netValue).catch(() => {
            // Fallback calculation using reserves and weights
            // Use new API values if available, fallback to poolData
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
              // Simplified AMM calculation using netValue (after SecureLBP fee)
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

        // Apply slippage
        // eslint-disable-next-line no-undef
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
    [poolData, lbpData, bidForm.slippage, getProvider, weights, reserves, adaptiveFee]
  );

  /**
   * Handle bid form changes
   */
  const handleBidFormChange = useCallback((field, value) => {
    setBidForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Recalculate tokens when ETH amount or slippage changes
   */
  useEffect(() => {
    if (bidForm.ethAmount) {
      calculateExpectedTokens(bidForm.ethAmount);
    }
  }, [bidForm.ethAmount, bidForm.slippage, calculateExpectedTokens]);

  /**
   * Place bid transaction
   */
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
      const provider = getProvider();
      if (!provider) {
        throw new Error("No wallet provider");
      }

      // Pre-flight checks
      const lbpAbi = Array.isArray(allAbis.SecureLBP)
        ? allAbis.SecureLBP
        : allAbis.SecureLBP?.abi || allAbis.SecureLBP;
      const lbpContractRead = new Contract(lbpAddress, lbpAbi, provider);

      // Check pool initialization
      const poolInitialized = await lbpContractRead.poolInitialized().catch(() => false);
      if (!poolInitialized) {
        handleTxError(new Error("Pool is not initialized yet"));
        return;
      }

      // Check time window
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

      // Check pause status
      const paused = await lbpContractRead.paused().catch(() => false);
      if (paused) {
        handleTxError(new Error("LBP is currently paused"));
        return;
      }

      // Check oracle pause
      if (lbpData.oraclePaused) {
        handleTxError(new Error("LBP is paused by oracle"));
        return;
      }

      // Check contribution cap
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

      // Check if finalized
      const finalized = await lbpContractRead.finalized().catch(() => false);
      if (finalized) {
        handleTxError(new Error("LBP has been finalized. Trading is no longer available"));
        return;
      }

      // Calculate fee and check net value
      const feeBP = await lbpContractRead.currentFeeBP().catch(() => 0n);
      const BP_SCALE = 10000n;
      const fee = (ethAmountWei * feeBP) / BP_SCALE;
      const netValue = ethAmountWei - fee;
      
      if (netValue === 0n) {
        handleTxError(new Error("ETH amount is too small. After fees, net value would be zero"));
        return;
      }

      // Verify minTokensOut is reasonable
      const minTokensOutWei = ethers.parseUnits(
        bidForm.minTokensOut,
        lbpData.tokenInfo?.decimals || 18
      );

      if (minTokensOutWei === 0n) {
        handleTxError(new Error("Minimum tokens out cannot be zero"));
        return;
      }

      // Try to get a quote to verify the transaction would work
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
            // Reset form
            setBidForm({ ethAmount: "", slippage: "1", minTokensOut: "" });
            // Refresh data immediately after bid
            await refetchLbpData();
            // Refresh user data
            await fetchUserData();
          },
        }
      );
    } catch (err) {
      console.error("Error placing bid:", err);
      
      // Provide more helpful error messages
      let errorMessage = err?.message || "Failed to place bid";
      
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      
      // Check for common revert reasons
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
  }, [lbpData, poolData, account, bidForm, lbpAddress, getProvider, tx]);

  // Combine errors
  useEffect(() => {
    if (lbpError) {
      setError(lbpError);
    }
  }, [lbpError]);

  // Update current time - CRITICAL for time-dependent calculations
  useEffect(() => {
    const updateTime = async () => {
      const isLocal =
        chainId === 31337 ||
        chainId === 1337 ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      try {
        const provider = getProvider();
        if (provider) {
          // Always try to get blockchain time first (works for both local and mainnet)
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
      
      // Fallback to system time if blockchain time unavailable
      setCurrentTime(Math.floor(Date.now() / 1000));
    };

    // Update immediately
    updateTime();
    
    // Update every second for real-time countdown
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [chainId, getProvider]);

  // Computed values
  const status = useMemo(() => {
    if (!lbpData) return "Loading...";
    if (lbpData.paused || lbpData.oraclePaused) return "Paused";
    if (!lbpData.poolInitialized) return "Not Initialized";
    if (lbpData.finalized) return "Finalized";
    if (currentTime < lbpData.startTime) return "Upcoming";
    if (currentTime >= lbpData.startTime && currentTime <= lbpData.endTime)
      return "Active";
    return "Ended";
  }, [lbpData, currentTime]);

  const timeUntilEnd = useMemo(() => {
    if (!lbpData || currentTime >= lbpData.endTime) return null;
    const remaining = lbpData.endTime - currentTime;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return { hours, minutes, seconds, total: remaining };
  }, [lbpData, currentTime]);

  const isActive = status === "Active";
  const canBid = isActive && !lbpData?.paused && !lbpData?.oraclePaused && account;

  // Find closest point in weight schedule for current time
  const currentTimePoint = useMemo(() => {
    if (
      !weightScheduleData.length ||
      currentTime < lbpData?.startTime ||
      currentTime > lbpData?.endTime
    ) {
      return null;
    }
    return weightScheduleData.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.timestamp - currentTime);
      const currDiff = Math.abs(curr.timestamp - currentTime);
      return currDiff < prevDiff ? curr : prev;
    });
  }, [weightScheduleData, currentTime, lbpData?.startTime, lbpData?.endTime]);

  // Helper functions
  const formatTime = (timestamp) => {
    if (!timestamp || timestamp === 0) return "N/A";
    return new Date(Number(timestamp) * 1000).toLocaleString();
  };

  const formatEther = (value) => {
    if (!value) return "0";
    return ethers.formatEther(value);
  };

  const formatToken = (value, decimals = 18) => {
    if (!value) return "0";
    return ethers.formatUnits(value, decimals);
  };

  const shortenAddress = (addr) => {
    if (!addr || addr === ethers.ZeroAddress) return "N/A";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading LBP data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>Error</h2>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!lbpData) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyContent}>
          <p className={styles.emptyText}>LBP not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* ============ 1. LBP Header Panel ============ */}
        <div className={styles.headerPanel}>
          <div className={styles.headerTop}>
            <div>
              <h1 className={styles.headerTitle}>
                Liquidity Bootstrapping Pool
              </h1>
              <p className={styles.headerSubtitle}>
                LBP: {shortenAddress(lbpAddress)}
              </p>
            </div>
            <div
              className={`${styles.statusBadge} ${
                status === "Active"
                  ? styles.statusBadgeActive
                  : status === "Finalized"
                  ? styles.statusBadgeFinalized
                  : status === "Paused"
                  ? styles.statusBadgePaused
                  : styles.statusBadgeDefault
              }`}
            >
              <span
                className={`${styles.statusDot} ${
                  status === "Active"
                    ? styles.statusDotActive
                    : status === "Finalized"
                    ? styles.statusDotFinalized
                    : status === "Paused"
                    ? styles.statusDotPaused
                    : styles.statusDotDefault
                }`}
              ></span>
              <span className={styles.statusText}>{status}</span>
            </div>
          </div>

          {/* Navigation */}
          <div className={styles.navigation}>
            {lbpData.auction && lbpData.auction !== ethers.ZeroAddress && (
              <Link
                to={`/presale/${lbpData.presaleManager}/auction`}
                className={styles.navLink}
              >
                ← Back to Auction
              </Link>
            )}
            {lbpData.presaleManager &&
              lbpData.presaleManager !== ethers.ZeroAddress && (
                <Link
                  to={`/manager/${lbpData.presaleManager}`}
                  className={styles.navLink}
                >
                  Presale Manager →
                </Link>
              )}
          </div>

          {/* Header Info Grid */}
          <div className={styles.headerGrid}>
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>LBP Contract</h3>
              <p className={styles.infoValue}>{lbpAddress}</p>
            </div>
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>Presale Manager</h3>
              <p className={styles.infoValue}>
                {shortenAddress(lbpData.presaleManager)}
              </p>
            </div>
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>Sale Token</h3>
              <p className={styles.infoValueBold}>
                {lbpData.tokenInfo?.symbol || "N/A"}
              </p>
              <p className={styles.infoValueSmall}>
                {shortenAddress(lbpData.token)}
              </p>
            </div>
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>Trading Token</h3>
              <p className={styles.infoValueBold}>ETH</p>
            </div>
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>Start Time</h3>
              <p className={styles.infoValue}>{formatTime(lbpData.startTime)}</p>
            </div>
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>End Time</h3>
              <p className={styles.infoValue}>{formatTime(lbpData.endTime)}</p>
            </div>
            {timeUntilEnd && (
              <div className={styles.infoCard}>
                <h3 className={styles.infoLabel}>Time Until End</h3>
                <p className={styles.infoValueBold}>
                  {timeUntilEnd.hours}h {timeUntilEnd.minutes}m {timeUntilEnd.seconds}s
                </p>
              </div>
            )}
            <div className={styles.infoCard}>
              <h3 className={styles.infoLabel}>Oracle Pause</h3>
              <p className={styles.infoValue}>{lbpData.oraclePaused ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>

        {/* ============ 2. Pool State Overview ============ */}
        {poolData && (
          <div className={styles.poolPanel}>
            <h2 className={styles.poolTitle}>Pool State Overview</h2>
            <div className={styles.poolGrid}>
              <div className={`${styles.statCard} ${styles.statCardToken}`}>
                <h4 className={styles.statLabel}>Token Reserve</h4>
                <p className={styles.statValue}>
                  {reserves?.token !== null && reserves?.token !== undefined
                    ? formatToken(reserves.token, lbpData.tokenInfo?.decimals || 18)
                    : poolData?.reserveToken
                    ? formatToken(poolData.reserveToken, lbpData.tokenInfo?.decimals || 18)
                    : "0"}{" "}
                  {lbpData.tokenInfo?.symbol || "tokens"}
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardETH}`}>
                <h4 className={styles.statLabel}>ETH Reserve</h4>
                <p className={styles.statValue}>
                  {reserves?.eth !== null && reserves?.eth !== undefined
                    ? formatEther(reserves.eth)
                    : poolData?.reserveETH
                    ? formatEther(poolData.reserveETH)
                    : "0"} ETH
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardTokenWeight}`}>
                <h4 className={styles.statLabel}>Current Token Weight</h4>
                <p className={styles.statValue}>
                  {weights?.token !== null && weights?.token !== undefined
                    ? (Number(ethers.formatEther(weights.token)) * 100).toFixed(2)
                    : poolData?.tokenWeight
                    ? (Number(ethers.formatEther(poolData.tokenWeight)) * 100).toFixed(2)
                    : "0.00"}%
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardETHWeight}`}>
                <h4 className={styles.statLabel}>Current ETH Weight</h4>
                <p className={styles.statValue}>
                  {weights?.eth !== null && weights?.eth !== undefined
                    ? (Number(ethers.formatEther(weights.eth)) * 100).toFixed(2)
                    : poolData?.ethWeight
                    ? (Number(ethers.formatEther(poolData.ethWeight)) * 100).toFixed(2)
                    : "0.00"}%
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardPrice}`}>
                <h4 className={styles.statLabel}>Current Price</h4>
                <p className={styles.statValue}>
                  {(spotPrice !== null && spotPrice !== undefined && spotPrice > 0)
                    ? spotPrice.toFixed(6)
                    : poolData?.price && poolData.price > 0
                    ? poolData.price.toFixed(6)
                    : "N/A"}{" "}
                  ETH/{lbpData.tokenInfo?.symbol || "token"}
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardDefault}`}>
                <h4 className={styles.statLabel}>Total Tokens Allocated</h4>
                <p className={styles.statValue}>
                  {totalTokensAllocated !== null && totalTokensAllocated !== undefined
                    ? formatToken(totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)
                    : lbpData?.totalTokensAllocated
                    ? formatToken(lbpData.totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)
                    : "0"}{" "}
                  {lbpData.tokenInfo?.symbol || "tokens"}
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardDefault}`}>
                <h4 className={styles.statLabel}>Total ETH Raised</h4>
                <p className={styles.statValue}>
                  {totalEthRaised !== null && totalEthRaised !== undefined
                    ? formatEther(totalEthRaised)
                    : lbpData?.totalEthRaised
                    ? formatEther(lbpData.totalEthRaised)
                    : "0"} ETH
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardDefault}`}>
                <h4 className={styles.statLabel}>Adaptive Fee</h4>
                <p className={styles.statValue}>
                  {adaptiveFee !== null && adaptiveFee !== undefined
                    ? (Number(adaptiveFee) / 100).toFixed(2)
                    : lbpData?.currentFee !== null && lbpData?.currentFee !== undefined
                    ? (Number(lbpData.currentFee) / 100).toFixed(2)
                    : "0.00"}%
                </p>
              </div>
              <div className={`${styles.statCard} ${styles.statCardDefault}`}>
                <h4 className={styles.statLabel}>Max Contribution Per Address</h4>
                <p className={styles.statValue}>
                  {formatEther(lbpData.maxContributionPerAddress)} ETH
                </p>
              </div>
              {userData && (
                <>
                  <div className={`${styles.statCard} ${styles.statCardDefault}`}>
                    <h4 className={styles.statLabel}>Your Contribution</h4>
                    <p className={styles.statValue}>
                      {formatEther(userData.totalContributed)} ETH
                    </p>
                  </div>
                  <div className={`${styles.statCard} ${styles.statCardDefault}`}>
                    <h4 className={styles.statLabel}>Your Allocation</h4>
                    <p className={styles.statValue}>
                      {formatToken(
                        userData.allocation,
                        lbpData.tokenInfo?.decimals || 18
                      )}{" "}
                      {lbpData.tokenInfo?.symbol || "tokens"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============ 3. Price Chart (Live) ============ */}
        {poolData && lbpData && (
          <div className={styles.chartPanel}>
            <h2 className={styles.chartTitle}>Price Chart (Live)</h2>
            {(!activeChartData || activeChartData.length === 0) ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255, 255, 255, 0.6)" }}>
                <p>Waiting for price data...</p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart 
                data={activeChartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255, 255, 255, 0.1)"
                />
                <XAxis
                  dataKey="timestamp"
                  stroke="rgba(255, 255, 255, 0.6)"
                  style={{ fontSize: "0.75rem" }}
                  type="number"
                  scale="linear"
                  domain={[
                    lbpData.startTime || 'dataMin',
                    lbpData.endTime || 'dataMax'
                  ]}
                  tickFormatter={(value) => {
                    const date = new Date(Number(value) * 1000);
                    return date.toLocaleTimeString('en-US', { 
                      hour12: false, 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    });
                  }}
                  allowDuplicatedCategory={false}
                  label={{
                    value: "Time",
                    position: "insideBottom",
                    offset: -5,
                    style: { fill: "rgba(255, 255, 255, 0.6)", fontSize: "0.75rem" },
                  }}
                />
                <YAxis
                  stroke="rgba(255, 255, 255, 0.6)"
                  style={{ fontSize: "0.75rem" }}
                  domain={['auto', 'auto']}
                  label={{
                    value: "Price (ETH/token)",
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
                    `${Number(value).toFixed(6)} ETH/token`,
                    "Price",
                  ]}
                  labelFormatter={(label) => {
                    const date = new Date(Number(label) * 1000);
                    return `Time: ${date.toLocaleTimeString()}`;
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="Price (ETH/token)"
                  connectNulls={true}
                  isAnimationActive={true}
                  animationDuration={300}
                />
                {currentTime >= lbpData.startTime &&
                  currentTime <= lbpData.endTime && (
                    <ReferenceLine
                      x={currentTime}
                      stroke="rgba(255, 255, 255, 0.6)"
                      strokeDasharray="5 5"
                      label={{ value: "Now", position: "top" }}
                    />
                  )}
                {((spotPrice !== null && spotPrice !== undefined && spotPrice > 0) || (poolData?.price && poolData.price > 0)) && (
                  <ReferenceLine
                    y={spotPrice !== null && spotPrice !== undefined && spotPrice > 0 ? spotPrice : poolData.price}
                    stroke="rgba(16, 185, 129, 0.6)"
                    strokeDasharray="5 5"
                    label={{
                      value: `Current: ${(spotPrice !== null && spotPrice !== undefined && spotPrice > 0 ? spotPrice : poolData.price).toFixed(6)} ETH/token`,
                      position: "right",
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ============ 4. Weight Schedule Chart ============ */}
        {poolData && lbpData && (
          <div className={styles.chartPanel}>
            <h2 className={styles.chartTitle}>Weight Schedule</h2>
            {weightScheduleData.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255, 255, 255, 0.6)" }}>
                <p>Loading weight schedule...</p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart 
                data={weightScheduleData}
                margin={{ top: 60, right: 30, bottom: 20, left: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255, 255, 255, 0.1)"
                />
                <XAxis
                  dataKey="timestamp"
                  stroke="rgba(255, 255, 255, 0.6)"
                  style={{ fontSize: "0.75rem" }}
                  type="number"
                  scale="linear"
                  domain={[
                    lbpData?.startTime || 'dataMin',
                    lbpData?.endTime || 'dataMax'
                  ]}
                  tickFormatter={(value) => {
                    const date = new Date(Number(value) * 1000);
                    return date.toLocaleTimeString('en-US', { 
                      hour12: false, 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    });
                  }}
                  allowDuplicatedCategory={false}
                  label={{
                    value: "Time",
                    position: "insideBottom",
                    offset: -5,
                    style: { fill: "rgba(255, 255, 255, 0.6)", fontSize: "0.75rem" },
                  }}
                />
                <YAxis
                  stroke="rgba(255, 255, 255, 0.6)"
                  style={{ fontSize: "0.75rem" }}
                  label={{
                    value: "Weight (%)",
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
                  formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ethWeight"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="ETH Weight (%)"
                />
                <Line
                  type="monotone"
                  dataKey="tokenWeight"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  name="Token Weight (%)"
                />
                {(weights?.eth !== null && weights?.eth !== undefined) || poolData ? (
                  <>
                    {/* Horizontal lines for current weights */}
                    <ReferenceLine
                      y={(weights?.eth !== null && weights?.eth !== undefined
                        ? Number(ethers.formatEther(weights.eth))
                        : Number(ethers.formatEther(poolData.ethWeight))) * 100}
                      stroke="#8b5cf6"
                      strokeDasharray="5 5"
                      strokeOpacity={0.7}
                      label={{
                        value: `ETH: ${((weights?.eth !== null && weights?.eth !== undefined
                          ? Number(ethers.formatEther(weights.eth))
                          : Number(ethers.formatEther(poolData.ethWeight))) * 100).toFixed(2)}%`,
                        position: "right",
                        style: { fill: "#8b5cf6", fontSize: "0.75rem", fontWeight: "bold" },
                      }}
                    />
                    <ReferenceLine
                      y={(weights?.token !== null && weights?.token !== undefined
                        ? Number(ethers.formatEther(weights.token))
                        : Number(ethers.formatEther(poolData.tokenWeight))) * 100}
                      stroke="#06b6d4"
                      strokeDasharray="5 5"
                      strokeOpacity={0.7}
                      label={{
                        value: `Token: ${((weights?.token !== null && weights?.token !== undefined
                          ? Number(ethers.formatEther(weights.token))
                          : Number(ethers.formatEther(poolData.tokenWeight))) * 100).toFixed(2)}%`,
                        position: "right",
                        style: { fill: "#06b6d4", fontSize: "0.75rem", fontWeight: "bold" },
                      }}
                    />
                  </>
                ) : null}
                {/* Vertical line for current time with info block */}
                {currentTimePoint && ((weights?.eth !== null && weights?.eth !== undefined) || poolData) && (
                  <>
                    <ReferenceLine
                      x={currentTimePoint.timestamp}
                      stroke="rgba(255, 255, 255, 0.8)"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                    />
                    {/* Custom label component */}
                    <ReferenceLine
                      x={currentTimePoint.timestamp}
                      label={({ viewBox }) => {
                        if (!viewBox || viewBox.y < 50) return null;
                        const currentEthWeight = weights?.eth !== null && weights?.eth !== undefined
                          ? weights.eth
                          : poolData.ethWeight;
                        const currentTokenWeight = weights?.token !== null && weights?.token !== undefined
                          ? weights.token
                          : poolData.tokenWeight;
                        const ethWeightPercent = (Number(ethers.formatEther(currentEthWeight)) * 100).toFixed(2);
                        const tokenWeightPercent = (Number(ethers.formatEther(currentTokenWeight)) * 100).toFixed(2);
                        // Position block above the line, ensuring it stays within chart bounds
                        const blockY = Math.max(10, viewBox.y - 50);
                        return (
                          <g>
                            <rect
                              x={viewBox.x - 85}
                              y={blockY}
                              width={170}
                              height={45}
                              fill="rgba(15, 23, 42, 0.95)"
                              stroke="rgba(255, 255, 255, 0.3)"
                              strokeWidth={1}
                              rx={6}
                            />
                            <text
                              x={viewBox.x}
                              y={blockY + 18}
                              textAnchor="middle"
                              fill="#8b5cf6"
                              fontSize="0.75rem"
                              fontWeight="bold"
                            >
                              ETH Weight: {ethWeightPercent}%
                            </text>
                            <text
                              x={viewBox.x}
                              y={blockY + 33}
                              textAnchor="middle"
                              fill="#06b6d4"
                              fontSize="0.75rem"
                              fontWeight="bold"
                            >
                              Token Weight: {tokenWeightPercent}%
                            </text>
                          </g>
                        );
                      }}
                      alwaysShow={true}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ============ 5. User Bid Panel ============ */}
        {canBid && (
          <div className={styles.bidPanel}>
            <h2 className={styles.bidTitle}>Place Bid</h2>
            <div className={styles.bidForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  ETH Amount
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={bidForm.ethAmount}
                  onChange={(e) => handleBidFormChange("ethAmount", e.target.value)}
                  placeholder="0.0"
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Slippage Tolerance (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={bidForm.slippage}
                  onChange={(e) => handleBidFormChange("slippage", e.target.value)}
                  placeholder="1"
                  className={styles.formInput}
                />
              </div>
              {bidForm.minTokensOut && (
                <div className={styles.expectedTokens}>
                  <p className={styles.expectedTokensLabel}>
                    Expected Tokens (min):
                  </p>
                  <p className={styles.expectedTokensValue}>
                    {bidForm.minTokensOut} {lbpData.tokenInfo?.symbol || "tokens"}
                  </p>
                </div>
              )}
              <button
                onClick={handlePlaceBid}
                disabled={
                  !bidForm.ethAmount ||
                  !bidForm.minTokensOut ||
                  tx.isPending
                }
                className={`${styles.bidButton} ${
                  tx.isPending ||
                  !bidForm.ethAmount ||
                  !bidForm.minTokensOut
                    ? styles.bidButtonDisabled
                    : styles.bidButtonEnabled
                }`}
              >
                {tx.isPending ? "Placing Bid..." : "Place Bid"}
              </button>
              {!account && (
                <p className={styles.walletMessage}>
                  Please connect your wallet to place a bid
                </p>
              )}
            </div>
          </div>
        )}

        {/* Finalized State */}
        {lbpData.finalized && (
          <div className={styles.finalizedPanel}>
            <h2 className={styles.finalizedTitle}>Finalized</h2>
            <p className={styles.finalizedText}>
              This LBP has been finalized. Trading is no longer available.
            </p>
            {lbpData.vestingEscrow &&
              lbpData.vestingEscrow !== ethers.ZeroAddress && (
                <p className={styles.finalizedSubtext}>
                  Vesting Escrow: {shortenAddress(lbpData.vestingEscrow)}
                </p>
              )}
          </div>
        )}

        {/* Developer Time Controls - Only visible on localhost/hardhat */}
        <DeveloperTimeControls onTimeAdvanced={refetchLbpData} />
      </div>
    </div>
  );
};

export default LbpView;
