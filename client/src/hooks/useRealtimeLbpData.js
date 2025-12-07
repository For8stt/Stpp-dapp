import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { Contract, JsonRpcProvider } from "ethers";
import { ensureProvider } from "../services/web3/provider";
import allAbis from "../abi/allAbis.json";

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
  const intervalRef = useRef(null);
  const blockListenerRef = useRef(null);
  const providerRef = useRef(null);
  const lbpContractRef = useRef(null);
  const ammContractRef = useRef(null);

  // Refs to store contract addresses and info for continuous polling
  const poolAddressRef = useRef(null);
  const tokenInfoRef = useRef(null);
  const chartDomainRef = useRef({ startTime: null, endTime: null });
  const lbpAddressRef = useRef(null);
  const lbpEndTimeRef = useRef(null); // Store endTime to check if LBP has ended
  const lbpFinalizedRef = useRef(false); // Store finalized status to stop all requests

  /**
   * Advance blockchain time for local hardhat (CRITICAL for time-dependent values)
   * This ensures block.timestamp advances, which makes weights and fees update
   * Uses direct connection to Hardhat RPC (like DeveloperTimeControls) for reliability
   */
  const advanceBlockchainTime = useCallback(async (provider) => {
    const isLocal = 
      typeof window !== "undefined" && 
      (window.location.hostname === "localhost" || 
       window.location.hostname === "127.0.0.1");
    
    if (!isLocal) return;
    
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
    }
  }, []);

  /**
   * Fetch ONLY pool data (weights, reserves, price) - called frequently
   * This is the critical function that must run every second to see weight changes
   * STOPS updating when LBP has ended (currentTime >= endTime)
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

    // CRITICAL: Stop updating if LBP has ended
    if (lbpEndTimeRef.current !== null && now >= lbpEndTimeRef.current) {
      // LBP has ended - stop updating chart and weights
      console.log(`[LBP] LBP ended at ${lbpEndTimeRef.current}, stopping updates. Current time: ${now}`);
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

      // CRITICAL: Fetch time-dependent values using view functions
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
          console.log(`[LBP] Weight updated: Token=${(tokenWeightNum * 100).toFixed(2)}%, ETH=${(ethWeightNum * 100).toFixed(2)}%, Time=${now}`);
        }
      }

      // Update adaptive fee if fetched
      if (currentFee !== null) {
        setAdaptiveFee(currentFee);
      }

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

      // Only add new chart points if LBP hasn't ended
      // This prevents chart from updating after LBP ends
      if (lbpEndTimeRef.current === null || now < lbpEndTimeRef.current) {
        // ALWAYS add a new point to chart, even if price doesn't change
        // This creates progressive drawing effect
        setChartData((prev) => {
        // Use last price if current price is 0 or invalid
        const lastPrice = prev.length > 0 ? prev[prev.length - 1].price : (price > 0 ? price : 0);
        const chartPrice = price > 0 ? price : lastPrice;

        // Ensure unique timestamp - if same timestamp exists, add small increment
        let uniqueTimestamp = now;
        if (prev.length > 0) {
          const lastTimestamp = prev[prev.length - 1].timestamp;
          if (lastTimestamp >= now) {
            // If timestamp hasn't advanced (can happen with rapid updates),
            // add 1 second to ensure uniqueness
            uniqueTimestamp = lastTimestamp + 1;
          }
        }

        const newPoint = {
          timestamp: uniqueTimestamp,
          time: new Date(uniqueTimestamp * 1000).toLocaleTimeString(),
          timeFormatted: new Date(uniqueTimestamp * 1000).toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          }),
          price: chartPrice,
          timeElapsed: chartDomainRef.current.startTime ? uniqueTimestamp - chartDomainRef.current.startTime : 0,
        };

        // Check if a point with this timestamp already exists
        const existingIndex = prev.findIndex(p => p.timestamp === uniqueTimestamp);
        
        let updated;
        if (existingIndex >= 0) {
          // Update existing point instead of adding duplicate
          updated = [...prev];
          updated[existingIndex] = newPoint;
        } else {
          // Add new point
          updated = [...prev, newPoint];
        }

        // Keep only latest N points to prevent memory leaks
        // Also ensure no duplicate timestamps
        const deduplicated = updated.reduce((acc, point, index) => {
          const isDuplicate = acc.some(p => p.timestamp === point.timestamp);
          if (!isDuplicate) {
            acc.push(point);
          }
          return acc;
        }, []);

        return deduplicated.slice(-MAX_CHART_POINTS);
        });
      }
      // If LBP has ended, chartData won't be updated (already frozen)
    } catch (err) {
      console.error("Error fetching pool data:", err);
    } finally {
      // Always release the fetching guard
      isFetchingRef.current = false;
    }
  }, [advanceBlockchainTime]);

  /**
   * Fetch all LBP contract data (called less frequently)
   * This fetches static and semi-static values
   */
  const fetchLBPData = useCallback(async () => {
    if (!lbpAddress || isFetchingRef.current) return;

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

      // Update totals and fee
      setTotalEthRaised(totalEthRaised);
      setTotalTokensAllocated(totalTokensAllocated);
      setAdaptiveFee(currentFee);

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

      // Check oracle pause status
      let oraclePaused = false;
      if (oracle !== ethers.ZeroAddress) {
        try {
          const oracleAbi = [
            {
              constant: true,
              inputs: [],
              name: "isPaused",
              outputs: [{ name: "", type: "bool" }],
              type: "function",
            },
          ];
          const oracleContract = new Contract(oracle, oracleAbi, provider);
          oraclePaused = await oracleContract.isPaused();
        } catch (oracleErr) {
          console.warn("Could not check oracle pause status:", oracleErr);
        }
      }

      // Update chart domain
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
      
      // CRITICAL: Store finalized status - if true, stop ALL future requests
      lbpFinalizedRef.current = finalized;

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
        paused,
        maxContributionPerAddress,
        initialTokenWeight: poolStartWeightToken,
        finalTokenWeight: poolEndWeightToken,
        currentFee,
      };
      setLbpData(lbpDataObj);

      // Store pool address for continuous polling
      // CRITICAL: If finalized, keep poolData/reserves/weights to show final metrics
      if (poolInitialized && poolAddress !== ethers.ZeroAddress && tokenInfo) {
        poolAddressRef.current = poolAddress;
        // Don't clear existing poolData/reserves/weights if finalized - we need them for display
      } else if (!poolInitialized) {
        // Only clear if pool is truly not initialized (not just finalized)
        poolAddressRef.current = null;
        setReserves({ token: null, eth: null });
        setWeights({ token: null, eth: null });
        setSpotPrice(null);
        setPoolData(null);
        setChartData([]);
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
          console.log("[LBP] LBP is finalized - fetching final pool metrics once");
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
  }, [lbpAddress, fetchPoolDataOnly]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    if (!lbpAddress) return;
    await fetchLBPData();
  }, [lbpAddress, fetchLBPData]);

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
        if (!isFetchingRef.current && poolAddressRef.current) {
          // CRITICAL: Stop if finalized
          if (lbpFinalizedRef.current) {
            provider.off("block", handleBlock);
            blockListenerRef.current = null;
            console.log("[LBP] Block listener removed - LBP finalized");
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
          setTimeout(() => {
            fetchPoolDataOnly().catch((err) => {
              console.error("Error in block listener:", err);
            });
          }, 100);
        }
      };

      provider.on("block", handleBlock);
      blockListenerRef.current = { provider, handler: handleBlock };
    }

    // CRITICAL: Set up aggressive interval polling (every 1 second)
    // This ensures weights and prices update continuously even without blocks
    // STOPS automatically when LBP ends OR finalized (checked inside fetchPoolDataOnly)
    const intervalId = setInterval(() => {
      if (!isFetchingRef.current) {
        // CRITICAL: Stop polling if finalized
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
          console.log("[LBP] Polling stopped - LBP is finalized");
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
          console.log("[LBP] Polling stopped - LBP has ended");
          return;
        }

        if (poolAddressRef.current) {
          // Pool is initialized - fetch pool data frequently
          fetchPoolDataOnly().catch((err) => {
            console.error("Error in pool polling interval:", err);
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

      // Clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Reset guards
      isFetchingRef.current = false;
    };
  }, [lbpAddress, fetchLBPData, fetchPoolDataOnly]);

  // Return structured data
  return {
    // New structured API
    weights,
    spotPrice,
    reserves,
    adaptiveFee,
    totalTokensAllocated,
    totalEthRaised,
    chartData,
    // Legacy API for compatibility
    lbpData,
    poolData,
    priceChartData: chartData,
    // Status
    loading,
    error,
    refetch,
  };
};
