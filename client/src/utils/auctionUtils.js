import { ethers } from "ethers";

export const toDate = (timestamp) => {
  if (!timestamp || timestamp === 0) return "—";
  return new Date(Number(timestamp) * 1000).toLocaleString();
};

export const formatEth = (value) => {
  if (!value || value === 0n) return "0";
  try {
    return ethers.formatEther(value);
  } catch {
    return "0";
  }
};

export const formatToken = (value, decimals = 18) => {
  if (!value || value === 0n) return "0";
  try {
    return ethers.formatUnits(value, decimals);
  } catch {
    return "0";
  }
};

/**
 * Format token quantity in wei (18 decimals) as decimal string
 * Used for revealedQty, allocatedQty, totalQtyRevealed which are now stored in wei
 */
export const formatTokenUnits = (value, decimals = 18) => {
  if (!value || value === 0n) return "0";
  try {
    return ethers.formatUnits(value, decimals);
  } catch {
    return "0";
  }
};

export const getPhase = (now, startTime, commitEndTime, revealEndTime, finalized) => {
  if (finalized) return "Finalized";
  if (now < startTime) return "NotStarted";
  if (now >= startTime && now <= commitEndTime) return "Commit";
  if (now > commitEndTime && now <= revealEndTime) return "Reveal";
  return "Finalized";
};

/**
 * Calculate time remaining until target time
 * @param {number|bigint} targetTime - Target timestamp in seconds
 * @param {number} currentTime - Current timestamp in seconds (from unified time layer)
 * @returns {string|null} - Formatted time string or null if time has passed
 */
export const getTimeUntil = (targetTime, currentTime) => {
  const now = Number(currentTime);
  const diff = Number(targetTime) - now;
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};
