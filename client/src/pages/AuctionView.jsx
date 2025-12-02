/* eslint-env es2020 */
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ethers } from "ethers";
import { BrowserProvider, Contract } from "ethers";

import TxStatusIndicator from "../components/common/TxStatusIndicator";
import PriceDecayChart from "../components/presale/PriceDecayChart";
import loadContract from "../services/web3/loadContract";
import allAbis from "../abi/allAbis.json";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { ensureProvider } from "../services/web3/provider";
import { ensureSigner } from "../services/web3/signer";
import styles from "./css/AuctionView.module.css";

// ============ UTILITY FUNCTIONS ============

const toDate = (timestamp) => {
  if (!timestamp || timestamp === 0) return "—";
  return new Date(Number(timestamp) * 1000).toLocaleString();
};

const formatEth = (value) => {
  if (!value || value === 0n) return "0";
  try {
    return ethers.formatEther(value);
  } catch {
    return "0";
  }
};

const formatToken = (value, decimals = 18) => {
  if (!value || value === 0n) return "0";
  try {
    return ethers.formatUnits(value, decimals);
  } catch {
    return "0";
  }
};

const getPhase = (now, startTime, commitEndTime, revealEndTime, finalized) => {
  if (finalized) return "Finalized";
  if (now < startTime) return "NotStarted";
  if (now >= startTime && now <= commitEndTime) return "Commit";
  if (now > commitEndTime && now <= revealEndTime) return "Reveal";
  return "Finalized";
};

const getTimeUntil = (targetTime) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(targetTime) - now;
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};

// ============ MAIN COMPONENT ============

