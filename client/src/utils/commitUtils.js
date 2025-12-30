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
 * @param {string} proofString - Comma-separated hex strings
 * @returns {string[]} Array of proof hashes
 */
export const parseMerkleProof = (proofString) => {
  if (!proofString) return [];
  return proofString
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/**
 * Validates Merkle proof format
 * @param {string[]} proof - Array of proof hashes
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export const validateMerkleProof = (proof) => {
  if (!Array.isArray(proof)) {
    return { valid: false, error: "Merkle proof must be an array" };
  }
  
  if (proof.length === 0) {
    return { valid: false, error: "Merkle proof cannot be empty" };
  }
  
  for (let i = 0; i < proof.length; i++) {
    const hash = proof[i];
    
    if (typeof hash !== "string") {
      return { valid: false, error: `Proof element ${i} must be a string` };
    }
    
    if (!hash.startsWith("0x")) {
      return { valid: false, error: `Proof element ${i} must start with 0x` };
    }
    
    if (hash.length !== 66) {
      return { valid: false, error: `Proof element ${i} must be 66 characters (0x + 64 hex chars)` };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return { valid: false, error: `Proof element ${i} contains invalid hex characters` };
    }
  }
  
  return { valid: true };
};

/**
 * Verifies Merkle proof for an address against a Merkle root
 * Uses the same algorithm as the contract: keccak256(abi.encodePacked(address))
 * @param {string[]} proof - Array of proof hashes (bytes32[])
 * @param {string} merkleRoot - Merkle root (bytes32)
 * @param {string} address - Ethereum address to verify
 * @returns {boolean} True if proof is valid for the address
 */
export const verifyMerkleProof = (proof, merkleRoot, address) => {
  try {
    if (!merkleRoot || merkleRoot === ethers.ZeroHash || 
        merkleRoot === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      return true; // No whitelist = always valid
    }
    
    if (!proof || proof.length === 0) {
      return false;
    }
    
    if (!address) {
      return false;
    }
    if (!ethers.isAddress(address)) {
      return false;
    }
    for (const proofElement of proof) {
      if (typeof proofElement !== "string" || !proofElement.startsWith("0x")) {
        return false;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(proofElement)) {
        return false;
      }
    }
    const normalizedAddress = ethers.getAddress(address);
    const addressBytes = ethers.getBytes(normalizedAddress);
    const leaf = ethers.keccak256(addressBytes);
    let computedHash = leaf;
    
    for (let i = 0; i < proof.length; i++) {
      const proofElement = proof[i];
      const computedBytes = ethers.getBytes(computedHash);
      const proofBytes = ethers.getBytes(proofElement);
      let computedIsSmaller = false;
      for (let j = 0; j < 32; j++) {
        if (computedBytes[j] < proofBytes[j]) {
          computedIsSmaller = true;
          break;
        } else if (computedBytes[j] > proofBytes[j]) {
          computedIsSmaller = false;
          break;
        }
      }
      if (computedIsSmaller) {
        computedHash = ethers.keccak256(ethers.concat([computedHash, proofElement]));
      } else {
        computedHash = ethers.keccak256(ethers.concat([proofElement, computedHash]));
      }
    }
    return computedHash.toLowerCase() === merkleRoot.toLowerCase();
  } catch (error) {
    const errorMsg = error?.message || "";
    const isFormatError = errorMsg.includes("invalid") || 
                          errorMsg.includes("BytesLike") || 
                          errorMsg.includes("data out-of-bounds") ||
                          error?.code === "INVALID_ARGUMENT";
    
    if (!isFormatError) {
      console.error("Error verifying Merkle proof:", error);
    }
    return false;
  }
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

