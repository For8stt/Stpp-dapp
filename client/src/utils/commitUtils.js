import { ethers } from "ethers";

/**
 * Generates a commit hash from bid parameters
 * @param priceTickIndex - Price tick index (uint256)
 * @param quantity - Token quantity in wei (18 decimals). Can be a string number (e.g., "1.5") or BigInt in wei.
 * @param nonce - Nonce string or bytes32 hash
 * @param tokenDecimals - Token decimals (default: 18)
 * @returns Commit hash (bytes32) or null on error
 */
export const generateCommitHash = (priceTickIndex, quantity, nonce, tokenDecimals = 18) => {
  try {
    let qtyWei;
    if (typeof quantity === "string") {
      qtyWei = ethers.parseUnits(quantity, tokenDecimals);
    } else if (typeof quantity === "number") {
      // Convert number to string first to handle decimals
      qtyWei = ethers.parseUnits(quantity.toString(), tokenDecimals);
    } else {
      qtyWei = BigInt(quantity || "0");
    }
    
    const priceTick = BigInt(priceTickIndex || "0");
    const nonceHash = nonce
      ? (nonce.startsWith("0x") && nonce.length === 66
          ? nonce
          : ethers.id(nonce))
      : ethers.ZeroHash;

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return ethers.keccak256(
      abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTick, qtyWei, nonceHash])
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
 * @param quantity - Token quantity. Can be a string (e.g., "1.5") or BigInt in wei.
 * @param referencePrice - Reference price in wei (ETH per token, 18 decimals)
 * @param tokenDecimals - Token decimals (default: 18)
 * @returns Deposit amount in wei (ETH)
 */
export const calculateDeposit = (quantity, referencePrice, tokenDecimals = 18) => {
  try {
    let qtyWei;
    if (typeof quantity === "string") {
      qtyWei = ethers.parseUnits(quantity, tokenDecimals);
    } else if (typeof quantity === "number") {
      // Convert number to string first to handle decimals
      qtyWei = ethers.parseUnits(quantity.toString(), tokenDecimals);
    } else {
      qtyWei = BigInt(quantity || "0");
    }
    
    const price = BigInt(referencePrice || "0"); // Already in wei (ETH per token)
    return (qtyWei * price) / (10n ** BigInt(tokenDecimals));
  } catch {
    return 0n;
  }
};

