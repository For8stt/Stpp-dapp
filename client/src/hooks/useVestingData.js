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
 * @param {number} currentTime - Current timestamp in seconds from unified time layer (optional, falls back to block timestamp)
 * @returns {object} - Vesting data with real-time updates
 */
export const useVestingData = (escrowAddress, userAddress = null, overrideLBPAddress = null, currentTime = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const blockListenerRef = useRef(null);
  const providerRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchVestingData = useCallback(async () => {
    if (!escrowAddress || isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      const provider = ensureProvider();
      if (!provider) {
        throw new Error("Provider not available");
      }

      providerRef.current = provider;

      const escrowAbi = allAbis.TokenVestingEscrow || [];
      if (escrowAbi.length === 0) {
        throw new Error("TokenVestingEscrow ABI not found");
      }

      const escrowContract = new Contract(escrowAddress, escrowAbi, provider);

      const [tokenAddress, secureLBPAddressFromEscrow] = await Promise.all([
        escrowContract.token().catch(() => ethers.ZeroAddress),
        escrowContract.secureLBP().catch(() => ethers.ZeroAddress),
      ]);

      const secureLBPAddress = secureLBPAddressFromEscrow;
      const escrowLBPAddress = secureLBPAddressFromEscrow;

      if (tokenAddress === ethers.ZeroAddress) {
        throw new Error("Invalid escrow contract - token address is zero");
      }

      if (secureLBPAddress === ethers.ZeroAddress || !secureLBPAddress) {
        throw new Error("Invalid escrow contract - SecureLBP address is zero");
      }

      const secureLBPAbi = allAbis.SecureLBP || [];
      const secureLBPContract = new Contract(secureLBPAddress, secureLBPAbi, provider);
      let lbpVestingEscrow = ethers.ZeroAddress;
      let escrowMismatchWarning = null;
      try {
        lbpVestingEscrow = await secureLBPContract.vestingEscrow().catch(() => ethers.ZeroAddress);
        if (lbpVestingEscrow !== ethers.ZeroAddress && escrowAddress.toLowerCase() !== lbpVestingEscrow.toLowerCase()) {
          escrowMismatchWarning = {
            escrowAddressInURL: escrowAddress,
            vestingEscrowInLBP: lbpVestingEscrow,
            message: "The LBP is linked to a different vesting escrow than the one you're viewing. Tokens may have been sent to the wrong escrow.",
          };
        } else {
        }
      } catch (err) {
      }
      let overrideLBPContract = null;
      if (overrideLBPAddress && overrideLBPAddress.toLowerCase() !== secureLBPAddress.toLowerCase()) {
        try {
          overrideLBPContract = new Contract(overrideLBPAddress, secureLBPAbi, provider);
        } catch (err) {
        }
      }


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

      let timeToUse;
      if (currentTime !== null && currentTime !== undefined) {
        timeToUse = BigInt(currentTime);
      } else {
        const currentBlock = await provider.getBlock("latest");
        timeToUse = BigInt(currentBlock.timestamp);
      }
      const currentTimeBigInt = timeToUse;

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
          secureLBPContract.finalized().catch(() => false),
          secureLBPContract.vestingConfigured().catch((err) => {
            return false;
          }),
          secureLBPContract.vestingStart().catch((err) => {
            return 0n;
          }),
          secureLBPContract.vestingCliffDuration().catch((err) => {
            return 0n;
          }),
          secureLBPContract.vestingFinalDuration().catch((err) => {
            return 0n;
          }),
          secureLBPContract.vestingCliffPercentBP().catch((err) => {
            return 0n;
          }),
        ]);
        
      } catch (err) {
        throw err;
      }

      let userAllocation = 0n;
      let userVested = 0n;
      let userClaimed = 0n;
      let userClaimable = 0n;
      let userAllocationFromAuction = 0n;

      if (userAddress && userAddress !== ethers.ZeroAddress) {
        let allocationFromLBP = 0n;
        try {
          allocationFromLBP = await secureLBPContract.allocations(userAddress);
        } catch (err) {
          try {
            allocationFromLBP = await secureLBPContract.getUserAllocation(userAddress);
          } catch (err2) {
          }
        }
        let allocationFromAuction = 0n;
        try {
          const auctionAddress = await secureLBPContract.auction().catch(() => ethers.ZeroAddress);
          if (auctionAddress && auctionAddress !== ethers.ZeroAddress) {
            const auctionAbi = allAbis.DutchAuction || [];
            if (auctionAbi.length > 0) {
              const auctionContract = new Contract(auctionAddress, auctionAbi, provider);
              const auctionAllocation = await auctionContract.accountAllocations(userAddress).catch(() => null);
              if (auctionAllocation && auctionAllocation.totalQty) {
                allocationFromAuction = BigInt(auctionAllocation.totalQty.toString());
              }
            }
          }
        } catch (err) {
        }
        
        // Log allocation comparison

        const [userVestedFromEscrowLBP, userClaimedFromContract, userClaimableFromContract] = await Promise.all([
          secureLBPContract.vestedAmount(userAddress).catch((err) => {
            return 0n;
          }),
          escrowContract.claimed(userAddress).catch((err) => {
            return 0n;
          }),
          escrowContract.claimable(userAddress).catch((err) => {
            return 0n;
          }),
        ]);
        userClaimed = userClaimedFromContract;
        userClaimable = userVestedFromEscrowLBP > userClaimed ? userVestedFromEscrowLBP - userClaimed : 0n;
        let userVestedFromOverrideLBP = 0n;
        if (overrideLBPContract) {
          try {
            userVestedFromOverrideLBP = await overrideLBPContract.vestedAmount(userAddress).catch(() => 0n);
          } catch (err) {
          }
        }

        userVested = userVestedFromEscrowLBP;
        userAllocation = allocationFromLBP;
        userAllocationFromAuction = allocationFromAuction;
        // This is the correct value and should be used

        let manualClaimable = 0n;
        if (userVested > userClaimed) {
          manualClaimable = userVested - userClaimed;
        }
        const vestingStartBigInt = BigInt(vestingStart);
        const vestingCliffDurationBigInt = BigInt(vestingCliffDuration);
        const cliffTimeBigInt = vestingStartBigInt + vestingCliffDurationBigInt;
        const finalTimeBigInt = vestingStartBigInt + BigInt(vestingFinalDuration);
        const currentTimeBigInt = currentTime ? BigInt(currentTime) : BigInt(Math.floor(Date.now() / 1000));
        const timeUntilCliff = cliffTimeBigInt > currentTimeBigInt ? Number(cliffTimeBigInt - currentTimeBigInt) : 0;
        const isCliffPassed = currentTimeBigInt >= cliffTimeBigInt;
        const isFinalPassed = currentTimeBigInt >= finalTimeBigInt;
        const originalClaimableFromContract = userClaimableFromContract;
      }
      const vestingPercent = userAllocation > 0n
        ? Number((userVested * 10000n) / userAllocation) / 100
        : 0;

      const cliffTime = vestingStart + vestingCliffDuration;
      const finalTime = vestingStart + vestingFinalDuration;
      const timeUntilCliff = cliffTime > currentTimeBigInt ? Number(cliffTime - currentTimeBigInt) : 0;
      const timeUntilFinal = finalTime > currentTimeBigInt ? Number(finalTime - currentTimeBigInt) : 0;

      setData({
        escrowAddress,
        secureLBPAddress, // This is now always escrow's LBP address
        overrideLBPAddress, // Store override address for comparison
        lbpVestingEscrow: lbpVestingEscrow || null, // The vesting escrow address stored in LBP
        escrowMismatchWarning, // Warning if escrow addresses don't match
        tokenAddress,
        tokenSymbol,
        tokenDecimals,
        finalized,
        vestingConfigured,
        vestingStart: Number(vestingStart),
        vestingCliffDuration: Number(vestingCliffDuration),
        vestingFinalDuration: Number(vestingFinalDuration),
        vestingCliffPercentBP: Number(vestingCliffPercentBP),
        userAllocation,
        userAllocationFromAuction, // Allocation from auction (for debugging)
        userVested,
        userClaimed,
        userClaimable, // CRITICAL: Calculated as userVestedFromEscrowLBP - userClaimed (line 300)
        vestingPercent,
        currentTime: Number(currentTimeBigInt),
        cliffTime: Number(cliffTime),
        finalTime: Number(finalTime),
        timeUntilCliff,
        timeUntilFinal,
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
  }, [escrowAddress, userAddress, overrideLBPAddress, currentTime]);

  /**
   * Set up polling and block listeners
   */
  useEffect(() => {
    if (!escrowAddress) return;

    fetchVestingData();
    intervalRef.current = setInterval(() => {
      fetchVestingData();
    }, REFRESH_RATE_MS);

    const setupBlockListener = async () => {
      try {
        const provider = ensureProvider();
        if (provider && provider.on) {
          blockListenerRef.current = (blockNumber) => {
            fetchVestingData();
          };
          provider.on("block", blockListenerRef.current);
        }
      } catch (err) {
        console.warn("Could not set up block listener:", err);
      }
    };

    setupBlockListener();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (blockListenerRef.current && providerRef.current?.off) {
        providerRef.current.off("block", blockListenerRef.current);
      }
    };
  }, [escrowAddress, userAddress, fetchVestingData]);

  return {
    data,
    loading,
    error,
    refetch: fetchVestingData,
  };
};

