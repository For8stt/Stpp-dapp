import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { Contract, JsonRpcProvider } from "ethers";
import { ensureProvider } from "../services/web3/provider";
import allAbis from "../abi/allAbis.json";
import { reconstructChartData } from "../utils/lbpChartReconstruction";
import { safeQueryEvents } from "../utils/contractUtils";

const MAX_CHART_POINTS = 1000;
const POLL_INTERVAL_MS = 1000; // Poll every 1 second for smooth updates
const LOCAL_TIME_ADVANCE_SEC = 1; // Advance time by 10 seconds per poll on local hardhat (for faster weight changes)

/**
 * Custom hook for real-time LBP data updates
 * 
 * ROOT CAUSE: The AMM contract does NOT store changing weights - they are computed
 * dynamically based on block.timestamp. Therefore the frontend MUST pull these
 * values periodically to see time-dependent changes.
 * 
 * This hook continuously polls view functions to get fresh time-dependent values:
 * - Weights (calculated based on block.timestamp via currentWeights())
 * - Spot price (calculated from reserves and weights)
 * - Reserves (token and ETH - only change on swaps, but we poll anyway)
 * - Adaptive fee (currentFeeBP() - time-dependent)
 * - Total tokens allocated
 * - Total ETH raised
 * 
 * @param {string} lbpAddress - The LBP contract address
 * @param {number} refreshRateMs - DEPRECATED: Always uses 1 second polling
 * @returns {object} - { weights, spotPrice, reserves, adaptiveFee, totalTokensAllocated, totalEthRaised, chartData, loading, error, refetch }
 */
