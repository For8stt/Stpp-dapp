/* global BigInt */
import { ethers } from "ethers";

/**
 * Generates a commit hash from bid parameters
 */
export const generateCommitHash = (priceTickIndex, quantity, nonce) => {
  try {
    const qty = BigInt(quantity || "0");
    const priceTick = BigInt(priceTickIndex || "0");
    const nonceHash = nonce
      ? (nonce.startsWith("0x") && nonce.length === 66
          ? nonce
          : ethers.id(nonce))
      : ethers.ZeroHash;

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return ethers.keccak256(
      abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTick, qty, nonceHash])
    );
  } catch (error) {
    console.error("Failed to generate commit hash:", error);
    return null;
  }
};

/**
 * Parses merkle proof from comma-separated string
 */
export const parseMerkleProof = (proofString) => {
  if (!proofString) return [];
  return proofString
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/**
 * Calculates required ETH deposit for a commit
 */
export const calculateDeposit = (quantity, referencePrice) => {
  try {
    const qty = BigInt(quantity || "0");
    const price = BigInt(referencePrice || "0");
    return qty * price;
  } catch {
    return 0n;
  }
};

