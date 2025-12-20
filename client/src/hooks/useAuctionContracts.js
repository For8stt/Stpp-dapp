import { useState, useCallback, useRef, useEffect } from "react";
import { Contract } from "ethers";
import loadContract from "../services/web3/loadContract";
import allAbis from "../abi/allAbis.json";
import { ensureProvider } from "../services/web3/provider";
import { isValidAddress, safeContractCall } from "../utils/contractUtils";

const INITIALIZATION_DELAY = 100; // ms delay between contract creation and data fetch

/**
 * Custom hook for managing auction-related contracts
 * Handles loading and initialization of PresaleManager and DutchAuction contracts
 */
export const useAuctionContracts = (managerAddress) => {
  const [state, setState] = useState({
    managerContract: null,
    auctionContract: null,
    auctionAddress: null,
    loading: false,
    error: null,
  });

  const initializingRef = useRef(false);
  const currentAddressRef = useRef(null);

  const resetState = useCallback(() => {
    setState({
      managerContract: null,
      auctionContract: null,
      auctionAddress: null,
      loading: false,
      error: null,
    });
    currentAddressRef.current = null;
  }, []);

  const loadManagerContract = useCallback(async (address) => {
    if (!address || !isValidAddress(address)) {
      throw new Error("Invalid manager address");
    }

    const provider = ensureProvider();
    const abi = allAbis.PresaleManager || [];
    if (abi.length === 0) {
      throw new Error("PresaleManager ABI not found");
    }
    return new Contract(address, abi, provider);
  }, []);

  const getAuctionAddress = useCallback(async (manager) => {
    let auctionsList = await safeContractCall(
      () => manager.getAllAuctions(),
      []
    );

    if (!auctionsList || auctionsList.length === 0) {
      throw new Error("No auctions found for this presale manager");
    }

    let latest = await safeContractCall(
      () => manager.getLatestPresaleInfo(),
      null
    );

    if (!latest && auctionsList.length > 0) {
      const lastAuction = auctionsList[auctionsList.length - 1];
      latest = await safeContractCall(
        () => manager.getPresaleInfo(lastAuction),
        null
      );
    }

    if (!latest) {
      throw new Error("Could not retrieve auction information");
    }

    const auctionAddr = Array.isArray(latest) && latest.length > 1 ? latest[1] : null;

    if (!auctionAddr || !isValidAddress(auctionAddr)) {
      throw new Error("Auction not initialized for this presale yet");
    }

    return auctionAddr;
  }, []);

  const loadAuctionContract = useCallback(async (auctionAddress) => {
    const auctionAbi = allAbis.DutchAuction || [];
    if (auctionAbi.length === 0) {
      throw new Error("DutchAuction ABI not found");
    }

    const provider = ensureProvider();
    const code = await provider.getCode(auctionAddress);
    if (!code || code === "0x") {
      throw new Error("Auction contract not deployed at this address");
    }

    return new Contract(auctionAddress, auctionAbi, provider);
  }, []);

  const initialize = useCallback(async () => {
    if (!managerAddress || !isValidAddress(managerAddress)) {
      setState(prev => ({ ...prev, error: "Invalid manager address", loading: false }));
      return;
    }

    if (initializingRef.current) {
      return;
    }

    if (currentAddressRef.current?.toLowerCase() === managerAddress.toLowerCase()) {
      return;
    }

    initializingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      if (currentAddressRef.current && currentAddressRef.current !== managerAddress) {
        resetState();
      }

      currentAddressRef.current = managerAddress;

      const manager = await loadManagerContract(managerAddress);
      const auctionAddr = await getAuctionAddress(manager);
      const auction = await loadAuctionContract(auctionAddr);
      await new Promise(resolve => setTimeout(resolve, INITIALIZATION_DELAY));

      setState({
        managerContract: manager,
        auctionContract: auction,
        auctionAddress: auctionAddr,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("Failed to initialize contracts:", error);
      setState({
        managerContract: null,
        auctionContract: null,
        auctionAddress: null,
        loading: false,
        error: error.message || "Failed to initialize contracts",
      });
      currentAddressRef.current = null;
    } finally {
      initializingRef.current = false;
    }
  }, [managerAddress, loadManagerContract, getAuctionAddress, loadAuctionContract, resetState]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    ...state,
    initialize,
    reset: resetState,
  };
};

