/**
 * Contract utility functions for safe Web3 calls
 */

import { ethers } from "ethers";

/**
 * Checks if an error is a known contract call error that should be handled gracefully
 */
export const isContractCallError = (error) => {
  const errorMessage = error?.message || error?.toString() || "";
  const errorCode = error?.code || "";

  return (
    errorCode === "CALL_EXCEPTION" ||
    errorMessage.includes("missing revert data") ||
    errorMessage.includes("execution reverted") ||
    errorMessage.includes("revert") ||
    errorMessage.includes("unrecognized-selector") ||
    errorMessage.includes("Transaction reverted") ||
    errorMessage.includes("Transaction reverted without a reason")
  );
};

/**
 * Safely calls a contract method with error handling
 * Returns defaultValue if the call fails with a known contract error
 */
export const safeContractCall = async (method, defaultValue = null) => {
  try {
    return await method();
  } catch (error) {
    if (isContractCallError(error)) {
      return defaultValue;
    }
    throw error;
  }
};

/**
 * Safely queries contract events
 */
export const safeQueryEvents = async (contract, eventFilter, fromBlock = -1000) => {
  if (!eventFilter) return [];
  
  try {
    return await contract.queryFilter(eventFilter, fromBlock);
  } catch (error) {
    console.warn("Failed to query events:", error);
    return [];
  }
};

/**
 * Validates an Ethereum address
 */
export const isValidAddress = (address) => {
  if (!address) return false;
  try {
    return ethers.isAddress(address) && address !== ethers.ZeroAddress;
  } catch {
    return false;
  }
};