export const useRealtimeLbpData = (lbpAddress, refreshRateMs = POLL_INTERVAL_MS) => {
  // State - all time-dependent values
  const [weights, setWeights] = useState({ token: null, eth: null });
  const [spotPrice, setSpotPrice] = useState(null);
  const [reserves, setReserves] = useState({ token: null, eth: null });
  const [adaptiveFee, setAdaptiveFee] = useState(null);
  const [totalTokensAllocated, setTotalTokensAllocated] = useState(null);
  const [totalEthRaised, setTotalEthRaised] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Legacy state for UI compatibility
  const [lbpData, setLbpData] = useState(null);
  const [poolData, setPoolData] = useState(null);

  // Guards to prevent overlapping calls
  const isFetchingRef = useRef(false);
  const isAdvancingTimeRef = useRef(false);
  const lastTimeAdvanceRef = useRef(0);
  const intervalRef = useRef(null);
  const swapEventsIntervalRef = useRef(null);
  const blockListenerRef = useRef(null);
  const providerRef = useRef(null);
  const lbpContractRef = useRef(null);
  const ammContractRef = useRef(null);

  const poolAddressRef = useRef(null);
  const tokenInfoRef = useRef(null);
  const chartDomainRef = useRef({ startTime: null, endTime: null });
  const lbpAddressRef = useRef(null);
  const lbpEndTimeRef = useRef(null); // Store endTime to check if LBP has ended
  const lbpFinalizedRef = useRef(false); // Store finalized status to stop all requests
  const oraclePausedUntilRef = useRef(null); // Store oraclePausedUntil to prevent it from being overwritten
  const [swapEvents, setSwapEvents] = useState([]);
  const initialReservesRef = useRef({ eth: null, token: null });

  /**
   * Advance blockchain time for local hardhat (CRITICAL for time-dependent values)
   * This ensures block.timestamp advances, which makes weights and fees update
   * Uses direct connection to Hardhat RPC (like DeveloperTimeControls) for reliability
   * 
   * IMPORTANT: This function has guards to prevent rapid time advancement.
   * It only advances time once per second maximum, and only if enough time has passed.
   */
  const advanceBlockchainTime = useCallback(async (provider) => {
    const isLocal = 
      typeof window !== "undefined" && 
      (window.location.hostname === "localhost" || 
       window.location.hostname === "127.0.0.1");
    
    if (!isLocal) return;
    if (isAdvancingTimeRef.current) {
      return;
    }
    const now = Date.now();
    const timeSinceLastAdvance = now - lastTimeAdvanceRef.current;
    if (timeSinceLastAdvance < 1000) {
      return; // Skip if less than 1 second has passed
    }
    
    isAdvancingTimeRef.current = true;
    lastTimeAdvanceRef.current = now;
    
    try {
      // Connect directly to Hardhat node (not through MetaMask)
      // Hardhat RPC endpoint is typically http://127.0.0.1:8545
      const hardhatRpcUrl = "http://127.0.0.1:8545";
      const hardhatProvider = new JsonRpcProvider(hardhatRpcUrl);

      // Advance time by LOCAL_TIME_ADVANCE_SEC seconds
      // This simulates time progression so weights/fees update
      await hardhatProvider.send("evm_increaseTime", [LOCAL_TIME_ADVANCE_SEC]);
      
      // Mine a new block to apply the time change
      // Mine multiple blocks to ensure timestamp propagates correctly
      await hardhatProvider.send("evm_mine", []);
      
      // Optional: Mine one more block to ensure time is applied
      await hardhatProvider.send("evm_mine", []).catch(() => {});
    } catch (err) {
      // Silently fail - evm methods might not be available if Hardhat is not running
      // This is expected on mainnet/production
      if (err.code !== "ECONNREFUSED") {
        console.warn("[LBP] Could not advance blockchain time:", err.message);
      }
    } finally {
      isAdvancingTimeRef.current = false;
    }
  }, []);

  /**
   * Fetch ONLY pool data WITHOUT advancing time
   * Used by block listener to avoid double time advancement
   */
  const fetchPoolDataOnlyWithoutTimeAdvance = useCallback(async () => {
    if (!poolAddressRef.current || !tokenInfoRef.current) {
      return;
    }

    // Check guard AFTER checking refs to avoid race conditions
    if (isFetchingRef.current) {
      return;
    }

    const provider = ensureProvider();
    if (!provider) return;

    // Get fresh block timestamp FIRST to check if LBP has ended
    let now = Math.floor(Date.now() / 1000);
    try {
      const block = await provider.getBlock("latest");
      if (block?.timestamp) {
        now = Number(block.timestamp);
      }
    } catch (err) {
      console.warn("Could not get latest block:", err);
    }

    if (lbpEndTimeRef.current !== null && now >= lbpEndTimeRef.current) {
      return;
    }

    // Set fetching guard to prevent overlapping calls
    isFetchingRef.current = true;

    try {
      // DO NOT advance time here - this is called from block listener
      // Time advancement is handled by interval polling only

      const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
        ? allAbis.LBPWeightedAMM
        : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;

      const ammContract = ammContractRef.current || new Contract(poolAddressRef.current, ammAbi, provider);
      ammContractRef.current = ammContract;

      // Fetch data (same as fetchPoolDataOnly but without time advancement)
      const [
        reserveToken,
        reserveETH,
        tokenWeight,
        ethWeight,
      ] = await Promise.all([
        ammContract.reserveToken().catch(() => 0n),
        ammContract.reserveETH().catch(() => 0n),
        ammContract.getCurrentWeightToken().catch(() => 0n),
        ammContract.getCurrentWeightETH().catch(() => 0n),
      ]);

      setReserves({
        token: reserveToken,
        eth: reserveETH,
      });

      const tokenWeightNum = Number(ethers.formatEther(tokenWeight));
      const ethWeightNum = Number(ethers.formatEther(ethWeight));
      
      setWeights({
        token: tokenWeight,
        eth: ethWeight,
      });

      // Calculate spot price
      let price = 0;
      if (reserveETH > 0n && reserveToken > 0n && tokenWeight > 0n && ethWeight > 0n) {
        try {
          const oneETH = ethers.parseEther("1");
          const tokensForOneETH = await ammContract.quoteETHForToken(oneETH).catch(() => null);
          
          if (tokensForOneETH !== null && tokensForOneETH > 0n) {
            const tokensForOneETHNum = Number(
              ethers.formatUnits(tokensForOneETH, tokenInfoRef.current?.decimals || 18)
            );
            if (tokensForOneETHNum > 0) {
              price = 1 / tokensForOneETHNum;
            }
          } else {
            const reserveETHNum = Number(ethers.formatEther(reserveETH));
            const reserveTokenNum = Number(
              ethers.formatUnits(reserveToken, tokenInfoRef.current?.decimals || 18)
            );
            const tokenWeightNum = Number(ethers.formatEther(tokenWeight));
            const ethWeightNum = Number(ethers.formatEther(ethWeight));

            if (reserveTokenNum > 0 && ethWeightNum > 0 && tokenWeightNum > 0) {
              price = (reserveETHNum * tokenWeightNum) / (reserveTokenNum * ethWeightNum);
            }
          }
        } catch (priceErr) {
          console.warn("Could not calculate spot price:", priceErr);
        }
      }

      setSpotPrice(price);

      const poolDataObj = {
        address: poolAddressRef.current,
        reserveToken,
        reserveETH,
        tokenWeight,
        ethWeight,
        price,
        lastUpdate: Date.now(),
        blockchainTime: now,
      };
      setPoolData(poolDataObj);
    } catch (err) {
      console.error("Error fetching pool data:", err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  /**
   * Fetch ONLY pool data (weights, reserves, price) - called frequently
   * This is the critical function that must run every second to see weight changes
   * STOPS updating when LBP has ended (currentTime >= endTime)
   * ADVANCES TIME for local hardhat development
   */
  const fetchPoolDataOnly = useCallback(async () => {
    if (!poolAddressRef.current || !tokenInfoRef.current) {
      return;
    }

    // Check guard AFTER checking refs to avoid race conditions
    if (isFetchingRef.current) {
      return;
    }

    const provider = ensureProvider();
    if (!provider) return;

    // Get fresh block timestamp FIRST to check if LBP has ended
    let now = Math.floor(Date.now() / 1000);
    try {
      const block = await provider.getBlock("latest");
      if (block?.timestamp) {
        now = Number(block.timestamp);
      }
    } catch (err) {
      console.warn("Could not get latest block:", err);
    }

    //  Stop updating if LBP has ended
    if (lbpEndTimeRef.current !== null && now >= lbpEndTimeRef.current) {
      // LBP has ended - stop updating chart and weights
      // Don't set guard since we're returning early
      return;
    }

    // Set fetching guard to prevent overlapping calls
    isFetchingRef.current = true;

    try {
      // Advance time for local hardhat FIRST (before fetching)
      // Only advance if LBP hasn't ended yet
      if (lbpEndTimeRef.current === null || now < lbpEndTimeRef.current) {
        await advanceBlockchainTime(provider);
        
        // Re-fetch block timestamp after advancing time
        try {
          const block = await provider.getBlock("latest");
          if (block?.timestamp) {
            now = Number(block.timestamp);
          }
        } catch (err) {
          console.warn("Could not get latest block after advancing time:", err);
        }
      }

      const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
        ? allAbis.LBPWeightedAMM
        : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;

      const ammContract = ammContractRef.current || new Contract(poolAddressRef.current, ammAbi, provider);
      ammContractRef.current = ammContract;

      // Also fetch LBP contract for adaptive fee and totals
      let currentFee = null;
      let totalEthRaised = null;
      let totalTokensAllocated = null;
      
      if (lbpAddressRef.current && lbpContractRef.current) {
        try {
          [currentFee, totalEthRaised, totalTokensAllocated] = await Promise.all([
            lbpContractRef.current.currentFeeBP().catch(() => null), // Time-dependent!
            lbpContractRef.current.totalEthRaised().catch(() => null),
            lbpContractRef.current.totalTokensAllocated().catch(() => null),
          ]);
        } catch (err) {
          console.warn("Could not fetch LBP fee/totals:", err);
        }
      } else if (lbpAddressRef.current) {
        // Recreate contract if needed
        try {
          const lbpAbi = Array.isArray(allAbis.SecureLBP)
            ? allAbis.SecureLBP
            : allAbis.SecureLBP?.abi || allAbis.SecureLBP;
          const lbpContract = new Contract(lbpAddressRef.current, lbpAbi, provider);
          lbpContractRef.current = lbpContract;
          
          [currentFee, totalEthRaised, totalTokensAllocated] = await Promise.all([
            lbpContract.currentFeeBP().catch(() => null), // Time-dependent!
            lbpContract.totalEthRaised().catch(() => null),
            lbpContract.totalTokensAllocated().catch(() => null),
          ]);
        } catch (err) {
          console.warn("Could not create/fetch LBP contract:", err);
        }
      }

      //  Fetch time-dependent values using view functions
      // These values change based on block.timestamp, so we MUST call them every second
      const [
        reserveToken,
        reserveETH,
        tokenWeight,
        ethWeight,
      ] = await Promise.all([
        ammContract.reserveToken().catch(() => 0n),
        ammContract.reserveETH().catch(() => 0n),
        ammContract.getCurrentWeightToken().catch(() => 0n), // Time-dependent!
        ammContract.getCurrentWeightETH().catch(() => 0n),   // Time-dependent!
      ]);

      // Update reserves
      setReserves({
        token: reserveToken,
        eth: reserveETH,
      });

      // Update weights (these change over time!)
      const tokenWeightNum = Number(ethers.formatEther(tokenWeight));
      const ethWeightNum = Number(ethers.formatEther(ethWeight));
      
      setWeights({
        token: tokenWeight,
        eth: ethWeight,
      });

      // Log weight changes for debugging (only if changed significantly)
      if (weights.token !== null) {
        const prevTokenWeight = Number(ethers.formatEther(weights.token));
        const weightDiff = Math.abs(tokenWeightNum - prevTokenWeight);
        if (weightDiff > 0.001) { // Log if weight changed by more than 0.1%
        }
      }

      //  Do NOT update adaptiveFee here - it's managed by oracle logic
      // The oracle logic in fetchLBPData() sets adaptiveFee based on displayFeeBP
      // which is the single source of truth (maxFeeBP if paused, viewAdaptiveFee() otherwise)
      // Updating here would overwrite the correct oracle-determined fee with the LBP's currentFee
      // which may be stale if oracle has paused or adjusted the fee

      // Update totals if fetched
      if (totalEthRaised !== null) {
        setTotalEthRaised(totalEthRaised);
      }
      if (totalTokensAllocated !== null) {
        setTotalTokensAllocated(totalTokensAllocated);
      }

      // Calculate current spot price (ETH per token)
      // Formula from contract: pricePerToken = (reserveETH * weightToken * SCALE) / (reserveToken * weightETH)
      // This matches the formula used in SecureLBP.rebalanceTo5050()
      let price = 0;
      if (reserveETH > 0n && reserveToken > 0n && tokenWeight > 0n && ethWeight > 0n) {
        try {
          // Try to get price using quoteETHForToken(1e18) for accuracy (includes pool fee)
          // quoteETHForToken returns tokens out for 1 ETH in, so we invert to get ETH per token
          const oneETH = ethers.parseEther("1");
          const tokensForOneETH = await ammContract.quoteETHForToken(oneETH).catch(() => null);
          
          if (tokensForOneETH !== null && tokensForOneETH > 0n) {
            // Convert to ETH per token: if 1 ETH gives X tokens, then 1 token = 1/X ETH
            const tokensForOneETHNum = Number(
              ethers.formatUnits(tokensForOneETH, tokenInfoRef.current?.decimals || 18)
            );
            if (tokensForOneETHNum > 0) {
              price = 1 / tokensForOneETHNum;
            }
          } else {
            // Fallback to manual calculation using reserves and weights
            // Formula: price = (reserveETH * weightToken) / (reserveToken * weightETH)
            const SCALE = 1e18;
            const reserveETHNum = Number(ethers.formatEther(reserveETH));
            const reserveTokenNum = Number(
              ethers.formatUnits(reserveToken, tokenInfoRef.current?.decimals || 18)
            );
            const tokenWeightNum = Number(ethers.formatEther(tokenWeight));
            const ethWeightNum = Number(ethers.formatEther(ethWeight));

            if (reserveTokenNum > 0 && ethWeightNum > 0 && tokenWeightNum > 0) {
              // pricePerToken = (reserveETH * weightToken) / (reserveToken * weightETH)
              // This matches SecureLBP.rebalanceTo5050() calculation
              price = (reserveETHNum * tokenWeightNum) / (reserveTokenNum * ethWeightNum);
            }
          }
        } catch (priceErr) {
          console.warn("Could not calculate spot price:", priceErr);
          // Fallback to simple ratio if calculation fails
          const reserveETHNum = Number(ethers.formatEther(reserveETH));
          const reserveTokenNum = Number(
            ethers.formatUnits(reserveToken, tokenInfoRef.current?.decimals || 18)
          );
          price = reserveTokenNum > 0 ? reserveETHNum / reserveTokenNum : 0;
        }
      }

      setSpotPrice(price);

      // Update poolData for compatibility
      const poolDataObj = {
        address: poolAddressRef.current,
        reserveToken,
        reserveETH,
        tokenWeight,
        ethWeight,
        price,
        lastUpdate: Date.now(),
        blockchainTime: now,
      };
      setPoolData(poolDataObj);

      // Chart data is now reconstructed deterministically using useMemo
      // No need to update chartData here - it will be recalculated automatically
    } catch (err) {
      console.error("Error fetching pool data:", err);
    } finally {
      // Always release the fetching guard
      isFetchingRef.current = false;
    }
  }, [advanceBlockchainTime, weights.token]);

  /**
   * Fetch swap events from the pool contract for chart reconstruction
   */
  const fetchSwapEvents = useCallback(async () => {
    if (!poolAddressRef.current) {
      setSwapEvents([]);
      return;
    }

    try {
      const provider = ensureProvider();
      if (!provider) return;

      const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
        ? allAbis.LBPWeightedAMM
        : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;

      const ammContract = new Contract(poolAddressRef.current, ammAbi, provider);

      // Fetch both swap event types
      const [swapETHForTokenEvents, swapTokenForETHEvents] = await Promise.all([
        safeQueryEvents(ammContract, ammContract.filters.SwapETHForToken?.(), -1000),
        safeQueryEvents(ammContract, ammContract.filters.SwapTokenForETH?.(), -1000),
      ]);

      // Get unique block numbers to fetch timestamps efficiently
      const blockNumbers = new Set();
      [...swapETHForTokenEvents, ...swapTokenForETHEvents].forEach((event) => {
        if (event.blockNumber) {
          blockNumbers.add(event.blockNumber);
        }
      });

      // Fetch block timestamps in batch
      const blockTimestamps = new Map();
      await Promise.all(
        Array.from(blockNumbers).map(async (blockNumber) => {
          try {
            const block = await provider.getBlock(blockNumber);
            if (block?.timestamp) {
              blockTimestamps.set(blockNumber, Number(block.timestamp));
            }
          } catch (err) {
            console.warn(`Could not fetch block ${blockNumber}:`, err);
          }
        })
      );

      // Process events and extract relevant data
      const processedEvents = [
        ...swapETHForTokenEvents.map((event) => ({
          eventName: "SwapETHForToken",
          timestamp: event.blockNumber ? blockTimestamps.get(event.blockNumber) || 0 : 0,
          blockTimestamp: event.blockNumber ? blockTimestamps.get(event.blockNumber) || 0 : 0,
          args: event.args,
          ethIn: event.args?.[1] || 0n,
          tokenOut: event.args?.[2] || 0n,
        })),
        ...swapTokenForETHEvents.map((event) => ({
          eventName: "SwapTokenForETH",
          timestamp: event.blockNumber ? blockTimestamps.get(event.blockNumber) || 0 : 0,
          blockTimestamp: event.blockNumber ? blockTimestamps.get(event.blockNumber) || 0 : 0,
          args: event.args,
          tokenIn: event.args?.[1] || 0n,
          ethOut: event.args?.[2] || 0n,
        })),
      ].filter((event) => event.timestamp > 0); // Filter out events without valid timestamps

      // Always set a new array reference to trigger React re-renders
      // Sort events by timestamp to ensure consistent ordering
      const sortedProcessedEvents = [...processedEvents].sort((a, b) => {
        const timeA = a.timestamp || a.blockTimestamp || 0;
        const timeB = b.timestamp || b.blockTimestamp || 0;
        return timeA - timeB;
      });
      
      // Force a new array reference to ensure React detects the change
      setSwapEvents([...sortedProcessedEvents]);
    } catch (err) {
      console.warn("Error fetching swap events:", err);
      setSwapEvents([]);
    }
  }, []);

  /**
   * Fetch all LBP contract data (called less frequently)
   * This fetches static and semi-static values
   * @param {boolean} force - If true, bypass isFetchingRef guard
   */
  const fetchLBPData = useCallback(async (force = false) => {
    if (!lbpAddress) return;
    if (!force && isFetchingRef.current) return;

    const provider = ensureProvider();
    if (!provider) {
      setError("No wallet provider available");
      setLoading(false);
      return;
    }

    isFetchingRef.current = true;
    providerRef.current = provider;

    try {
      const lbpAbi = Array.isArray(allAbis.SecureLBP)
        ? allAbis.SecureLBP
        : allAbis.SecureLBP?.abi || allAbis.SecureLBP;

      const lbpContract = new Contract(lbpAddress, lbpAbi, provider);
      lbpContractRef.current = lbpContract;
      lbpAddressRef.current = lbpAddress; // Store address for fetchPoolDataOnly

      // Fetch all LBP state in parallel
      const [
        token,
        startTime,
        endTime,
        treasury,
        poolInitialized,
        finalized,
        totalEthRaised,
        totalTokensAllocated,
        feesAccumulated,
        poolAddress,
        auction,
        presaleManager,
        vestingEscrow,
        oracle,
        paused,
        maxContributionPerAddress,
        poolStartWeightToken,
        poolEndWeightToken,
        currentFee,
      ] = await Promise.all([
        lbpContract.token().catch(() => ethers.ZeroAddress),
        lbpContract.startTime().catch(() => 0n),
        lbpContract.endTime().catch(() => 0n),
        lbpContract.treasury().catch(() => ethers.ZeroAddress),
        lbpContract.poolInitialized().catch(() => false),
        lbpContract.finalized().catch(() => false),
        lbpContract.totalEthRaised().catch(() => 0n),
        lbpContract.totalTokensAllocated().catch(() => 0n),
        lbpContract.feesAccumulated().catch(() => 0n),
        lbpContract.pool().catch(() => ethers.ZeroAddress),
        lbpContract.auction().catch(() => ethers.ZeroAddress),
        lbpContract.presaleManager().catch(() => ethers.ZeroAddress),
        lbpContract.vestingEscrow().catch(() => ethers.ZeroAddress),
        lbpContract.oracle().catch(() => ethers.ZeroAddress),
        lbpContract.paused().catch(() => false),
        lbpContract.maxContributionPerAddress().catch(() => 0n),
        lbpContract.poolStartWeightToken().catch(() => 0n),
        lbpContract.poolEndWeightToken().catch(() => 0n),
        lbpContract.currentFeeBP().catch(() => 0n), // Time-dependent!
      ]);
      
      // Fetch volatility and post-pause decay data separately (may not exist in older contracts)
      let volatilityFeeBP = 0n;
      let baseFeeBP = 0n;
      let postPauseDecayFeeBP = 0n;
      let volatilityCheckpoint = [0n, 0n];
      let priceChangeBP = 0n;
      let postPauseDecayDebug = null;
      
      try {
        [volatilityFeeBP, baseFeeBP, postPauseDecayFeeBP, volatilityCheckpoint, priceChangeBP] = await Promise.all([
          lbpContract.volatilityFeeBP().catch(() => 0n),
          lbpContract.baseFeeBP().catch(() => 0n),
          lbpContract.postPauseDecayFeeBP().catch(() => 0n),
          lbpContract.getVolatilityCheckpoint().catch(() => [0n, 0n]),
          lbpContract.getCurrentPriceChangeBP().catch(() => 0n),
        ]);
        
        // Fetch debug info for post-pause decay
        try {
          postPauseDecayDebug = await lbpContract.getPostPauseDecayDebug().catch(() => null);
          // Post-pause decay debug data available
        } catch (err) {
          // Debug function may not exist in older contracts
        }
      } catch (err) {
        // Volatility/post-pause functions may not exist in older contracts - ignore
        console.warn("Could not fetch volatility/post-pause data (contract may not support it):", err);
      }

      // Update totals (fee will be updated after oracle check)
      setTotalEthRaised(totalEthRaised);
      setTotalTokensAllocated(totalTokensAllocated);

      // Get token info
      let tokenInfo = null;
      try {
        const tokenAbi = [
          {
            constant: true,
            inputs: [],
            name: "symbol",
            outputs: [{ name: "", type: "string" }],
            type: "function",
          },
          {
            constant: true,
            inputs: [],
            name: "decimals",
            outputs: [{ name: "", type: "uint8" }],
            type: "function",
          },
        ];
        const tokenContract = new Contract(token, tokenAbi, provider);
        const [symbol, decimals] = await Promise.all([
          tokenContract.symbol().catch(() => "UNKNOWN"),
          tokenContract.decimals().catch(() => 18),
        ]);
        tokenInfo = { address: token, symbol, decimals };
        tokenInfoRef.current = tokenInfo;
      } catch (tokenErr) {
        console.warn("Could not fetch token info:", tokenErr);
      }

      // Check oracle pause status and get adaptive fee from oracle
      // SINGLE SOURCE OF TRUTH: Only use on-chain state, no simulation
      let oraclePaused = false;
      let oraclePausedUntil = null;
      let oracleFeeBP = null;
      let maxFeeBP = null;
      
      if (oracle !== ethers.ZeroAddress && poolAddress !== ethers.ZeroAddress) {
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
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "viewAdaptiveFee",
              outputs: [{ name: "", type: "uint256" }],
              type: "function",
            },
            {
              constant: true,
              inputs: [],
              name: "maxFeeBP",
              outputs: [{ name: "", type: "uint256" }],
              type: "function",
            },
            {
              constant: true,
              inputs: [],
              name: "pauseDuration",
              outputs: [{ name: "", type: "uint256" }],
              type: "function",
            },
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "lastComputedFeeBP",
              outputs: [{ name: "", type: "uint256" }],
              type: "function",
            },
            {
              constant: true,
              inputs: [{ name: "lbpPool", type: "address" }],
              name: "simulateComputeAdaptiveFee",
              outputs: [
                { name: "wouldPause", type: "bool" },
                { name: "wouldSetFeeBP", type: "uint256" },
                { name: "wouldSetPausedUntil", type: "uint256" },
              ],
              type: "function",
            },
          ];
          const oracleContract = new Contract(oracle, oracleAbi, provider);
          
          // Get blockchain timestamp (canonical time source)
          const currentBlock = await provider.getBlock("latest").catch(() => null);
          const currentBlockTimestamp = currentBlock ? BigInt(currentBlock.timestamp) : BigInt(Math.floor(Date.now() / 1000));
          
          // Get maxFeeBP first to check if lastComputedFeeBP indicates pause
          maxFeeBP = await oracleContract.maxFeeBP().catch(() => null);
          
          // Step 1: Check pause status from contract (ONLY on-chain state)
          //  Check pausedUntilForPool, isPaused(), AND lastComputedFeeBP
          // If lastComputedFeeBP === maxFeeBP, it means anomaly was detected and pause should be active
          const pausedUntilBigInt = await oracleContract.pausedUntilForPool(poolAddress).catch(() => 0n);
          const isPausedFromContract = await oracleContract.isPaused(poolAddress).catch(() => false);
          const lastComputedFeeBP = await oracleContract.lastComputedFeeBP(poolAddress).catch(() => null);
          
          //  If lastComputedFeeBP === maxFeeBP, it means anomaly was detected
          // This is a strong indicator that pause should be active, even if pausedUntil is 0
          const feeIndicatesPause = maxFeeBP !== null && lastComputedFeeBP !== null && lastComputedFeeBP === maxFeeBP;
          
          //  Use simulateComputeAdaptiveFee() to predict if pause would be active
          // This is necessary because computeAdaptiveFee() is only called during transactions,
          // so the state may not be updated until the next transaction
          let simulatedPause = false;
          let simulatedFeeBP = null;
          let simulatedPausedUntil = null;
          try {
            const simulation = await oracleContract.simulateComputeAdaptiveFee(poolAddress).catch(() => null);
            if (simulation) {
              simulatedPause = simulation.wouldPause === true;
              simulatedFeeBP = simulation.wouldSetFeeBP;
              simulatedPausedUntil = simulation.wouldSetPausedUntil > 0n ? Number(simulation.wouldSetPausedUntil) : null;
            }
          } catch (simErr) {
            console.warn("[useRealtimeLbpData] Failed to simulate computeAdaptiveFee:", simErr);
          }
          
          
          // Step 2: Determine if pause is active using blockchain timestamp
          // If isPaused() returns true OR pausedUntil is in the future OR lastComputedFeeBP === maxFeeBP OR simulation indicates pause, pause is active
          //  lastComputedFeeBP === maxFeeBP is a strong indicator that anomaly was detected
          //  simulatedPause indicates that computeAdaptiveFee() would trigger a pause if called now
          if (isPausedFromContract || (pausedUntilBigInt > 0n && currentBlockTimestamp < pausedUntilBigInt) || feeIndicatesPause || simulatedPause) {
            // Pause is active
            oraclePaused = true;
            
            // If pausedUntil is set and valid, use it
            if (pausedUntilBigInt > 0n && currentBlockTimestamp < pausedUntilBigInt) {
              const pausedUntilNum = Number(pausedUntilBigInt);
              
              //  Only update ref if on-chain value changed or ref is null
              // This ensures timer counts down smoothly without jumping
              if (oraclePausedUntilRef.current === null || oraclePausedUntilRef.current !== pausedUntilNum) {
                oraclePausedUntilRef.current = pausedUntilNum;
              }
              oraclePausedUntil = oraclePausedUntilRef.current;
            } else if ((isPausedFromContract || feeIndicatesPause || simulatedPause) && pausedUntilBigInt === 0n) {
              // isPaused() is true OR fee indicates pause OR simulation indicates pause, but pausedUntil is 0 - this means pause was just activated
              // Use simulatedPausedUntil if available, otherwise try to get pause duration from contract to estimate pause end time
              if (simulatedPausedUntil !== null && simulatedPausedUntil > 0) {
                // Use simulated pause end time
                oraclePausedUntilRef.current = simulatedPausedUntil;
                oraclePausedUntil = simulatedPausedUntil;
              } else if (oraclePausedUntilRef.current === null) {
                try {
                  const pauseDuration = await oracleContract.pauseDuration().catch(() => null);
                  if (pauseDuration !== null) {
                    // Calculate pause end time: current time + pause duration
                    const estimatedPauseEnd = Number(currentBlockTimestamp) + Number(pauseDuration);
                    oraclePausedUntilRef.current = estimatedPauseEnd;
                    oraclePausedUntil = estimatedPauseEnd;
                  } else {
                    // Fallback: use 5 minutes if we can't get pause duration
                    const estimatedPauseEnd = Number(currentBlockTimestamp) + 300;
                    oraclePausedUntilRef.current = estimatedPauseEnd;
                    oraclePausedUntil = estimatedPauseEnd;
                  }
                } catch (pauseDurationErr) {
                  // Fallback: use 5 minutes if we can't get pause duration
                  const estimatedPauseEnd = Number(currentBlockTimestamp) + 300;
                  oraclePausedUntilRef.current = estimatedPauseEnd;
                  oraclePausedUntil = estimatedPauseEnd;
                }
              } else {
                // Use stored value if available
                oraclePausedUntil = oraclePausedUntilRef.current;
              }
            } else if (oraclePausedUntilRef.current !== null) {
              // Use stored value if available
              oraclePausedUntil = oraclePausedUntilRef.current;
            }
          } else if (pausedUntilBigInt === 0n || currentBlockTimestamp >= pausedUntilBigInt) {
            // Pause is not active or has expired according to on-chain state
            // BUT: If lastComputedFeeBP === maxFeeBP, it means anomaly was detected
            // This can happen if computeAdaptiveFee() was called but pausedUntil wasn't set yet
            // OR if computeAdaptiveFee() hasn't been called yet but should be
            if (feeIndicatesPause || simulatedPause) {
              // lastComputedFeeBP === maxFeeBP OR simulation indicates pause means anomaly was detected
              // Treat as pause active even if pausedUntil is 0
              oraclePaused = true;
              // Use simulatedPausedUntil if available, otherwise try to get pause duration to estimate pause end time
              if (simulatedPausedUntil !== null && simulatedPausedUntil > 0) {
                // Use simulated pause end time
                oraclePausedUntilRef.current = simulatedPausedUntil;
                oraclePausedUntil = simulatedPausedUntil;
              } else if (oraclePausedUntilRef.current === null) {
                try {
                  const pauseDuration = await oracleContract.pauseDuration().catch(() => null);
                  if (pauseDuration !== null) {
                    const estimatedPauseEnd = Number(currentBlockTimestamp) + Number(pauseDuration);
                    oraclePausedUntilRef.current = estimatedPauseEnd;
                    oraclePausedUntil = estimatedPauseEnd;
                  } else {
                    const estimatedPauseEnd = Number(currentBlockTimestamp) + 300;
                    oraclePausedUntilRef.current = estimatedPauseEnd;
                    oraclePausedUntil = estimatedPauseEnd;
                  }
                } catch (pauseDurationErr) {
                  const estimatedPauseEnd = Number(currentBlockTimestamp) + 300;
                  oraclePausedUntilRef.current = estimatedPauseEnd;
                  oraclePausedUntil = estimatedPauseEnd;
                }
              } else {
                oraclePausedUntil = oraclePausedUntilRef.current;
              }
            } else {
              // No pause indicators - pause is not active
              oraclePaused = false;
              oraclePausedUntil = null;
              oraclePausedUntilRef.current = null;
            }
          }
          
          // Step 3: Get adaptive fee using SINGLE SOURCE OF TRUTH rule
          // Rule: If paused → maxFeeBP, else → viewAdaptiveFee()
          //  maxFeeBP was already fetched above, reuse it
          if (oraclePaused) {
            // Pause is active - ALWAYS use maxFeeBP
            // If simulation provided a fee, use it (it should be maxFeeBP)
            if (simulatedFeeBP !== null && simulatedFeeBP === maxFeeBP) {
              oracleFeeBP = simulatedFeeBP;
            } else if (maxFeeBP !== null) {
              oracleFeeBP = maxFeeBP;
            } else {
              // Fallback: fetch maxFeeBP if not already fetched
              maxFeeBP = await oracleContract.maxFeeBP().catch(() => null);
              if (maxFeeBP !== null) {
                oracleFeeBP = maxFeeBP;
              }
            }
          } else {
            // Pause is NOT active according to on-chain state
            // but if simulation indicates pause would be triggered, use simulated fee
            if (simulatedPause && simulatedFeeBP !== null) {
              // Simulation indicates pause would be triggered - use simulated fee (should be maxFeeBP)
              oracleFeeBP = simulatedFeeBP;
              // Also set oraclePaused to true based on simulation
              oraclePaused = true;
              if (simulatedPausedUntil !== null && simulatedPausedUntil > 0) {
                oraclePausedUntilRef.current = simulatedPausedUntil;
                oraclePausedUntil = simulatedPausedUntil;
              }
            } else {
              // No simulation pause - use viewAdaptiveFee() from contract
              oracleFeeBP = await oracleContract.viewAdaptiveFee(poolAddress).catch(() => null);
              
              //  If viewAdaptiveFee() returns maxFeeBP, it means pause is actually active
              // This can happen if computeAdaptiveFee() was called but pausedUntil wasn't set yet
              if (maxFeeBP !== null && oracleFeeBP !== null && oracleFeeBP === maxFeeBP) {
                oraclePaused = true;
                // Try to get pause duration to estimate pause end time
                if (oraclePausedUntilRef.current === null) {
                  try {
                    const pauseDuration = await oracleContract.pauseDuration().catch(() => null);
                    if (pauseDuration !== null) {
                      const estimatedPauseEnd = Number(currentBlockTimestamp) + Number(pauseDuration);
                      oraclePausedUntilRef.current = estimatedPauseEnd;
                      oraclePausedUntil = estimatedPauseEnd;
                    } else {
                      const estimatedPauseEnd = Number(currentBlockTimestamp) + 300;
                      oraclePausedUntilRef.current = estimatedPauseEnd;
                      oraclePausedUntil = estimatedPauseEnd;
                    }
                  } catch (pauseDurationErr) {
                    const estimatedPauseEnd = Number(currentBlockTimestamp) + 300;
                    oraclePausedUntilRef.current = estimatedPauseEnd;
                    oraclePausedUntil = estimatedPauseEnd;
                  }
                } else {
                  oraclePausedUntil = oraclePausedUntilRef.current;
                }
              }
            }
          }
          
        } catch (oracleErr) {
          console.warn("Could not check oracle pause status:", oracleErr);
        }
      }

      let displayFeeBP = null;
      if (oraclePaused && maxFeeBP !== null) {
        displayFeeBP = maxFeeBP;
      } else if (currentFee !== null && currentFee !== undefined) {
        displayFeeBP = currentFee;
      } else if (oracleFeeBP !== null && oracleFeeBP > 0n) {
        // Fallback to oracle fee if currentFee is unavailable
        displayFeeBP = oracleFeeBP;
      } else {
        // Final fallback
        displayFeeBP = null;
      }

      setAdaptiveFee((prevFee) => {
        if (displayFeeBP === null) {
          return prevFee;
        }

        const prevFeeBigInt = prevFee !== null ? BigInt(prevFee.toString()) : null;
        const displayFeeBPBigInt = BigInt(displayFeeBP.toString());

        if (prevFeeBigInt === null || prevFeeBigInt !== displayFeeBPBigInt) {
          return displayFeeBP;
        }
        return prevFee;
      });


      const startTimeNum = Number(startTime);
      const endTimeNum = Number(endTime);
      if (!chartDomainRef.current.startTime || chartDomainRef.current.startTime !== startTimeNum) {
        chartDomainRef.current = {
          startTime: startTimeNum,
          endTime: endTimeNum,
        };
      }

      // Store endTime in ref for checking if LBP has ended
      lbpEndTimeRef.current = endTimeNum;
      
      //  Store finalized status - if true, stop ALL future requests
      lbpFinalizedRef.current = finalized;

      // Parse volatility checkpoint data
      const volatilityCheckpointData = Array.isArray(volatilityCheckpoint) 
        ? { lastPrice: volatilityCheckpoint[0], lastTimestamp: volatilityCheckpoint[1] }
        : { lastPrice: 0n, lastTimestamp: 0n };
      
      // Store LBP data for compatibility
      const lbpDataObj = {
        address: lbpAddress,
        token,
        tokenInfo,
        startTime: startTimeNum,
        endTime: endTimeNum,
        treasury,
        poolInitialized,
        finalized,
        totalEthRaised,
        totalTokensAllocated,
        feesAccumulated,
        amm: poolAddress,
        auction,
        presaleManager,
        vestingEscrow,
        oracle,
        oraclePaused,
        oraclePausedUntil,
        paused,
        maxContributionPerAddress,
        initialTokenWeight: poolStartWeightToken,
        finalTokenWeight: poolEndWeightToken,
        currentFee: displayFeeBP, // Use displayFeeBP (single source of truth)
        // Volatility data
        volatilityFeeBP,
        baseFeeBP,
        postPauseDecayFeeBP,
        volatilityCheckpoint: volatilityCheckpointData,
        priceChangeBP,
        postPauseDecayDebug: postPauseDecayDebug ? {
          lastUnpauseTime: postPauseDecayDebug[0]?.toString() || "0",
          elapsedTime: postPauseDecayDebug[1]?.toString() || "0",
          postPauseDecayFeeBP: postPauseDecayDebug[2]?.toString() || "0",
          currentStep: postPauseDecayDebug[3]?.toString() || "0",
        } : null,
      };
      setLbpData(lbpDataObj);

      // Store pool address for continuous polling
      //  If finalized, keep poolData/reserves/weights to show final metrics
      if (poolInitialized && poolAddress !== ethers.ZeroAddress && tokenInfo) {
        poolAddressRef.current = poolAddress;
        
        // Fetch initial reserves when pool is first initialized
        // This should be the reserves right after pool initialization, before any swaps
        // If we don't have initial reserves yet, fetch current reserves as a baseline
        // They will be adjusted backwards through swap events if needed
        if (!initialReservesRef.current.eth || !initialReservesRef.current.token) {
          try {
            const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
              ? allAbis.LBPWeightedAMM
              : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;
            const ammContract = new Contract(poolAddress, ammAbi, provider);
            const [initialReserveToken, initialReserveETH] = await Promise.all([
              ammContract.reserveToken().catch(() => 0n),
              ammContract.reserveETH().catch(() => 0n),
            ]);
            
            // Only set if we got valid reserves
            if (initialReserveETH > 0n && initialReserveToken > 0n) {
              initialReservesRef.current = {
                token: initialReserveToken,
                eth: initialReserveETH,
              };
            }
          } catch (err) {
            console.warn("Could not fetch initial reserves:", err);
          }
        }
        
        // Fetch swap events for chart reconstruction
        await fetchSwapEvents();
        
        // Don't clear existing poolData/reserves/weights if finalized - we need them for display
      } else if (!poolInitialized) {
        // Only clear if pool is truly not initialized (not just finalized)
        poolAddressRef.current = null;
        initialReservesRef.current = { eth: null, token: null };
        setReserves({ token: null, eth: null });
        setWeights({ token: null, eth: null });
        setSpotPrice(null);
        setPoolData(null);
        setChartData([]);
        setSwapEvents([]);
      }

      // Fetch pool data if initialized
      // If finalized, fetch ONCE to get final metrics, then stop
      if (poolInitialized && poolAddress !== ethers.ZeroAddress && tokenInfo) {
        if (!finalized) {
          // Not finalized - normal continuous polling
          isFetchingRef.current = false;
          await fetchPoolDataOnly();
        } else {
          // Finalized - fetch pool data ONCE to get final metrics for display
          isFetchingRef.current = false;
          // Fetch final pool data one time (won't update again due to finalized check)
          await fetchPoolDataOnly();
        }
      }
    } catch (err) {
      console.error("Error fetching LBP data:", err);
      setError(err?.message || "Failed to load LBP data");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [lbpAddress, fetchPoolDataOnly, fetchSwapEvents]);

  /**
   * Manual refetch function
   * This is exported as refetchLbpData and should be called after purchases
   * @param {boolean} force - If true, bypass isFetchingRef guard to force immediate update
   */
  const refetch = useCallback(async (force = false) => {
    if (!lbpAddress) return;
    
    try {
      // Fetch LBP data first (includes pool data and oracle state)
      // Pass force flag to bypass guard if needed
      await fetchLBPData(force);
      // Always refetch swap events to capture new swaps immediately
      if (poolAddressRef.current) {
        // Refetch multiple times with delays to catch events that might be indexed with delay
        await fetchSwapEvents();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await fetchSwapEvents();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await fetchSwapEvents();
      }
    } catch (refetchErr) {
      console.warn("[useRealtimeLbpData] Error in refetch:", refetchErr);
    }
  }, [lbpAddress, fetchLBPData, fetchSwapEvents]);

  // Set up real-time polling - CRITICAL SECTION
  useEffect(() => {
    if (!lbpAddress) {
      // Reset all state
      setLbpData(null);
      setPoolData(null);
      setChartData([]);
      setLoading(false);
      setWeights({ token: null, eth: null });
      setSpotPrice(null);
      setReserves({ token: null, eth: null });
      setAdaptiveFee(null);
      setTotalTokensAllocated(null);
      setTotalEthRaised(null);
      poolAddressRef.current = null;
      tokenInfoRef.current = null;
      lbpAddressRef.current = null;
      lbpContractRef.current = null;
      lbpEndTimeRef.current = null;
      lbpFinalizedRef.current = false;
      return;
    }

    // Initial fetch
    fetchLBPData();

    // Set up block listener (preferred for real-time updates on mainnet)
    const provider = ensureProvider();
    if (provider && typeof provider.on === "function") {
      const handleBlock = async (blockNumber) => {
        // On each new block, fetch pool data (weights change with time!)
        // But only if LBP hasn't ended AND not finalized
        // NOTE: Block listener does NOT advance time - only interval polling does
        // This prevents double time advancement
        if (!isFetchingRef.current && poolAddressRef.current) {
          //  Stop if finalized
          if (lbpFinalizedRef.current) {
            provider.off("block", handleBlock);
            blockListenerRef.current = null;
            return;
          }

          // Check if LBP has ended
          try {
            const block = await provider.getBlock("latest");
            const currentTime = block?.timestamp ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
            if (lbpEndTimeRef.current !== null && currentTime >= lbpEndTimeRef.current) {
              // LBP has ended - remove block listener
              provider.off("block", handleBlock);
              blockListenerRef.current = null;
              return;
            }
          } catch (err) {
            // Continue if we can't check time
          }

          // Use a small delay to ensure block is fully processed
          // IMPORTANT: Don't advance time here - only fetch data
          setTimeout(() => {
            // Fetch pool data WITHOUT advancing time (time is advanced by interval only)
            fetchPoolDataOnlyWithoutTimeAdvance().catch((err) => {
              console.error("Error in block listener:", err);
            });
            // Also refetch swap events to capture new swaps immediately
            fetchSwapEvents().catch((err) => {
              console.warn("Error fetching swap events in block listener:", err);
            });
          }, 100);
        }
      };

      provider.on("block", handleBlock);
      blockListenerRef.current = { provider, handler: handleBlock };
    }

    // Set up periodic swap events refetch (every 30 seconds)
    // This ensures we capture new swaps for chart reconstruction
    swapEventsIntervalRef.current = setInterval(() => {
      if (poolAddressRef.current && !lbpFinalizedRef.current) {
        fetchSwapEvents().catch((err) => {
          console.warn("Error refetching swap events:", err);
        });
      }
    }, 30000); // Every 30 seconds

    // Set up aggressive interval polling (every 1 second)
    // This ensures weights and prices update continuously even without blocks
    // STOPS automatically when LBP ends OR finalized (checked inside fetchPoolDataOnly)
    const intervalId = setInterval(() => {
      if (!isFetchingRef.current) {
        //  Stop polling if finalized
        if (lbpFinalizedRef.current) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Also remove block listener
          if (blockListenerRef.current) {
            try {
              blockListenerRef.current.provider.off(
                "block",
                blockListenerRef.current.handler
              );
            } catch (err) {
              console.warn("Error removing block listener:", err);
            }
            blockListenerRef.current = null;
          }
          return;
        }

        // Check if LBP has ended before polling
        const currentTime = Math.floor(Date.now() / 1000);
        if (lbpEndTimeRef.current !== null && currentTime >= lbpEndTimeRef.current) {
          // LBP has ended - stop polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Also remove block listener
          if (blockListenerRef.current) {
            try {
              blockListenerRef.current.provider.off(
                "block",
                blockListenerRef.current.handler
              );
            } catch (err) {
              console.warn("Error removing block listener:", err);
            }
            blockListenerRef.current = null;
          }
          return;
        }

        if (poolAddressRef.current) {
          // Pool is initialized - fetch pool data frequently
          fetchPoolDataOnly().catch((err) => {
            console.error("Error in pool polling interval:", err);
          });
          // Also refetch swap events periodically to capture new swaps
          fetchSwapEvents().catch((err) => {
            console.warn("Error refetching swap events in interval:", err);
          });
        } else {
          // Pool not initialized - fetch LBP data less frequently
          // But only if not finalized
          if (!lbpFinalizedRef.current) {
            fetchLBPData().catch((err) => {
              console.error("Error in LBP polling interval:", err);
            });
          }
        }
      }
    }, POLL_INTERVAL_MS); // Poll every 1 second
    intervalRef.current = intervalId;

    // Cleanup function - CRITICAL to prevent memory leaks
    return () => {
      // Remove block listener
      if (blockListenerRef.current) {
        try {
          blockListenerRef.current.provider.off(
            "block",
            blockListenerRef.current.handler
          );
        } catch (err) {
          console.warn("Error removing block listener:", err);
        }
        blockListenerRef.current = null;
      }

      // Clear intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (swapEventsIntervalRef.current) {
        clearInterval(swapEventsIntervalRef.current);
        swapEventsIntervalRef.current = null;
      }

      // Reset guards
      isFetchingRef.current = false;
    };
  }, [lbpAddress, fetchLBPData, fetchPoolDataOnly, fetchSwapEvents, fetchPoolDataOnlyWithoutTimeAdvance]);

  // Reconstruct chart data deterministically
  const reconstructedChartData = useMemo(() => {
    if (!lbpData || !lbpData.startTime || !lbpData.endTime) {
      return [];
    }

    // Get current time from poolData or use system time
    // Ensure we use a time that's at least startTime and at most endTime
    let currentTime = poolData?.blockchainTime || Math.floor(Date.now() / 1000);
    // Clamp currentTime to be within [startTime, endTime]
    currentTime = Math.max(lbpData.startTime, Math.min(currentTime, lbpData.endTime));

    // Use initial reserves if available, otherwise use current reserves
    // If we have swap events, we can work backwards to estimate initial reserves
    let initialReserveETH = initialReservesRef.current.eth;
    let initialReserveToken = initialReservesRef.current.token;

    // If we don't have initial reserves but have current reserves and swap events,
    // we can estimate initial reserves by working backwards through swap events
    if ((!initialReserveETH || !initialReserveToken || initialReserveETH === 0n || initialReserveToken === 0n) 
        && reserves.eth && reserves.token && swapEvents.length > 0) {
      // Work backwards from current reserves through swap events
      let estimatedETH = reserves.eth;
      let estimatedToken = reserves.token;
      
      // Process events in reverse chronological order (newest first)
      const sortedEvents = [...swapEvents].sort((a, b) => {
        const timeA = a.timestamp || a.blockTimestamp || 0;
        const timeB = b.timestamp || b.blockTimestamp || 0;
        return timeB - timeA; // Reverse order
      });
      
      for (const event of sortedEvents) {
        if (event.eventName === "SwapETHForToken" || event.name === "SwapETHForToken") {
          // Reverse: subtract ETH that was added, add tokens that were removed
          estimatedETH -= event.ethIn || event.args?.[1] || 0n;
          estimatedToken += event.tokenOut || event.args?.[2] || 0n;
        } else if (event.eventName === "SwapTokenForETH" || event.name === "SwapTokenForETH") {
          // Reverse: subtract tokens that were added, add ETH that was removed
          estimatedToken -= event.tokenIn || event.args?.[1] || 0n;
          estimatedETH += event.ethOut || event.args?.[2] || 0n;
        }
      }
      
      // Only use estimated values if they're positive
      if (estimatedETH > 0n && estimatedToken > 0n) {
        initialReserveETH = estimatedETH;
        initialReserveToken = estimatedToken;
      } else {
        // Fallback to current reserves if estimation failed
        initialReserveETH = reserves.eth || 0n;
        initialReserveToken = reserves.token || 0n;
        console.warn(`[LBP] Could not estimate initial reserves, using current reserves`);
      }
    } else if (!initialReserveETH || !initialReserveToken || initialReserveETH === 0n || initialReserveToken === 0n) {
      // Fallback to current reserves if we can't estimate
      initialReserveETH = reserves.eth || 0n;
      initialReserveToken = reserves.token || 0n;
      if (initialReserveETH > 0n && initialReserveToken > 0n) {
      }
    }

    // If we still don't have reserves, we can't reconstruct properly
    if (!initialReserveETH || !initialReserveToken || initialReserveETH === 0n || initialReserveToken === 0n) {
      console.warn("[LBP Chart] Cannot reconstruct: missing initial reserves");
      return [];
    }

    
    const reconstructed = reconstructChartData({
      startTime: lbpData.startTime,
      endTime: lbpData.endTime,
      startWeightToken: lbpData.initialTokenWeight || 0n,
      endWeightToken: lbpData.finalTokenWeight || 0n,
      initialReserveETH,
      initialReserveToken,
      currentTime,
      swapEvents,
      tokenDecimals: lbpData.tokenInfo?.decimals || 18,
      points: 200,
    });
    
    return reconstructed;
  }, [
    lbpData,
    poolData?.blockchainTime,
    reserves.eth,
    reserves.token,
    swapEvents,
  ]);

  // Use reconstructed chart data if available, otherwise fall back to empty array
  const finalChartData = reconstructedChartData.length > 0 ? reconstructedChartData : chartData;

  // Return structured data
  return {
    // New structured API
    weights,
    spotPrice,
    reserves,
    adaptiveFee,
    totalTokensAllocated,
    totalEthRaised,
    chartData: finalChartData,
    // Legacy API for compatibility
    lbpData,
    poolData,
    priceChartData: finalChartData,
    // Status
    loading,
    error,
    refetch,
  };
};
