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
 * @param {Contract} contract - The contract instance
 * @param {EventFilter} eventFilter - The event filter
 * @param {number|string} fromBlock - Block number or negative offset (e.g., -1000 for last 1000 blocks)
 * @returns {Promise<Array>} Array of events
 */
export const safeQueryEvents = async (contract, eventFilter, fromBlock = -1000) => {
  if (!eventFilter) return [];
  
  try {
    // If fromBlock is negative, calculate the actual block number
    let actualFromBlock = fromBlock;
    if (typeof fromBlock === 'number' && fromBlock < 0) {
      try {
        const provider = contract.provider || contract.runner?.provider;
        if (provider) {
          const currentBlock = await provider.getBlockNumber();
          const blockOffset = Math.abs(fromBlock);
          actualFromBlock = Math.max(0, currentBlock - blockOffset);
          console.log(`[Events] Querying from block ${actualFromBlock} (current: ${currentBlock}, offset: ${blockOffset})`);
        } else {
          // Fallback: use 0 if we can't get current block
          console.warn("[Events] No provider available, using block 0");
          actualFromBlock = 0;
        }
      } catch (blockErr) {
        console.warn("Could not get current block number, using 0:", blockErr);
        actualFromBlock = 0;
      }
    }
    
    const events = await contract.queryFilter(eventFilter, actualFromBlock);
    console.log(`[Events] Found ${events.length} events from block ${actualFromBlock}`);
    return events;
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