const AuctionView = () => {
  const { address } = useParams(); // PresaleManager address
  const [account, setAccount] = useState("");
  
  // Contract instances
  const [managerContract, setManagerContract] = useState(null);
  const [auctionContract, setAuctionContract] = useState(null);
  const [auctionAddress, setAuctionAddress] = useState("");
  
  // Auction state
  const [auctionData, setAuctionData] = useState(null);
  const [userData, setUserData] = useState(null);
  const [priceBuckets, setPriceBuckets] = useState([]);
  const [events, setEvents] = useState([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const initializingRef = useRef(false);
  
  // Forms
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
  
  // Transaction state
  const [txState, setTxState] = useState(null);
  
  // ============ DATA FETCHING ============
  
  const fetchAuctionData = useCallback(async () => {
    if (!auctionContract || !address) return;
    
    try {
      // Check if contract is initialized first
      let initialized = false;
      try {
        initialized = await auctionContract.initialized();
      } catch (e) {
        // If initialized() doesn't exist or fails, assume not initialized
        console.warn("Could not check initialization status:", e);
        return;
      }
      
      if (!initialized) {
        console.log("Auction contract not initialized yet");
        return;
      }
      
      // Helper to safely call contract methods
      const safeCall = async (method, defaultValue = null) => {
        try {
          return await method();
        } catch (e) {
          // Handle various error types including unrecognized-selector
          const errorMessage = e?.message || e?.toString() || "";
          const errorCode = e?.code || "";
          
          // Check for common contract call errors
          if (
            errorCode === "CALL_EXCEPTION" ||
            errorMessage.includes("missing revert data") ||
            errorMessage.includes("execution reverted") ||
            errorMessage.includes("revert") ||
            errorMessage.includes("unrecognized-selector") ||
            errorMessage.includes("Transaction reverted") ||
            errorMessage.includes("Transaction reverted without a reason")
          ) {
            // Silently return default value for expected contract errors
            return defaultValue;
          }
          // Re-throw unexpected errors
          throw e;
        }
      };
      
      const [
        startTime,
        commitEndTime,
        revealEndTime,
        tokensForSale,
        bonusReserve,
        bonusReserveRemaining,
        perAddressCap,
        softCap,
        treasury,
        saleTokenAddr,
        totalDepositCommitted,
        totalQtyRevealed,
        totalDepositsRevealed,
        finalized,
        successful,
        clearingPrice,
        clearingTickIndex,
        tokensSold,
        totalRaised,
        ethForTreasury,
        decayMultiplier,
        dynamicAdjustmentCount,
        thresholdLow,
        maxDecayMultiplier,
        priceTicksLength,
        lbpLaunched,
        lbpTokenRecipient,
        lbpStableRecipient,
      ] = await Promise.all([
        safeCall(() => auctionContract.startTime(), 0n),
        safeCall(() => auctionContract.commitEndTime(), 0n),
        safeCall(() => auctionContract.revealEndTime(), 0n),
        safeCall(() => auctionContract.tokensForSale(), 0n),
        safeCall(() => auctionContract.bonusReserve(), 0n),
        safeCall(() => auctionContract.bonusReserveRemaining(), 0n),
        safeCall(() => auctionContract.perAddressCap(), 0n),
        safeCall(() => auctionContract.softCap(), 0n),
        safeCall(() => auctionContract.treasury(), ethers.ZeroAddress),
        safeCall(() => auctionContract.saleToken(), ethers.ZeroAddress),
        safeCall(() => auctionContract.totalDepositCommitted(), 0n),
        safeCall(() => auctionContract.totalQtyRevealed(), 0n),
        safeCall(() => auctionContract.totalDepositsRevealed(), 0n),
        safeCall(() => auctionContract.finalized(), false),
        safeCall(() => auctionContract.successful(), false),
        safeCall(() => auctionContract.clearingPrice(), 0n),
        safeCall(() => auctionContract.clearingTickIndex(), 0n),
        safeCall(() => auctionContract.tokensSold(), 0n),
        safeCall(() => auctionContract.totalRaised(), 0n),
        safeCall(() => auctionContract.ethForTreasury(), 0n),
        safeCall(() => auctionContract.decayMultiplier(), 0n),
        safeCall(() => auctionContract.dynamicAdjustmentCount(), 0n),
        safeCall(() => auctionContract.thresholdLow(), 0n),
        safeCall(() => auctionContract.maxDecayMultiplier(), 0n),
        safeCall(() => auctionContract.priceTicksLength(), 0n),
        safeCall(() => auctionContract.lbpLaunched(), false),
        safeCall(() => auctionContract.lbpTokenRecipient ? auctionContract.lbpTokenRecipient() : Promise.resolve(ethers.ZeroAddress), ethers.ZeroAddress),
        safeCall(() => auctionContract.lbpStableRecipient ? auctionContract.lbpStableRecipient() : Promise.resolve(ethers.ZeroAddress), ethers.ZeroAddress),
      ]);
      
      // Fetch price ticks
      const ticks = [];
      const tickLength = Number(priceTicksLength);
      if (tickLength > 0) {
        for (let i = 0; i < tickLength; i++) {
          try {
            const tick = await safeCall(() => auctionContract.priceTicks(i), 0n);
            ticks.push(tick);
          } catch (e) {
            console.warn(`Failed to fetch price tick ${i}:`, e);
            break;
          }
        }
      }
      
      // Fetch price buckets
      const buckets = [];
      for (let i = 0; i < ticks.length; i++) {
        try {
          const total = await safeCall(() => auctionContract.priceBucketTotals(i), 0n);
          buckets.push({ index: i, price: ticks[i], total: total });
        } catch (e) {
          console.warn(`Failed to fetch price bucket ${i}:`, e);
        }
      }
      setPriceBuckets(buckets);
      
      // Get token symbol
      let tokenSymbol = "TOKEN";
      try {
        const tokenAbi = allAbis.TestToken || [];
        if (tokenAbi.length > 0) {
          const tokenContract = new Contract(saleTokenAddr, tokenAbi, await ensureProvider());
          tokenSymbol = await tokenContract.symbol().catch(() => "TOKEN");
        }
      } catch (e) {
        console.warn("Could not fetch token symbol:", e);
      }
      
      setAuctionData({
        startTime: Number(startTime),
        commitEndTime: Number(commitEndTime),
        revealEndTime: Number(revealEndTime),
        tokensForSale,
        bonusReserve,
        bonusReserveRemaining,
        perAddressCap,
        softCap,
        treasury,
        saleToken: saleTokenAddr,
        tokenSymbol,
        totalDepositCommitted,
        totalQtyRevealed,
        totalDepositsRevealed,
        finalized,
        successful,
        clearingPrice,
        clearingTickIndex: Number(clearingTickIndex),
        tokensSold,
        totalRaised,
        ethForTreasury,
        decayMultiplier,
        dynamicAdjustmentCount: Number(dynamicAdjustmentCount),
        thresholdLow,
        maxDecayMultiplier,
        demandCheckTime: 0, // demandCheckTime is in UpkeepController, not DutchAuction
        priceTicks: ticks,
        lbpLaunched,
        lbpTokenRecipient,
        lbpStableRecipient,
      });
      // Clear error if data loaded successfully
      if (error) {
        setError("");
      }
    } catch (err) {
      // Only set error if it's not a contract call error (contract not initialized or unrecognized selector)
      const errorMessage = err?.message || err?.toString() || "";
      const errorCode = err?.code || "";
      
      if (
        errorCode !== "CALL_EXCEPTION" && 
        !errorMessage.includes("missing revert data") &&
        !errorMessage.includes("unrecognized-selector") &&
        !errorMessage.includes("Transaction reverted")
      ) {
        console.error("Failed to fetch auction data:", err);
        setError(err?.message || "Failed to load auction data");
      } else {
        // Contract might not be initialized yet, don't show as error
        console.log("Auction contract not ready:", errorMessage);
      }
    }
  }, [auctionContract, address, error]);
  
  const fetchUserData = useCallback(async () => {
    if (!auctionContract || !account) return;
    
    try {
      // Helper to safely call contract methods
      const safeCall = async (method, defaultValue = null) => {
        try {
          return await method();
        } catch (e) {
          // Handle various error types
          const errorMessage = e?.message || e?.toString() || "";
          const errorCode = e?.code || "";
          
          // Check for common contract call errors
          if (
            errorCode === "CALL_EXCEPTION" ||
            errorMessage.includes("missing revert data") ||
            errorMessage.includes("execution reverted") ||
            errorMessage.includes("revert") ||
            errorMessage.includes("unrecognized-selector") ||
            errorMessage.includes("Transaction reverted")
          ) {
            return defaultValue;
          }
          // Re-throw unexpected errors
          throw e;
        }
      };
      
      const [
        committedQty,
        revealedQty,
        revealedDeposit,
        commitsCount,
        revealedBidsCount,
      ] = await Promise.all([
        safeCall(() => auctionContract.committedQty(account), 0n),
        safeCall(() => auctionContract.revealedQty(account), 0n),
        safeCall(() => auctionContract.revealedDeposit(account), 0n),
        // Use the count methods if available, otherwise default to 0
        safeCall(() => {
          // Check if commitsCount method exists
          if (typeof auctionContract.commitsCount === 'function') {
            return auctionContract.commitsCount(account);
          }
          return Promise.resolve(0n);
        }, 0n),
        safeCall(() => {
          // Check if revealedBidsCount method exists
          if (typeof auctionContract.revealedBidsCount === 'function') {
            return auctionContract.revealedBidsCount(account);
          }
          return Promise.resolve(0n);
        }, 0n),
      ]);
      
      // Get allocation if finalized
      let allocation = null;
      if (auctionData?.finalized) {
        try {
          const alloc = await safeCall(() => auctionContract.accountAllocations(account), null);
          if (alloc) {
            allocation = {
              totalQty: alloc.totalQty,
              bonusQty: alloc.bonusQty,
              paymentDue: alloc.paymentDue,
              computed: alloc.computed,
            };
          }
        } catch (e) {
          console.warn("Could not fetch allocation:", e);
        }
      }
      
      setUserData({
        committedQty,
        revealedQty,
        revealedDeposit,
        commitsCount: Number(commitsCount),
        revealedBidsCount: Number(revealedBidsCount),
        allocation,
      });
    } catch (err) {
      // Don't log errors for uninitialized contracts or unrecognized selectors
      const errorMessage = err?.message || err?.toString() || "";
      const errorCode = err?.code || "";
      
      if (
        errorCode !== "CALL_EXCEPTION" && 
        !errorMessage.includes("missing revert data") &&
        !errorMessage.includes("unrecognized-selector") &&
        !errorMessage.includes("Transaction reverted")
      ) {
        console.error("Failed to fetch user data:", err);
      }
    }
  }, [auctionContract, account, auctionData?.finalized]);
  
  const fetchEvents = useCallback(async () => {
    if (!auctionContract) return;
    
    try {
      const filter = auctionContract.filters;
      
      // Helper to safely query events
      const safeQuery = async (eventFilter, fromBlock = -1000) => {
        try {
          return await auctionContract.queryFilter(eventFilter, fromBlock);
        } catch (e) {
          console.warn("Failed to query events:", e);
          return [];
        }
      };
      
      const [commits, reveals, adjustments, finalizations, lbpLaunches] = await Promise.all([
        safeQuery(filter.CommitSubmitted ? filter.CommitSubmitted() : null),
        safeQuery(filter.BidRevealed ? filter.BidRevealed() : null),
        safeQuery(filter.DynamicAdjustment ? filter.DynamicAdjustment() : null),
        safeQuery(filter.AuctionFinalized ? filter.AuctionFinalized() : null),
        safeQuery(filter.LBPLaunched ? filter.LBPLaunched() : null),
      ]);
      
      const allEvents = [
        ...commits.map(e => ({ ...e, type: "CommitSubmitted", time: e.blockNumber || 0 })),
        ...reveals.map(e => ({ ...e, type: "BidRevealed", time: e.blockNumber || 0 })),
        ...adjustments.map(e => ({ ...e, type: "DynamicAdjustment", time: e.blockNumber || 0 })),
        ...finalizations.map(e => ({ ...e, type: "AuctionFinalized", time: e.blockNumber || 0 })),
        ...lbpLaunches.map(e => ({ ...e, type: "LBPLaunched", time: e.blockNumber || 0 })),
      ].sort((a, b) => b.time - a.time).slice(0, 20);
      
      setEvents(allEvents);
    } catch (err) {
      // Don't log errors for uninitialized contracts or unrecognized selectors
      const errorMessage = err?.message || err?.toString() || "";
      const errorCode = err?.code || "";
      
      if (
        errorCode !== "CALL_EXCEPTION" && 
        !errorMessage.includes("missing revert data") &&
        !errorMessage.includes("unrecognized-selector") &&
        !errorMessage.includes("Transaction reverted")
      ) {
        console.error("Failed to fetch events:", err);
      }
    }
  }, [auctionContract]);
  
  const initializeAuction = useCallback(async () => {
    if (!address) return;
    if (initializingRef.current) {
      console.log("Initialization already in progress, skipping...");
      return; // Prevent concurrent initializations
    }
    
    // Prevent re-initialization if already initialized with same address
    if (managerContract && auctionContract && auctionAddress) {
      const currentManagerAddress = managerContract.target || managerContract.address;
      if (currentManagerAddress?.toLowerCase() === address.toLowerCase()) {
        console.log("Already initialized with this address, skipping...");
        return;
      }
    }
    
    try {
      initializingRef.current = true;
      setLoading(true);
      setError("");
      
      // Get account
      if (window.ethereum) {
        try {
          const provider = new BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const addr = await signer.getAddress();
          setAccount(addr);
        } catch (e) {
          console.warn("Could not get account:", e);
          // Continue without account
        }
      }
      
      // Load manager contract with error handling
      // IMPORTANT: Always pass address as override to ensure we use the URL address, not addresses.json
      let manager;
      try {
        // Force use of address from URL by explicitly passing it as override
        manager = await loadContract("PresaleManager", address);
        
        // Verify the contract address matches - this is critical!
        const managerAddress = manager.target || manager.address;
        const normalizedExpected = address.toLowerCase();
        const normalizedActual = managerAddress?.toLowerCase();
        
        if (normalizedActual !== normalizedExpected) {
          console.error(`CRITICAL: Manager address mismatch! Expected ${address}, got ${managerAddress}`);
          // Try to create contract directly with the correct address
          const provider = await ensureProvider();
          const abi = allAbis.PresaleManager || [];
          if (abi.length > 0) {
            manager = new Contract(address, abi, provider);
            console.log(`Created contract directly with address ${address}`);
          } else {
            throw new Error(`ABI for PresaleManager not found`);
          }
        } else {
          console.log(`Manager contract loaded successfully at ${address}`);
        }
      } catch (e) {
        console.error("Failed to load PresaleManager contract:", e);
        // Try fallback: create contract directly
        try {
          const provider = await ensureProvider();
          const abi = allAbis.PresaleManager || [];
          if (abi.length > 0) {
            manager = new Contract(address, abi, provider);
            console.log(`Fallback: Created contract directly with address ${address}`);
          } else {
            throw new Error(`ABI for PresaleManager not found`);
          }
        } catch (fallbackError) {
          throw new Error(`Failed to load PresaleManager contract: ${e?.message || e}. Fallback also failed: ${fallbackError?.message || fallbackError}`);
        }
      }
      
      setManagerContract(manager);
      
      // Helper to safely call contract methods
      const safeCall = async (method, defaultValue = null, methodName = "unknown") => {
        try {
          // Verify manager contract address before calling (but allow if address is valid)
          const managerAddr = manager.target || manager.address;
          const expectedAddr = address.toLowerCase();
          const actualAddr = managerAddr?.toLowerCase();
          
          if (actualAddr && actualAddr !== expectedAddr) {
            console.warn(`Address mismatch in ${methodName}. Expected ${address}, got ${managerAddr}. Attempting call anyway...`);
            // Don't block - try the call anyway, it might work if the contract is a proxy
          }
          
          return await method();
        } catch (e) {
          // Handle various error types
          const errorMessage = e?.message || e?.toString() || "";
          const errorCode = e?.code || "";
          
          // Check for common contract call errors
          if (
            errorCode === "CALL_EXCEPTION" ||
            errorMessage.includes("missing revert data") ||
            errorMessage.includes("execution reverted") ||
            errorMessage.includes("revert") ||
            errorMessage.includes("unrecognized-selector") ||
            errorMessage.includes("Transaction reverted") ||
            errorMessage.includes("Transaction reverted without a reason")
          ) {
            // Silently return default for unrecognized-selector to reduce spam
            return defaultValue;
          }
          // Re-throw unexpected errors
          throw e;
        }
      };
      
      // First check if manager is initialized and has auctions
      console.log("Fetching manager config and auctions...");
      let managerConfig = null;
      try {
        managerConfig = await safeCall(() => manager.getManagerConfig(), null, "getManagerConfig");
        console.log("Manager config:", managerConfig);
      } catch (e) {
        const errorMessage = e?.message || e?.toString() || "";
        if (!errorMessage.includes("unrecognized-selector")) {
          console.warn("Could not get manager config:", e);
        }
      }
      
      // Check if there are any auctions before calling getLatestPresaleInfo
      let auctionsList = [];
      try {
        auctionsList = await safeCall(() => manager.getAllAuctions(), [], "getAllAuctions");
        console.log("Auctions list:", auctionsList);
      } catch (e) {
        const errorMessage = e?.message || e?.toString() || "";
        if (!errorMessage.includes("unrecognized-selector")) {
          console.warn("Could not get auctions list:", e);
        }
      }
      
      if (!auctionsList || auctionsList.length === 0) {
        console.error("No auctions found. Manager config:", managerConfig);
        throw new Error("No auctions found for this presale manager. Please create an auction first.");
      }
      
      console.log(`Found ${auctionsList.length} auction(s)`);
      
      // Get latest auction address - now safe to call since we know there are auctions
      let latest = null;
      try {
        // Use safeCall to handle unrecognized-selector errors
        latest = await safeCall(() => manager.getLatestPresaleInfo(), null, "getLatestPresaleInfo");
        
        // If getLatestPresaleInfo returns null or fails, try to get the last auction from the list
        if (!latest && auctionsList && auctionsList.length > 0) {
          const lastAuction = auctionsList[auctionsList.length - 1];
          // Try to get presale info for the last auction
          latest = await safeCall(() => manager.getPresaleInfo(lastAuction), null, "getPresaleInfo");
          if (!latest) {
            throw new Error("Could not retrieve auction information. The auction may not be initialized yet.");
          }
        } else if (!latest) {
          throw new Error("No auctions found for this presale manager.");
        }
      } catch (e) {
        const errorMessage = e?.message || e?.toString() || "";
        // If it's an unrecognized-selector error, try fallback
        if (errorMessage.includes("unrecognized-selector") && auctionsList && auctionsList.length > 0) {
          const lastAuction = auctionsList[auctionsList.length - 1];
          try {
            latest = await safeCall(() => manager.getPresaleInfo(lastAuction), null, "getPresaleInfo (fallback)");
            if (!latest) {
              throw new Error("Could not retrieve auction information using fallback method.");
            }
          } catch (e2) {
            throw new Error("Could not retrieve auction information. The auction may not be initialized yet.");
          }
        } else {
          throw e;
        }
      }
      
      // Extract auction address from the result
      // getLatestPresaleInfo returns: (owner, auction, lbp, vesting, ...)
      // getPresaleInfo returns: (owner, auction, lbp, vesting, ...)
      console.log("Latest presale info result:", latest);
      const auctionAddr = latest && Array.isArray(latest) && latest.length > 1 ? latest[1] : null;
      console.log("Extracted auction address:", auctionAddr);
      
      if (!auctionAddr || auctionAddr === ethers.ZeroAddress || !ethers.isAddress(auctionAddr)) {
        console.error("Invalid auction address:", auctionAddr);
        throw new Error("Auction not initialized for this presale yet.");
      }
      
      console.log("Setting auction address:", auctionAddr);
      setAuctionAddress(auctionAddr);
      
      // Load auction contract
      const auctionAbi = allAbis.DutchAuction || [];
      if (auctionAbi.length === 0) {
        throw new Error("DutchAuction ABI not found in allAbis.json");
      }
      
      const provider = await ensureProvider();
      
      // Check if contract exists at address
      console.log("Checking if auction contract exists at:", auctionAddr);
      const code = await provider.getCode(auctionAddr);
      if (!code || code === "0x") {
        console.error("No code found at auction address:", auctionAddr);
        throw new Error("Auction contract not deployed at this address");
      }
      
      console.log("Creating auction contract instance...");
      const auction = new Contract(auctionAddr, auctionAbi, provider);
      setAuctionContract(auction);
      console.log("Auction contract created successfully");
      
      // Fetch data immediately using the local auction variable
      // Don't wait for state update since we have the contract instance
      try {
        console.log("Checking if auction is initialized...");
        // Check if initialized before fetching
        let initialized = false;
        try {
          initialized = await auction.initialized();
          console.log("Auction initialized status:", initialized);
        } catch (e) {
          // If initialized() call fails, contract might not be ready
          console.warn("Could not check initialization:", e);
          setLoading(false);
          return;
        }
        
        if (initialized) {
          console.log("Auction is initialized, fetching data...");
          // Use the local auction variable directly, not from state
          // Create a temporary fetch function that uses the local auction
          const fetchDataWithAuction = async () => {
            try {
              // Check if contract is initialized first
              let initialized = false;
              try {
                initialized = await auction.initialized();
              } catch (e) {
                console.warn("Could not check initialization status:", e);
                return;
              }
              
              if (!initialized) {
                console.log("Auction contract not initialized yet");
                return;
              }
              
              // Helper to safely call contract methods
              const safeCall = async (method, defaultValue = null) => {
                try {
                  return await method();
                } catch (e) {
                  const errorMessage = e?.message || e?.toString() || "";
                  const errorCode = e?.code || "";
                  
                  if (
                    errorCode === "CALL_EXCEPTION" ||
                    errorMessage.includes("missing revert data") ||
                    errorMessage.includes("execution reverted") ||
                    errorMessage.includes("revert") ||
                    errorMessage.includes("unrecognized-selector") ||
                    errorMessage.includes("Transaction reverted") ||
                    errorMessage.includes("Transaction reverted without a reason")
                  ) {
                    return defaultValue;
                  }
                  throw e;
                }
              };
              
              const [
                startTime,
                commitEndTime,
                revealEndTime,
                tokensForSale,
                bonusReserve,
                bonusReserveRemaining,
                perAddressCap,
                softCap,
                treasury,
                saleTokenAddr,
                totalDepositCommitted,
                totalQtyRevealed,
                totalDepositsRevealed,
                finalized,
                successful,
                clearingPrice,
                clearingTickIndex,
                tokensSold,
                totalRaised,
                ethForTreasury,
                decayMultiplier,
                dynamicAdjustmentCount,
                thresholdLow,
                maxDecayMultiplier,
                priceTicksLength,
                lbpLaunched,
                lbpTokenRecipient,
                lbpStableRecipient,
              ] = await Promise.all([
                safeCall(() => auction.startTime(), 0n),
                safeCall(() => auction.commitEndTime(), 0n),
                safeCall(() => auction.revealEndTime(), 0n),
                safeCall(() => auction.tokensForSale(), 0n),
                safeCall(() => auction.bonusReserve(), 0n),
                safeCall(() => auction.bonusReserveRemaining(), 0n),
                safeCall(() => auction.perAddressCap(), 0n),
                safeCall(() => auction.softCap(), 0n),
                safeCall(() => auction.treasury(), ethers.ZeroAddress),
                safeCall(() => auction.saleToken(), ethers.ZeroAddress),
                safeCall(() => auction.totalDepositCommitted(), 0n),
                safeCall(() => auction.totalQtyRevealed(), 0n),
                safeCall(() => auction.totalDepositsRevealed(), 0n),
                safeCall(() => auction.finalized(), false),
                safeCall(() => auction.successful(), false),
                safeCall(() => auction.clearingPrice(), 0n),
                safeCall(() => auction.clearingTickIndex(), 0n),
                safeCall(() => auction.tokensSold(), 0n),
                safeCall(() => auction.totalRaised(), 0n),
                safeCall(() => auction.ethForTreasury(), 0n),
                safeCall(() => auction.decayMultiplier(), 0n),
                safeCall(() => auction.dynamicAdjustmentCount(), 0n),
                safeCall(() => auction.thresholdLow(), 0n),
                safeCall(() => auction.maxDecayMultiplier(), 0n),
                safeCall(() => auction.priceTicksLength(), 0n),
                safeCall(() => auction.lbpLaunched(), false),
                safeCall(() => auction.lbpTokenRecipient ? auction.lbpTokenRecipient() : Promise.resolve(ethers.ZeroAddress), ethers.ZeroAddress),
                safeCall(() => auction.lbpStableRecipient ? auction.lbpStableRecipient() : Promise.resolve(ethers.ZeroAddress), ethers.ZeroAddress),
              ]);
              
              // Fetch price ticks
              const ticks = [];
              const tickLength = Number(priceTicksLength);
              if (tickLength > 0) {
                for (let i = 0; i < tickLength; i++) {
                  try {
                    const tick = await safeCall(() => auction.priceTicks(i), 0n);
                    ticks.push(tick);
                  } catch (e) {
                    console.warn(`Failed to fetch price tick ${i}:`, e);
                    break;
                  }
                }
              }
              
              // Fetch price buckets
              const buckets = [];
              for (let i = 0; i < ticks.length; i++) {
                try {
                  const total = await safeCall(() => auction.priceBucketTotals(i), 0n);
                  buckets.push({ index: i, price: ticks[i], total: total });
                } catch (e) {
                  console.warn(`Failed to fetch price bucket ${i}:`, e);
                }
              }
              setPriceBuckets(buckets);
              
              // Get token symbol
              let tokenSymbol = "TOKEN";
              try {
                const tokenAbi = allAbis.TestToken || [];
                if (tokenAbi.length > 0) {
                  const tokenContract = new Contract(saleTokenAddr, tokenAbi, await ensureProvider());
                  tokenSymbol = await tokenContract.symbol().catch(() => "TOKEN");
                }
              } catch (e) {
                console.warn("Could not fetch token symbol:", e);
              }
              
              setAuctionData({
                startTime: Number(startTime),
                commitEndTime: Number(commitEndTime),
                revealEndTime: Number(revealEndTime),
                tokensForSale,
                bonusReserve,
                bonusReserveRemaining,
                perAddressCap,
                softCap,
                treasury,
                saleToken: saleTokenAddr,
                tokenSymbol,
                totalDepositCommitted,
                totalQtyRevealed,
                totalDepositsRevealed,
                finalized,
                successful,
                clearingPrice,
                clearingTickIndex: Number(clearingTickIndex),
                tokensSold,
                totalRaised,
                ethForTreasury,
                decayMultiplier,
                dynamicAdjustmentCount: Number(dynamicAdjustmentCount),
                thresholdLow,
                maxDecayMultiplier,
                demandCheckTime: 0,
                priceTicks: ticks,
                lbpLaunched,
                lbpTokenRecipient,
                lbpStableRecipient,
              });
              console.log("Auction data fetched and set successfully");
            } catch (err) {
              const errorMessage = err?.message || err?.toString() || "";
              const errorCode = err?.code || "";
              
              if (
                errorCode !== "CALL_EXCEPTION" && 
                !errorMessage.includes("missing revert data") &&
                !errorMessage.includes("unrecognized-selector") &&
                !errorMessage.includes("Transaction reverted")
              ) {
                console.error("Failed to fetch auction data:", err);
                setError(err?.message || "Failed to load auction data");
              }
            }
          };
          
          await fetchDataWithAuction();
          console.log("Auction data fetched");
          
          if (account) {
            // Fetch user data using the local auction variable
            try {
              const safeCall = async (method, defaultValue = null) => {
                try {
                  return await method();
                } catch (e) {
                  const errorMessage = e?.message || e?.toString() || "";
                  const errorCode = e?.code || "";
                  
                  if (
                    errorCode === "CALL_EXCEPTION" ||
                    errorMessage.includes("missing revert data") ||
                    errorMessage.includes("execution reverted") ||
                    errorMessage.includes("revert") ||
                    errorMessage.includes("unrecognized-selector") ||
                    errorMessage.includes("Transaction reverted") ||
                    errorMessage.includes("Transaction reverted without a reason")
                  ) {
                    return defaultValue;
                  }
                  throw e;
                }
              };
              
              const [
                committedQty,
                revealedQty,
                revealedDeposit,
                commitsCount,
                revealedBidsCount,
              ] = await Promise.all([
                safeCall(() => auction.committedQty(account), 0n),
                safeCall(() => auction.revealedQty(account), 0n),
                safeCall(() => auction.revealedDeposit(account), 0n),
                safeCall(() => {
                  if (typeof auction.commitsCount === 'function') {
                    return auction.commitsCount(account);
                  }
                  return Promise.resolve(0n);
                }, 0n),
                safeCall(() => {
                  if (typeof auction.revealedBidsCount === 'function') {
                    return auction.revealedBidsCount(account);
                  }
                  return Promise.resolve(0n);
                }, 0n),
              ]);
              
              let allocation = null;
              const auctionDataTemp = {
                finalized: await safeCall(() => auction.finalized(), false),
              };
              
              if (auctionDataTemp.finalized) {
                try {
                  const alloc = await safeCall(() => auction.accountAllocations(account), null);
                  if (alloc) {
                    allocation = {
                      totalQty: alloc.totalQty,
                      bonusQty: alloc.bonusQty,
                      paymentDue: alloc.paymentDue,
                      computed: alloc.computed,
                    };
                  }
                } catch (e) {
                  console.warn("Could not fetch allocation:", e);
                }
              }
              
              setUserData({
                committedQty,
                revealedQty,
                revealedDeposit,
                commitsCount: Number(commitsCount),
                revealedBidsCount: Number(revealedBidsCount),
                allocation,
              });
              console.log("User data fetched");
            } catch (err) {
              const errorMessage = err?.message || err?.toString() || "";
              if (!errorMessage.includes("unrecognized-selector") && 
                  !errorMessage.includes("Transaction reverted")) {
                console.error("Failed to fetch user data:", err);
              }
            }
          }
          
          // Fetch events
          try {
            const filter = auction.filters;
            const safeQuery = async (eventFilter, fromBlock = -1000) => {
              try {
                return await auction.queryFilter(eventFilter, fromBlock);
              } catch (e) {
                console.warn("Failed to query events:", e);
                return [];
              }
            };
            
            const [commits, reveals, adjustments, finalizations, lbpLaunches] = await Promise.all([
              safeQuery(filter.CommitSubmitted ? filter.CommitSubmitted() : null),
              safeQuery(filter.BidRevealed ? filter.BidRevealed() : null),
              safeQuery(filter.DynamicAdjustment ? filter.DynamicAdjustment() : null),
              safeQuery(filter.AuctionFinalized ? filter.AuctionFinalized() : null),
              safeQuery(filter.LBPLaunched ? filter.LBPLaunched() : null),
            ]);
            
            const allEvents = [
              ...commits.map(e => ({ ...e, type: "CommitSubmitted", time: e.blockNumber || 0 })),
              ...reveals.map(e => ({ ...e, type: "BidRevealed", time: e.blockNumber || 0 })),
              ...adjustments.map(e => ({ ...e, type: "DynamicAdjustment", time: e.blockNumber || 0 })),
              ...finalizations.map(e => ({ ...e, type: "AuctionFinalized", time: e.blockNumber || 0 })),
              ...lbpLaunches.map(e => ({ ...e, type: "LBPLaunched", time: e.blockNumber || 0 })),
            ].sort((a, b) => b.time - a.time).slice(0, 20);
            
            setEvents(allEvents);
            console.log("Events fetched");
          } catch (err) {
            const errorMessage = err?.message || err?.toString() || "";
            if (!errorMessage.includes("unrecognized-selector") && 
                !errorMessage.includes("Transaction reverted")) {
              console.error("Failed to fetch events:", err);
            }
          }
        } else {
          console.warn("Auction contract is not initialized yet");
          setError("Auction contract is not initialized yet");
        }
      } catch (e) {
        console.error("Initial data fetch failed:", e);
        const errorMessage = e?.message || e?.toString() || "";
        const errorCode = e?.code || "";
        
        if (
          errorCode !== "CALL_EXCEPTION" && 
          !errorMessage.includes("missing revert data") &&
          !errorMessage.includes("unrecognized-selector") &&
          !errorMessage.includes("Transaction reverted")
        ) {
          setError(errorMessage || "Failed to load auction data");
        }
      } finally {
        setLoading(false);
        console.log("Initialization complete");
      }
    } catch (err) {
      console.error("initializeAuction error:", err);
      // Better error message handling
      let errorMessage = err?.message || "Unable to load auction";
      if (err?.code === "CALL_EXCEPTION" || err?.message?.includes("revert") || err?.message?.includes("execution reverted")) {
        errorMessage = "Contract call failed. The presale manager may not be initialized or may not have any auctions yet.";
      }
      setError(errorMessage);
      setLoading(false);
    } finally {
      initializingRef.current = false;
    }
  }, [address, fetchAuctionData, fetchUserData, fetchEvents, account]);
  
  useEffect(() => {
    // Only initialize if address is provided
    if (!address) {
      setError("No address provided");
      setLoading(false);
      return;
    }
    
    // Reset state when address changes
    if (managerContract) {
      const currentAddress = managerContract.target || managerContract.address;
      if (currentAddress?.toLowerCase() !== address.toLowerCase()) {
        // Address changed, reset everything
        console.log("Address changed, resetting state");
        setManagerContract(null);
        setAuctionContract(null);
        setAuctionAddress("");
        setAuctionData(null);
        setUserData(null);
        setPriceBuckets([]);
        setEvents([]);
        setError("");
      } else {
        // Same address, don't re-initialize
        console.log("Same address, skipping re-initialization");
        return;
      }
    }
    
    console.log("Initializing auction for address:", address);
    initializeAuction();
  }, [address, initializeAuction]);
  
  // Refresh timer - only update time frequently, fetch data less often
  useEffect(() => {
    // Update time every second for countdown
    const timeInterval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    
    // Fetch data less frequently to avoid RPC rate limits
    const dataInterval = setInterval(() => {
      // Only refresh if contract is ready, not loading, and no error
      if (auctionContract && !loading && !error && auctionData) {
        fetchAuctionData().catch(err => {
          // Silently handle refresh errors to avoid spam
          const errorMessage = err?.message || err?.toString() || "";
          if (!errorMessage.includes("unrecognized-selector") && 
              !errorMessage.includes("Transaction reverted")) {
            console.warn("Refresh failed:", err);
          }
        });
        if (account) {
          fetchUserData().catch(err => {
            // Silently handle refresh errors
            const errorMessage = err?.message || err?.toString() || "";
            if (!errorMessage.includes("unrecognized-selector") && 
                !errorMessage.includes("Transaction reverted")) {
              console.warn("User data refresh failed:", err);
            }
          });
        }
      }
    }, 30000); // Refresh every 30 seconds
    
    return () => {
      clearInterval(timeInterval);
      clearInterval(dataInterval);
    };
  }, [auctionContract, fetchAuctionData, fetchUserData, account, loading, error, auctionData]);
  
  // ============ PHASE CALCULATION ============
  
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
    if (phase === "NotStarted") return getTimeUntil(auctionData.startTime);
    if (phase === "Commit") return getTimeUntil(auctionData.commitEndTime);
    if (phase === "Reveal") return getTimeUntil(auctionData.revealEndTime);
    return null;
  }, [phase, auctionData]);
  
  // ============ COMMIT HANDLERS ============
  
  const generateCommitHash = () => {
    try {
      const qty = BigInt(commitForm.quantity || "0");
      const priceTickIndex = BigInt(commitForm.priceTickIndex || "0");
      const nonce = commitForm.nonce
        ? (commitForm.nonce.startsWith("0x") && commitForm.nonce.length === 66
            ? commitForm.nonce
            : ethers.id(commitForm.nonce))
        : ethers.ZeroHash;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const commitHash = ethers.keccak256(
        abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTickIndex, qty, nonce])
      );
      
      return commitHash;
    } catch (err) {
      return null;
    }
  };
  
  const handleCommit = async () => {
    if (!auctionContract) return;
    
    try {
      const qty = BigInt(commitForm.quantity || "0");
      if (qty <= 0n) {
        throw new Error("Quantity must be greater than zero");
      }
      
      if (!auctionData?.priceTicks || auctionData.priceTicks.length === 0) {
        throw new Error("Price ticks not loaded");
      }
      
      const referencePrice = auctionData.priceTicks[0];
      const depositValue = qty * referencePrice;
      
      if (depositValue === 0n) {
        throw new Error("Unable to compute deposit. Check price ticks and quantity.");
      }
      
      const priceTickIndex = BigInt(commitForm.priceTickIndex || "0");
      const nonce = commitForm.nonce
        ? (commitForm.nonce.startsWith("0x") && commitForm.nonce.length === 66
            ? commitForm.nonce
            : ethers.id(commitForm.nonce))
        : ethers.ZeroHash;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const commitHash = ethers.keccak256(
        abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTickIndex, qty, nonce])
      );
      
      const merkleProof = commitForm.merkleProof
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      
      setTxState({ status: "pending", message: "Submitting commit…" });
      showTxInfo("Please confirm the commit transaction in your wallet", { autoClose: false });
      
      const signer = await ensureSigner();
      const auctionWithSigner = auctionContract.connect(signer);
      const tx = await auctionWithSigner.commit(commitHash, merkleProof, { value: depositValue });
      
      showTxInfo("Commit transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "Commit in mempool", hash: tx.hash });
      
      await tx.wait();
      showTxSuccess("Commit confirmed successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "Commit confirmed", hash: tx.hash });
      
      await fetchAuctionData();
      await fetchUserData();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Commit failed");
      setTxState({ status: "error", message: err?.message || "Commit failed" });
    }
  };
  
  // ============ REVEAL HANDLERS ============
  
  const handleReveal = async () => {
    if (!auctionContract) return;
    
    try {
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
      
      setTxState({ status: "pending", message: "Submitting reveal…" });
      showTxInfo("Please confirm the reveal transaction in your wallet", { autoClose: false });
      
      const signer = await ensureSigner();
      const auctionWithSigner = auctionContract.connect(signer);
      const tx = await auctionWithSigner.reveal(priceTickIndex, qty, nonce, commitIndex);
      
      showTxInfo("Reveal transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "Reveal in mempool", hash: tx.hash });
      
      await tx.wait();
      showTxSuccess("Reveal confirmed successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "Reveal confirmed", hash: tx.hash });
      
      await fetchAuctionData();
      await fetchUserData();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Reveal failed");
      setTxState({ status: "error", message: err?.message || "Reveal failed" });
    }
  };
  
  // ============ FINALIZE HANDLER ============
  
  const handleFinalize = async () => {
    if (!managerContract || !auctionAddress) return;
    
    try {
      setTxState({ status: "pending", message: "Finalizing auction…" });
      showTxInfo("Please confirm the finalize transaction in your wallet", { autoClose: false });
      
      const signer = await ensureSigner();
      const managerWithSigner = managerContract.connect(signer);
      const tx = await managerWithSigner.finalizeAuction(auctionAddress);
      
      showTxInfo("Finalize transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "Finalize in mempool", hash: tx.hash });
      
      await tx.wait();
      showTxSuccess("Auction finalized successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "Auction finalized", hash: tx.hash });
      
      await fetchAuctionData();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Finalize failed");
      setTxState({ status: "error", message: err?.message || "Finalize failed" });
    }
  };
  
  // ============ LAUNCH LBP HANDLER ============
  
  const handleLaunchLBP = async () => {
    if (!managerContract || !auctionAddress) return;
    
    try {
      // Default LBP config - should be configurable
      const lbpConfig = {
        startTime: Math.floor(Date.now() / 1000) + 3600,
        endTime: Math.floor(Date.now() / 1000) + 86400,
        poolStartWeightToken: ethers.parseEther("0.8"),
        poolEndWeightToken: ethers.parseEther("0.2"),
        poolSwapFee: ethers.parseEther("0.003"),
        vestingStartTime: Math.floor(Date.now() / 1000) + 3600,
        vestingCliffDuration: 0,
        vestingFinalDuration: 2592000,
        vestingCliffPercentBP: 0,
      };
      
      setTxState({ status: "pending", message: "Launching LBP…" });
      showTxInfo("Please confirm the LBP launch transaction in your wallet", { autoClose: false });
      
      const signer = await ensureSigner();
      const managerWithSigner = managerContract.connect(signer);
      const tx = await managerWithSigner.launchLBP(auctionAddress, lbpConfig);
      
      showTxInfo("LBP launch transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "LBP launch in mempool", hash: tx.hash });
      
      await tx.wait();
      showTxSuccess("LBP launched successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "LBP launched", hash: tx.hash });
      
      await fetchAuctionData();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      handleTxError(err, "LBP launch failed");
      setTxState({ status: "error", message: err?.message || "LBP launch failed" });
    }
  };
  
  // ============ DEMAND CHECK HANDLER (DEV ONLY) ============
  
  const handleDemandCheck = async () => {
    if (!managerContract || !auctionAddress) return;
    
    try {
      setTxState({ status: "pending", message: "Triggering demand check…" });
      showTxInfo("Please confirm the demand check transaction in your wallet", { autoClose: false });
      
      const signer = await ensureSigner();
      const managerWithSigner = managerContract.connect(signer);
      const tx = await managerWithSigner.handleDemandCheck(auctionAddress);
      
      showTxInfo("Demand check transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "Demand check in mempool", hash: tx.hash });
      
      await tx.wait();
      showTxSuccess("Demand check triggered successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "Demand check triggered", hash: tx.hash });
      
      await fetchAuctionData();
      await fetchEvents();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Demand check failed");
      setTxState({ status: "error", message: err?.message || "Demand check failed" });
    }
  };
  
  // ============ REFRESH HANDLER ============
  
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchAuctionData(), fetchUserData(), fetchEvents()]);
    } finally {
      setRefreshing(false);
    }
  };
  
  // ============ RENDER HELPERS ============
  
  const phaseColors = {
    NotStarted: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    Commit: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    Reveal: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    Finalized: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  };
  
  const commitHashPreview = useMemo(() => generateCommitHash(), [commitForm]);
  const ethRequired = useMemo(() => {
    if (!commitForm.quantity || !auctionData?.priceTicks?.[0]) return "0";
    try {
      const qty = BigInt(commitForm.quantity);
      const price = auctionData.priceTicks[0];
      return formatEth(qty * price);
    } catch {
      return "0";
    }
  }, [commitForm.quantity, auctionData?.priceTicks]);
  
  // Check if user is owner
  const isOwner = useMemo(() => {
    if (!managerContract || !account) return false;
    // This would need to be fetched from manager contract
    return false; // Placeholder
  }, [managerContract, account]);
  
  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.loadingContainer}>
          Loading auction data…
        </div>
      </section>
    );
  }
  
  if (error) {
    return (
      <section className={styles.page}>
        <div className={styles.errorContainer}>{error}</div>
      </section>
    );
  }
  
  if (!auctionData) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyContainer}>
          No auction data available
        </div>
      </section>
    );
  }
  
  return (
    <section className={styles.page}>
      {/* ============ HEADER PANEL ============ */}
      <div className={styles.headerPanel}>
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            <p className={styles.headerLabel}>Presale Manager</p>
            <h1 className={styles.headerTitle}>{address}</h1>
            <div className={styles.headerDetails}>
              <div className={styles.headerDetail}>
                <span className={styles.headerDetailLabel}>Auction:</span>
                <span className={styles.headerDetailValue}>{auctionAddress}</span>
              </div>
              <div className={styles.headerDetail}>
                <span className={styles.headerDetailLabel}>Sale Token:</span>
                <span className={styles.headerDetailValue}>{auctionData.tokenSymbol} ({auctionData.saleToken.slice(0, 10)}...)</span>
              </div>
              <div className={styles.headerDetail}>
                <span className={styles.headerDetailLabel}>Treasury:</span>
                <span className={styles.headerDetailValue}>{auctionData.treasury}</span>
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <div className={`${styles.phaseBadge} ${styles[phase?.toLowerCase() || 'notstarted']}`}>
              <p className={styles.phaseLabel}>Current Phase</p>
              <p className={styles.phaseValue}>{phase}</p>
              {countdown && (
                <p className={styles.phaseCountdown}>Next phase in: {countdown}</p>
              )}
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={styles.refreshButton}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>
      
      {/* ============ AUCTION STATUS OVERVIEW ============ */}
      <div className={styles.statusGrid}>
        <div className={styles.statusItem}>
          <p className={styles.statusLabel}>Tokens for Sale</p>
          <p className={styles.statusValue}>{formatToken(auctionData.tokensForSale)}</p>
        </div>
        <div className={styles.statusItem}>
          <p className={styles.statusLabel}>Total Committed</p>
          <p className={styles.statusValue}>{formatEth(auctionData.totalDepositCommitted)} ETH</p>
        </div>
        <div className={styles.statusItem}>
          <p className={styles.statusLabel}>Total Revealed Qty</p>
          <p className={styles.statusValue}>{formatToken(auctionData.totalQtyRevealed)}</p>
        </div>
        <div className={styles.statusItem}>
          <p className={styles.statusLabel}>Total Revealed Deposit</p>
          <p className={styles.statusValue}>{formatEth(auctionData.totalDepositsRevealed)} ETH</p>
        </div>
        <div className={styles.statusItem}>
          <p className={styles.statusLabel}>Bonus Reserve Remaining</p>
          <p className={styles.statusValue}>{formatToken(auctionData.bonusReserveRemaining)}</p>
        </div>
        <div className={styles.statusItem}>
          <p className={styles.statusLabel}>Soft Cap</p>
          <p className={`${styles.statusValue} ${auctionData.totalDepositCommitted >= auctionData.softCap ? styles.success : ''}`}>
            {formatEth(auctionData.softCap)}
            {auctionData.totalDepositCommitted >= auctionData.softCap && (
              <span style={{ marginLeft: '0.5rem' }}>✓ Reached</span>
            )}
          </p>
        </div>
        {auctionData.finalized && (
          <>
            <div className={styles.statusItem}>
              <p className={styles.statusLabel}>Clearing Price</p>
              <p className={styles.statusValue}>{formatEth(auctionData.clearingPrice)} ETH</p>
            </div>
            <div className={styles.statusItem}>
              <p className={styles.statusLabel}>Tokens Sold</p>
              <p className={styles.statusValue}>{formatToken(auctionData.tokensSold)}</p>
            </div>
            <div className={styles.statusItem}>
              <p className={styles.statusLabel}>Total Raised</p>
              <p className={styles.statusValue}>{formatEth(auctionData.totalRaised)} ETH</p>
            </div>
          </>
        )}
      </div>
      
      {/* ============ PHASE INDICATORS (PROGRESS BAR) ============ */}
      <div className={styles.timelinePanel}>
        <p className={styles.timelineTitle}>Auction Timeline</p>
        <div className={styles.timelineContent}>
          <div className={styles.timelinePhases}>
            <div className={styles.timelinePhase}>
              <p className={styles.timelinePhaseTitle}>Commit Phase</p>
              <p className={styles.timelinePhaseDate}>{toDate(auctionData.startTime)}</p>
              <p className={styles.timelinePhaseDate}>{toDate(auctionData.commitEndTime)}</p>
            </div>
            <div className={styles.timelinePhase}>
              <p className={styles.timelinePhaseTitle}>Reveal Phase</p>
              <p className={styles.timelinePhaseDate}>{toDate(auctionData.commitEndTime)}</p>
              <p className={styles.timelinePhaseDate}>{toDate(auctionData.revealEndTime)}</p>
            </div>
            <div className={styles.timelinePhase}>
              <p className={styles.timelinePhaseTitle}>Finalization</p>
              <p className={styles.timelinePhaseDate}>{toDate(auctionData.revealEndTime)}</p>
            </div>
          </div>
          <div className={styles.progressBarContainer}>
            <div
              className={`${styles.progressBar} ${
                phase === "Commit" ? styles.commit : phase === "Reveal" ? styles.reveal : styles.finalized
              }`}
              style={{
                width: phase === "Finalized" ? "100%" : phase === "Reveal" ? "66%" : phase === "Commit" ? "33%" : "0%",
              }}
            />
          </div>
        </div>
      </div>
      
      {/* ============ DYNAMIC RESERVE PANEL ============ */}
      {auctionData.thresholdLow > 0n && (
        <div className={styles.reservePanel}>
          <p className={styles.reserveTitle}>Dynamic Reserve Automation</p>
          <div className={styles.reserveGrid}>
            <div className={styles.reserveItem}>
              <p className={styles.reserveLabel}>Demand Check Time</p>
              <p className={styles.reserveValue}>Available in UpkeepController</p>
            </div>
            <div className={styles.reserveItem}>
              <p className={styles.reserveLabel}>Adjustments Triggered</p>
              <p className={styles.reserveValue}>{auctionData.dynamicAdjustmentCount}</p>
            </div>
            <div className={styles.reserveItem}>
              <p className={styles.reserveLabel}>Current Decay Multiplier</p>
              <p className={styles.reserveValue}>{formatEth(auctionData.decayMultiplier)}</p>
            </div>
            <div className={styles.reserveItem}>
              <p className={styles.reserveLabel}>Threshold Low</p>
              <p className={styles.reserveValue}>{formatEth(auctionData.thresholdLow)}</p>
            </div>
            {process.env.NODE_ENV === "development" && (
              <div style={{ gridColumn: 'span 2' }}>
                <button
                  onClick={handleDemandCheck}
                  className={`${styles.actionButton} ${styles.amber}`}
                >
                  Trigger Demand Check (Dev Only)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* ============ COMMIT & REVEAL SECTIONS ============ */}
      <div className={styles.formsGrid}>
        {/* Commit Section */}
        {phase === "Commit" && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Commit Bid</p>
            <div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Quantity (whole units)</label>
                <input
                  className={styles.formInput}
                  type="number"
                  value={commitForm.quantity}
                  onChange={(e) => setCommitForm({ ...commitForm, quantity: e.target.value })}
                  placeholder="1000"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Price Tick Index</label>
                <select
                  className={styles.formSelect}
                  value={commitForm.priceTickIndex}
                  onChange={(e) => setCommitForm({ ...commitForm, priceTickIndex: e.target.value })}
                >
                  {auctionData.priceTicks.map((tick, idx) => (
                    <option key={idx} value={idx}>
                      Tick #{idx}: {formatEth(tick)} ETH
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Nonce (string or bytes32)</label>
                <input
                  className={`${styles.formInput} font-mono`}
                  style={{ fontSize: '0.75rem' }}
                  value={commitForm.nonce}
                  onChange={(e) => setCommitForm({ ...commitForm, nonce: e.target.value })}
                  placeholder="my-secret-nonce"
                />
              </div>
              {auctionData.merkleRoot !== ethers.ZeroHash && (
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Merkle Proof (comma separated bytes32)</label>
                  <input
                    className={`${styles.formInput} font-mono`}
                    style={{ fontSize: '0.75rem' }}
                    value={commitForm.merkleProof}
                    onChange={(e) => setCommitForm({ ...commitForm, merkleProof: e.target.value })}
                    placeholder="0x123...,0x456..."
                  />
                </div>
              )}
              {commitHashPreview && (
                <div className={styles.infoBox}>
                  <p className={styles.infoLabel}>Commit Hash Preview:</p>
                  <p className="font-mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{commitHashPreview}</p>
                </div>
              )}
              <div className={styles.infoBox}>
                <p className={styles.infoLabel}>ETH Required:</p>
                <p className={styles.infoValue}>{ethRequired} ETH</p>
              </div>
              {userData && (
                <div className={styles.infoBox}>
                  <p className={styles.infoLabel}>Your Commits:</p>
                  <p className={styles.infoText}>Committed Qty: {formatToken(userData.committedQty)}</p>
                  <p className={styles.infoText}>Committed Deposit: {formatEth(userData.committedQty * (auctionData.priceTicks[0] || 0n))} ETH</p>
                </div>
              )}
              <button
                onClick={handleCommit}
                disabled={!commitForm.quantity || !commitForm.nonce}
                className={`${styles.submitButton} ${styles.commit}`}
              >
                Submit Commit
              </button>
            </div>
          </div>
        )}
        
        {/* Reveal Section */}
        {phase === "Reveal" && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Reveal Bid</p>
            <div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Commit Index</label>
                <input
                  className={styles.formInput}
                  type="number"
                  value={revealForm.commitIndex}
                  onChange={(e) => setRevealForm({ ...revealForm, commitIndex: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Quantity (must match commit)</label>
                <input
                  className={styles.formInput}
                  type="number"
                  value={revealForm.quantity}
                  onChange={(e) => setRevealForm({ ...revealForm, quantity: e.target.value })}
                  placeholder="1000"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Price Tick Index (must match commit)</label>
                <select
                  className={styles.formSelect}
                  value={revealForm.priceTickIndex}
                  onChange={(e) => setRevealForm({ ...revealForm, priceTickIndex: e.target.value })}
                >
                  {auctionData.priceTicks.map((tick, idx) => (
                    <option key={idx} value={idx}>
                      Tick #{idx}: {formatEth(tick)} ETH
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Nonce (exact same as commit)</label>
                <input
                  className={`${styles.formInput} font-mono`}
                  style={{ fontSize: '0.75rem' }}
                  value={revealForm.nonce}
                  onChange={(e) => setRevealForm({ ...revealForm, nonce: e.target.value })}
                  placeholder="my-secret-nonce"
                />
              </div>
              {userData && (
                <div className={styles.infoBox}>
                  <p className={styles.infoLabel}>Your Reveals:</p>
                  <p className={styles.infoText}>Revealed Qty: {formatToken(userData.revealedQty)}</p>
                  <p className={styles.infoText}>Revealed Deposit: {formatEth(userData.revealedDeposit)} ETH</p>
                </div>
              )}
              <button
                onClick={handleReveal}
                disabled={!revealForm.quantity || !revealForm.nonce}
                className={`${styles.submitButton} ${styles.reveal}`}
              >
                Reveal Bid
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* ============ PRICE DECAY CHART ============ */}
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
      
      {/* ============ PRICE BUCKET CHART ============ */}
      {auctionData?.priceTicks && auctionData.priceTicks.length > 0 && (
        <div className={styles.bucketPanel}>
          <p className={styles.bucketTitle}>Price Bucket Demand</p>
          <div className={styles.bucketList}>
            {auctionData.priceTicks.map((tick, idx) => {
              // Find corresponding bucket or create empty one
              const bucket = priceBuckets.find(b => b.index === idx) || { index: idx, price: tick, total: 0n };
              const maxDemand = priceBuckets.length > 0 
                ? Math.max(...priceBuckets.map(b => Number(b.total)), 1) 
                : 1;
              const height = maxDemand > 0 ? (Number(bucket.total) / maxDemand) * 100 : 0;
              const isClearing = auctionData.finalized && idx === auctionData.clearingTickIndex;
              const isUserBucket = false; // Would need to check user's revealed bids
              
              return (
                <div key={idx} className={styles.bucketItem}>
                  <div className={styles.bucketLabel}>Tick #{idx}</div>
                  <div className={styles.bucketChart}>
                    <div className={styles.bucketBarContainer}>
                      <div
                        className={`${styles.bucketBar} ${
                          isClearing
                            ? styles.clearing
                            : isUserBucket
                            ? styles.user
                            : bucket.total > 0n
                            ? styles.default
                            : styles.empty
                        }`}
                        style={{ 
                          height: `${Math.max(height, 2)}%`,
                          minHeight: bucket.total > 0n ? "8px" : "2px"
                        }}
                      />
                      {bucket.total > 0n && (
                        <div className={styles.bucketValue}>
                          {formatToken(bucket.total)}
                        </div>
                      )}
                    </div>
                    <div className={styles.bucketPrice}>
                      {formatEth(bucket.price)} ETH
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {auctionData.finalized && (
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              Clearing Price: <span style={{ fontWeight: 600, color: 'rgb(110, 231, 183)' }}>{formatEth(auctionData.clearingPrice)} ETH</span> (Tick #{auctionData.clearingTickIndex})
            </p>
          )}
          {priceBuckets.length === 0 && (
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
              No demand data available yet. Commits will appear here once users start committing bids.
            </p>
          )}
        </div>
      )}
      
      {/* ============ USER ALLOCATION PREVIEW ============ */}
      {!auctionData.finalized && userData && userData.revealedQty > 0n && (
        <div className={styles.allocationPanel}>
          <p className={styles.allocationTitle}>Your Allocation Preview</p>
          <div className={styles.allocationGrid}>
            <div className={styles.allocationItem}>
              <p className={styles.allocationLabel}>Estimated Allocation</p>
              <p className={styles.allocationValue}>{formatToken(userData.revealedQty)}</p>
            </div>
            <div className={styles.allocationItem}>
              <p className={styles.allocationLabel}>Estimated Payment</p>
              <p className={styles.allocationValue}>{formatEth(userData.revealedDeposit)} ETH</p>
            </div>
          </div>
          <p className={styles.allocationNote}>
            * Final allocation will be determined after auction finalization
          </p>
        </div>
      )}
      
      {/* ============ FINALIZATION PANEL (OWNER ONLY) ============ */}
      {phase === "Finalized" && !auctionData.finalized && isOwner && (
        <div className={styles.finalizationPanel}>
          <p className={styles.finalizationTitle}>Auction Finalization (Owner Only)</p>
          <button
            onClick={handleFinalize}
            className={`${styles.actionButton} ${styles.amber}`}
          >
            Finalize Auction
          </button>
        </div>
      )}
      
      {auctionData.finalized && (
        <div className={styles.finalizedPanel}>
          <p className={styles.finalizedTitle}>Auction Finalized</p>
          <div className={styles.finalizedGrid}>
            <div className={styles.finalizedItem}>
              <p className={styles.finalizedLabel}>Tokens Sold</p>
              <p className={styles.finalizedValue}>{formatToken(auctionData.tokensSold)}</p>
            </div>
            <div className={styles.finalizedItem}>
              <p className={styles.finalizedLabel}>Total Raised</p>
              <p className={styles.finalizedValue}>{formatEth(auctionData.totalRaised)} ETH</p>
            </div>
            <div className={styles.finalizedItem}>
              <p className={styles.finalizedLabel}>ETH for Treasury</p>
              <p className={styles.finalizedValue}>{formatEth(auctionData.ethForTreasury)} ETH</p>
            </div>
            <div className={styles.finalizedItem}>
              <p className={styles.finalizedLabel}>Clearing Price</p>
              <p className={styles.finalizedValue}>{formatEth(auctionData.clearingPrice)} ETH</p>
            </div>
          </div>
          {!auctionData.lbpLaunched && isOwner && (
            <button
              onClick={handleLaunchLBP}
              className={`${styles.actionButton} ${styles.indigo}`}
              style={{ marginTop: '1rem' }}
            >
              Launch LBP
            </button>
          )}
          {auctionData.lbpLaunched && auctionData.lbpTokenRecipient !== ethers.ZeroAddress && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>LBP Launched:</p>
              <Link
                to={`/lbp/${auctionData.lbpTokenRecipient}`}
                style={{ color: 'rgb(110, 231, 183)', fontFamily: 'monospace', fontSize: '0.875rem' }}
              >
                {auctionData.lbpTokenRecipient}
              </Link>
            </div>
          )}
        </div>
      )}
      
      {/* ============ EVENT LOG ============ */}
      {events.length > 0 && (
        <div className={styles.eventsPanel}>
          <p className={styles.eventsTitle}>Recent Events (Last 20)</p>
          <div className={styles.eventsList}>
            {events.map((event, idx) => (
              <div key={idx} className={styles.eventItem}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <p className={styles.eventType}>{event.type}</p>
                    <p className={styles.eventArgs}>
                      {event.args && Object.keys(event.args).length > 0
                        ? JSON.stringify(event.args, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
                        : "No args"}
                    </p>
                  </div>
                  <div className={styles.eventBlock}>
                    Block: {event.blockNumber?.toString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <TxStatusIndicator
        status={txState?.status}
        message={txState?.message}
        hash={txState?.hash}
        onClear={() => setTxState(null)}
      />
    </section>
  );
};

export default AuctionView;
