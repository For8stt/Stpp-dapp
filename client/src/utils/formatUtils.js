import { ethers } from "ethers";

/**
 * Format timestamp to locale string
 */
export const formatTime = (timestamp) => {
  if (!timestamp || timestamp === 0) return "N/A";
  return new Date(Number(timestamp) * 1000).toLocaleString();
};

/**
 * Format ether value (wei to ETH)
 */
export const formatEther = (value) => {
  if (!value) return "0";
  return ethers.formatEther(value);
};

/**
 * Format token value with decimals
 */
export const formatToken = (value, decimals = 18) => {
  if (!value) return "0";
  return ethers.formatUnits(value, decimals);
};

/**
 * Shorten Ethereum address
 */
export const shortenAddress = (addr) => {
  if (!addr || addr === ethers.ZeroAddress) return "N/A";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

