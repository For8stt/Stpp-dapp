/**
 * @title Generate Whitelist Merkle Tree
 * @notice Off-chain script to generate a Merkle tree for Dutch Auction whitelist
 * @dev This script accepts a list of Ethereum addresses, normalizes them,
 *      generates a Merkle tree using keccak256(address) leaves, and produces
 *      a structured JSON file with the Merkle root and proofs for each address.
 * 
 * Usage:
 *   npx hardhat run scripts/generateWhitelistMerkle.ts -- <whitelist.txt> [output.json]
 * 
 * Input format (whitelist.txt):
 *   One address per line (checksummed or lowercase)
 *   Example:
 *     0x1234567890123456789012345678901234567890
 *     0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
 * 
 * Output format (whitelist-merkle.json):
 *   {
 *     "merkleRoot": "0x...",
 *     "proofs": {
 *       "0x1234...": ["0x...", "0x..."],
 *       "0xabcd...": ["0x...", "0x..."]
 *     }
 *   }
 */

import { ethers } from "hardhat";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

interface WhitelistOutput {
    merkleRoot: string;
    proofs: Record<string, string[]>;
    addresses: string[];
    totalAddresses: number;
}

/**
 * Generates IPFS-ready whitelist JSON format
 * Format: { "0xaddress": ["0xproof1", "0xproof2", ...], ... }
 * Optionally includes merkleRoot at top level for validation
 */
interface IPFSWhitelistFormat {
    merkleRoot?: string; // Optional, for validation
    proofs: Record<string, string[]>;
}

//   WHITELIST_FILE=whitelist.txt npx hardhat run scripts/generateWhitelistMerkle.ts
/**
 * Normalizes an Ethereum address to checksummed format
 * @param address Raw address string
 * @returns Checksummed address
 */
function normalizeAddress(address: string): string {
    try {
        // Remove whitespace and convert to lowercase
        const cleaned = address.trim().toLowerCase();
        // Validate it's a valid address
        if (!ethers.isAddress(cleaned)) {
            throw new Error(`Invalid address: ${address}`);
        }
        // Return checksummed address
        return ethers.getAddress(cleaned);
    } catch (error) {
        throw new Error(`Failed to normalize address "${address}": ${error}`);
    }
}

/**
 * Computes leaf hash: keccak256(address)
 * This matches the implementation in CommitLib.sol: keccak256(abi.encodePacked(account))
 * @param address Checksummed Ethereum address
 * @returns Leaf hash as hex string
 */
function hashAddress(address: string): string {
    return ethers.keccak256(ethers.solidityPacked(["address"], [address]));
}

/**
 * Builds a Merkle tree from address leaves and returns root + proofs
 * Uses sorted pairs for deterministic tree construction
 * @param addresses Array of checksummed addresses
 * @returns Merkle root and proofs mapping (address => proof array)
 */
function buildMerkleTree(addresses: string[]): { root: string; proofs: Record<string, string[]> } {
    if (addresses.length === 0) {
        return { root: ethers.ZeroHash, proofs: {} };
    }

    // Remove duplicates while preserving order
    const uniqueAddresses = Array.from(new Set(addresses.map(a => a.toLowerCase())))
        .map(a => ethers.getAddress(a));

    // Compute leaves: keccak256(address) for each address
    const leaves = uniqueAddresses.map(hashAddress);

    // Sort leaves for deterministic tree construction
    const sortedLeaves = [...leaves].sort((a, b) => {
        return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
    });

    // Build tree layers
    const layers: string[][] = [sortedLeaves];
    while (layers[layers.length - 1].length > 1) {
        const current = layers[layers.length - 1];
        const next: string[] = [];
        
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = i + 1 < current.length ? current[i + 1] : current[i];
            // Sort pair for deterministic hashing
            const [lo, hi] = BigInt(left) < BigInt(right) ? [left, right] : [right, left];
            next.push(ethers.keccak256(ethers.concat([lo, hi])));
        }
        
        layers.push(next);
    }

    const root = layers[layers.length - 1][0];
    const proofs: Record<string, string[]> = {};

    // Generate proof for each address
    for (let addressIndex = 0; addressIndex < uniqueAddresses.length; addressIndex++) {
        const address = uniqueAddresses[addressIndex];
        const leaf = leaves[addressIndex];
        
        // Find leaf index in sorted array
        const leafIndex = sortedLeaves.indexOf(leaf);
        if (leafIndex === -1) {
            throw new Error(`Leaf not found in sorted array for address ${address}`);
        }

        const proof: string[] = [];
        let index = leafIndex;
        
        // Build proof path from leaf to root
        for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
            const layer = layers[layerIndex];
            const pairIndex = index ^ 1; // Sibling index
            
            if (pairIndex < layer.length) {
                proof.push(layer[pairIndex]);
            } else {
                // If no sibling, use self (for odd-numbered layers)
                proof.push(layer[index]);
            }
            
            index = Math.floor(index / 2);
        }
        
        // Store proof keyed by lowercase address for easy lookup
        proofs[address.toLowerCase()] = proof;
    }

    return { root, proofs };
}

/**
 * Reads addresses from a text file (one per line)
 * @param filePath Path to addresses file
 * @returns Array of normalized addresses
 */
function readAddressesFromFile(filePath: string): string[] {
    try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith("#")); // Filter empty lines and comments
        
        if (lines.length === 0) {
            throw new Error("No addresses found in file");
        }

        const addresses = lines.map(normalizeAddress);
        
        // Check for duplicates
        const uniqueCount = new Set(addresses.map(a => a.toLowerCase())).size;
        if (uniqueCount < addresses.length) {
            console.warn(`[WARNING] Found ${addresses.length - uniqueCount} duplicate address(es). They will be deduplicated.`);
        }

        return addresses;
    } catch (error: any) {
        if (error.code === "ENOENT") {
            throw new Error(`File not found: ${filePath}`);
        }
        throw new Error(`Failed to read addresses file: ${error.message}`);
    }
}

