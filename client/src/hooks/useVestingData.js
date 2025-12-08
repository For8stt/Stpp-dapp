import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { Contract } from "ethers";
import { ensureProvider } from "../services/web3/provider";
import allAbis from "../abi/allAbis.json";

const REFRESH_RATE_MS = 2000; // 2 seconds
const BP_SCALE = 10000n;

/**
 * Custom hook for real-time vesting data updates
 * 
 * Fetches vesting information from:
 * - TokenVestingEscrow (claimed amounts, claimable)
 * - SecureLBP (vestedAmount, vesting config, allocation)
 * - ERC20 token (symbol, decimals)
 * 
 * @param {string} escrowAddress - The TokenVestingEscrow contract address
 * @param {string} userAddress - The user's wallet address (optional)
 * @param {string} overrideLBPAddress - Override LBP address from escrow (optional)
 * @returns {object} - Vesting data with real-time updates
 */
export const useVestingData = (escrowAddress, userAddress = null, overrideLBPAddress = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const blockListenerRef = useRef(null);
  const providerRef = useRef(null);
  const isFetchingRef = useRef(false);

  /**
   * Calculate vested amount based on vesting schedule
   * This mirrors SecureLBP's vestedAmount calculation
   */
  const calculateVestedAmount = useCallback((
    allocation,
    finalized,
    vestingConfigured,
    vestingStart,
    vestingCliffDuration,
    vestingFinalDuration,
    vestingCliffPercentBP,
    currentTime
  ) => {
    if (!finalized || !allocation || allocation === 0n) return 0n;
    if (!vestingConfigured) return allocation;

    const cliffTime = vestingStart + vestingCliffDuration;
    const finalTime = vestingStart + vestingFinalDuration;

    if (currentTime < cliffTime) {
      return 0n;
    }

    if (vestingFinalDuration === 0n || currentTime >= finalTime) {
      return allocation;
    }

    // During linear vesting period (between cliff and final)
    // Currently returns cliff percent only (as per VestingMath.lbpVestedAmount)
    // This matches the contract behavior
    return (allocation * vestingCliffPercentBP) / BP_SCALE;
  }, []);

  /**
   * Fetch all vesting data
   */
  const fetchVestingData = useCallback(async () => {
    if (!escrowAddress || isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      const provider = await ensureProvider();
      if (!provider) {
        throw new Error("Provider not available");
      }

      providerRef.current = provider;

      // Get escrow contract
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      if (escrowAbi.length === 0) {
        throw new Error("TokenVestingEscrow ABI not found");
      }

      const escrowContract = new Contract(escrowAddress, escrowAbi, provider);

      // Get escrow basic info
      const [tokenAddress, secureLBPAddressFromEscrow] = await Promise.all([
        escrowContract.token().catch(() => ethers.ZeroAddress),
        escrowContract.secureLBP().catch(() => ethers.ZeroAddress),
      ]);

      // Use override LBP address if provided, otherwise use the one from escrow
      const secureLBPAddress = overrideLBPAddress || secureLBPAddressFromEscrow;

        // Check what LBP address escrow is linked to
        const escrowLBPAddress = await escrowContract.secureLBP().catch(() => ethers.ZeroAddress);
        
        console.log("[Vesting] Escrow addresses:", {
          escrowAddress,
          tokenAddress,
          secureLBPAddressFromEscrow,
          escrowLBPAddress,
          overrideLBPAddress,
          secureLBPAddressUsed: secureLBPAddress,
          addressesMatch: escrowLBPAddress.toLowerCase() === secureLBPAddress.toLowerCase(),
        });

      if (tokenAddress === ethers.ZeroAddress) {
        throw new Error("Invalid escrow contract - token address is zero");
      }

      if (secureLBPAddress === ethers.ZeroAddress || !secureLBPAddress) {
        throw new Error("Invalid escrow contract - SecureLBP address is zero");
      }

      // Get SecureLBP contract
      const secureLBPAbi = allAbis.SecureLBP || [];
      const secureLBPContract = new Contract(secureLBPAddress, secureLBPAbi, provider);
      
      // Verify we can read from SecureLBP contract
      console.log("[Vesting] SecureLBP contract address:", secureLBPAddress);
      
      // Try to read finalized status directly
      try {
        const finalizedDirect = await secureLBPContract.finalized();
        console.log("[Vesting] Direct finalized() call result:", finalizedDirect);
      } catch (err) {
        console.error("[Vesting] Error calling finalized() directly:", err);
      }

      // Get token info
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
      const tokenContract = new Contract(tokenAddress, tokenAbi, provider);
      const [tokenSymbol, tokenDecimals] = await Promise.all([
        tokenContract.symbol().catch(() => "UNKNOWN"),
        tokenContract.decimals().catch(() => 18),
      ]);

      // Get current block timestamp
      const currentBlock = await provider.getBlock("latest");
      const currentTime = BigInt(currentBlock.timestamp);

      // Get vesting config from SecureLBP
      let finalized = false;
      let vestingConfigured = false;
      let vestingStart = 0n;
      let vestingCliffDuration = 0n;
      let vestingFinalDuration = 0n;
      let vestingCliffPercentBP = 0n;

      try {
        [
          finalized,
          vestingConfigured,
          vestingStart,
          vestingCliffDuration,
          vestingFinalDuration,
          vestingCliffPercentBP,
        ] = await Promise.all([
          secureLBPContract.finalized().then((result) => {
            console.log("[Vesting] finalized() returned:", result, "type:", typeof result, "isBoolean:", result === true || result === false);
            return result;
          }).catch((err) => {
            console.error("[Vesting] Error fetching finalized:", err);
            return false;
          }),
          secureLBPContract.vestingConfigured().catch((err) => {
            console.warn("[Vesting] Error fetching vestingConfigured:", err);
            return false;
          }),
          secureLBPContract.vestingStart().catch((err) => {
            console.warn("[Vesting] Error fetching vestingStart:", err);
            return 0n;
          }),
          secureLBPContract.vestingCliffDuration().catch((err) => {
            console.warn("[Vesting] Error fetching vestingCliffDuration:", err);
            return 0n;
          }),
          secureLBPContract.vestingFinalDuration().catch((err) => {
            console.warn("[Vesting] Error fetching vestingFinalDuration:", err);
            return 0n;
          }),
          secureLBPContract.vestingCliffPercentBP().catch((err) => {
            console.warn("[Vesting] Error fetching vestingCliffPercentBP:", err);
            return 0n;
          }),
        ]);
        
        console.log("[Vesting] Fetched vesting config:", {
          finalized,
          vestingConfigured,
          vestingStart: Number(vestingStart),
          vestingCliffDuration: Number(vestingCliffDuration),
          vestingFinalDuration: Number(vestingFinalDuration),
          vestingCliffPercentBP: Number(vestingCliffPercentBP),
        });
      } catch (err) {
        console.error("[Vesting] Error fetching vesting config:", err);
        // Re-throw to be caught by outer try-catch
        throw err;
      }

      // Get user-specific data if address provided
      let userAllocation = 0n;
      let userVested = 0n;
      let userClaimed = 0n;
      let userClaimable = 0n;

      if (userAddress && userAddress !== ethers.ZeroAddress) {
        // Allocation is stored in SecureLBP contract, not in escrow
        // Try allocations() first, then getUserAllocation() as fallback
        let allocationFromLBP = 0n;
        try {
          allocationFromLBP = await secureLBPContract.allocations(userAddress);
        } catch (err) {
          try {
            allocationFromLBP = await secureLBPContract.getUserAllocation(userAddress);
          } catch (err2) {
            console.warn("[Vesting] Could not read allocation from LBP:", err2);
          }
        }

        [userAllocation, userVested, userClaimed, userClaimable] = await Promise.all([
          Promise.resolve(allocationFromLBP),
          secureLBPContract.vestedAmount(userAddress).catch(() => 0n),
          escrowContract.claimed(userAddress).catch(() => 0n),
          escrowContract.claimable(userAddress).catch(() => 0n),
        ]);

        // Also check claimable calculation manually
        let manualClaimable = 0n;
        if (userVested > userClaimed) {
          manualClaimable = userVested - userClaimed;
        }

        console.log("[Vesting] User data:", {
          userAddress,
          userAllocation: userAllocation.toString(),
          userVested: userVested.toString(),
          userClaimed: userClaimed.toString(),
          userClaimableFromContract: userClaimable.toString(),
          manualClaimable: manualClaimable.toString(),
          difference: (userVested - userClaimed).toString(),
        });

        // If contract claimable is 0 but we have vested > claimed, use manual calculation
        if (userClaimable === 0n && manualClaimable > 0n) {
          console.warn("[Vesting] Contract claimable is 0, but manual calculation shows claimable:", manualClaimable.toString());
          userClaimable = manualClaimable;
        }
      }

      // Calculate vesting progress
      const vestingPercent = userAllocation > 0n
        ? Number((userVested * 10000n) / userAllocation) / 100
        : 0;

      // Calculate time remaining
      const cliffTime = vestingStart + vestingCliffDuration;
      const finalTime = vestingStart + vestingFinalDuration;
      const timeUntilCliff = cliffTime > currentTime ? Number(cliffTime - currentTime) : 0;
      const timeUntilFinal = finalTime > currentTime ? Number(finalTime - currentTime) : 0;

      setData({
        // Contract addresses
        escrowAddress,
        secureLBPAddress,
        tokenAddress,
        
        // Token info
        tokenSymbol,
        tokenDecimals,
        
        // Vesting config
        finalized,
        vestingConfigured,
        vestingStart: Number(vestingStart),
        vestingCliffDuration: Number(vestingCliffDuration),
        vestingFinalDuration: Number(vestingFinalDuration),
        vestingCliffPercentBP: Number(vestingCliffPercentBP),
        
        // User data
        userAllocation,
        userVested,
        userClaimed,
        userClaimable,
        vestingPercent,
        
        // Time calculations
        currentTime: Number(currentTime),
        cliffTime: Number(cliffTime),
        finalTime: Number(finalTime),
        timeUntilCliff,
        timeUntilFinal,
        
        // Contracts for direct access
        escrowContract,
        secureLBPContract,
        tokenContract,
      });

      setLoading(false);
      setError(null);
    } catch (err) {
      console.error("Error fetching vesting data:", err);
      setError(err.message || "Failed to fetch vesting data");
      setLoading(false);
    } finally {
      isFetchingRef.current = false;
    }
  }, [escrowAddress, userAddress, overrideLBPAddress]);

  useEffect(() => {
    if (!escrowAddress) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (blockListenerRef.current && providerRef.current?.off) {
        try {
          providerRef.current.off("block", blockListenerRef.current);
        } catch (err) {
          console.warn("Error removing block listener:", err);
        }
        blockListenerRef.current = null;
      }
    };

    cleanup();

    setLoading(true);
    setError(null);
    isFetchingRef.current = false;

    fetchVestingData();

    intervalRef.current = setInterval(() => {
      if (!isFetchingRef.current) {
        fetchVestingData();
      }
    }, REFRESH_RATE_MS);

    const setupBlockListener = async () => {
      try {
        const provider = await ensureProvider();
        if (provider && provider.on) {
          providerRef.current = provider;
          blockListenerRef.current = (blockNumber) => {
            if (!isFetchingRef.current) {
              fetchVestingData();
            }
          };
          provider.on("block", blockListenerRef.current);
        }
      } catch (err) {
        console.warn("Could not set up block listener:", err);
      }
    };

    setupBlockListener();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isFetchingRef.current) {
        fetchVestingData();
      }
    };

    const handleFocus = () => {
      if (!isFetchingRef.current) {
        fetchVestingData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      cleanup();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [escrowAddress, userAddress, overrideLBPAddress, fetchVestingData]);

  return {
    data,
    loading,
    error,
    refetch: fetchVestingData,
  };
};