/**
 * Main function to generate whitelist Merkle tree
 * @param addressesFile Path to file containing addresses (one per line)
 * @param outputPath Optional output file path
 * @returns Whitelist output with root and proofs
 */
function generateWhitelistMerkle(
    addressesFile: string,
    outputPath?: string
): WhitelistOutput {
    console.log(`\n[INFO] Generating Whitelist Merkle Tree\n`);
    console.log(`[INFO] Reading addresses from: ${addressesFile}\n`);

    const addresses = readAddressesFromFile(addressesFile);
    const uniqueAddresses = Array.from(new Set(addresses.map(a => a.toLowerCase())))
        .map(a => ethers.getAddress(a));

    console.log(`[INFO] Found ${addresses.length} address(es) (${uniqueAddresses.length} unique)\n`);

    if (uniqueAddresses.length === 0) {
        throw new Error("No valid addresses found");
    }

    console.log(`[INFO] Building Merkle tree...\n`);
    const { root, proofs } = buildMerkleTree(uniqueAddresses);

    console.log(`[SUCCESS] Merkle tree generated successfully!\n`);
    console.log(`[SUMMARY]`);
    console.log(`   Total Addresses: ${uniqueAddresses.length}`);
    console.log(`   Merkle Root: ${root}\n`);

    // Verify proofs
    console.log(`[INFO] Verifying proofs...\n`);
    let verifiedCount = 0;
    for (const address of uniqueAddresses) {
        const proof = proofs[address.toLowerCase()];
        if (!proof) {
            throw new Error(`Missing proof for address ${address}`);
        }

        // Verify proof by reconstructing root
        let computed = hashAddress(address);
        for (const sibling of proof) {
            const [lo, hi] = BigInt(computed) < BigInt(sibling) 
                ? [computed, sibling] 
                : [sibling, computed];
            computed = ethers.keccak256(ethers.concat([lo, hi]));
        }

        if (computed !== root) {
            throw new Error(`Proof verification failed for address ${address}`);
        }
        verifiedCount++;
    }

    console.log(`[SUCCESS] Verified ${verifiedCount} proof(s)\n`);

    // Create IPFS-ready format (proofs with optional merkleRoot for validation)
    const ipfsFormat: IPFSWhitelistFormat = {
        merkleRoot: root, // Include for validation
        proofs: proofs
    };
    
    const finalOutputPath = outputPath || join(process.cwd(), "whitelist-merkle-ipfs.json");
    writeFileSync(finalOutputPath, JSON.stringify(ipfsFormat, null, 2));
    console.log(`[SUCCESS] IPFS-ready format written to: ${finalOutputPath}\n`);
    console.log(`[INFO] Upload this file to IPFS and use the CID in setWhitelistCID()\n`);

    console.log(`[USAGE] Instructions:`);
    console.log(`   1. Use the merkleRoot value when creating the auction`);
    console.log(`   2. Upload whitelist-merkle-ipfs.json to IPFS`);
    console.log(`   3. Call setWhitelistCID() with the IPFS CID`);
    console.log(`   4. Frontend will automatically load proofs for whitelisted addresses\n`);

    // Return output in the old format for backwards compatibility
    return {
        merkleRoot: root,
        proofs: proofs,
        addresses: uniqueAddresses,
        totalAddresses: uniqueAddresses.length
    };
}

async function main() {
    // Try environment variables first
    let addressesFile = process.env.WHITELIST_FILE;
    let outputFile = process.env.OUTPUT_FILE;
    
    // If not in env, try to parse from argv (but Hardhat doesn't support -- for args)
    if (!addressesFile) {
        const args = process.argv.slice(2);
        
        // Filter out hardhat-specific arguments
        const filteredArgs = args.filter(arg => 
            !arg.startsWith("--") && 
            arg !== "localhost" && 
            arg !== "hardhat" && 
            arg !== "sepolia" && 
            arg !== "goerli" && 
            arg !== "mainnet" &&
            arg !== "run" &&
            !arg.includes("generateWhitelistMerkle") &&
            !arg.endsWith(".ts")
        );

        if (filteredArgs.length > 0) {
            addressesFile = filteredArgs[0];
            if (filteredArgs.length > 1) {
                outputFile = filteredArgs[1];
            }
        }
    }

    if (!addressesFile) {
        console.error("[ERROR] Addresses file is required\n");
        console.error("Usage (method 1 - environment variables):");
        console.error("  WHITELIST_FILE=whitelist.txt OUTPUT_FILE=whitelist-merkle-ipfs.json npx hardhat run scripts/generateWhitelistMerkle.ts\n");
        console.error("Usage (method 2 - direct arguments, may not work with Hardhat):");
        console.error("  npx hardhat run scripts/generateWhitelistMerkle.ts whitelist.txt whitelist-merkle-ipfs.json\n");
        console.error("Input file format (whitelist.txt):");
        console.error("  One address per line (checksummed or lowercase)");
        console.error("  Example:");
        console.error("    0x1234567890123456789012345678901234567890");
        console.error("    0xabcdefabcdefabcdefabcdefabcdefabcdefabcd\n");
        console.error("Example with environment variables:");
        console.error("  WHITELIST_FILE=whitelist.txt npx hardhat run scripts/generateWhitelistMerkle.ts\n");
        process.exit(1);
    }

    try {
        generateWhitelistMerkle(addressesFile, outputFile);
    } catch (error: any) {
        console.error(`[ERROR] ${error.message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

export { generateWhitelistMerkle, buildMerkleTree, hashAddress, normalizeAddress };

