/**
 * @title Upload File to IPFS
 * @notice Script to upload a file (typically whitelist JSON) to IPFS
 * @dev Supports multiple IPFS methods: HTTP API, CLI, and web3.storage
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// WHITELIST_JSON=whitelist-merkle-ipfs.json npx hardhat run scripts/uploadToIPFS.ts
/**
 * Gets IPFS API port (tries common ports)
 * @returns API port number or null
 */
function getIPFSAPIPort(): number | null {
    const ports = [5001, 5002]; // Common IPFS API ports
    
    for (const port of ports) {
        try {
            execSync(`curl -s http://127.0.0.1:${port}/api/v0/version`, {
                encoding: "utf-8",
                stdio: "ignore",
                timeout: 2000,
            });
            return port;
        } catch {
            continue;
        }
    }
    
    return null;
}

/**
 * Checks if IPFS daemon is running (via HTTP API)
 * @returns true if daemon is accessible
 */
function isIPFSDaemonRunning(): boolean {
    return getIPFSAPIPort() !== null;
}

/**
 * Uploads a file to local IPFS using HTTP API
 * @param filePath Path to the file to upload
 * @returns CID (Content Identifier) of the uploaded file
 */
async function uploadViaHTTPAPI(filePath: string): Promise<string | null> {
    const apiPort = getIPFSAPIPort();
    if (!apiPort) {
        return null;
    }

    try {
        console.log(`   Trying HTTP API on port ${apiPort}...`);
        const curlOutput = execSync(
            `curl -s -X POST -F "file=@${filePath}" http://127.0.0.1:${apiPort}/api/v0/add`,
            {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 30000,
            }
        ).trim();
        
        const result = JSON.parse(curlOutput);
        const cid = result.Hash || result.cid;
        
        if (cid && (cid.startsWith("Qm") || cid.startsWith("bafy"))) {
            return cid;
        }
    } catch (error: any) {
        console.log("   HTTP API failed:", error.message);
        return null;
    }
    
    return null;
}

/**
 * Uploads a file to IPFS using CLI (npx ipfs or global ipfs)
 * @param filePath Path to the file to upload
 * @returns CID (Content Identifier) of the uploaded file
 */
async function uploadViaCLI(filePath: string): Promise<string | null> {
    // Try npx ipfs first
    try {
        const addOutput = execSync(`npx ipfs add --quiet "${filePath}"`, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 30000,
        }).trim();
        
        const cid = addOutput.split(/\s+/)[0];
        if (cid && (cid.startsWith("Qm") || cid.startsWith("bafy"))) {
            return cid;
        }
    } catch (npxError: any) {
        // Try global ipfs command
        try {
            const addOutput = execSync(`ipfs add --quiet "${filePath}"`, {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 30000,
            }).trim();
            
            const cid = addOutput.split(/\s+/)[0];
            if (cid && (cid.startsWith("Qm") || cid.startsWith("bafy"))) {
                return cid;
            }
        } catch (globalError: any) {
            return null;
        }
    }
    
    return null;
}

/**
 * Uploads a file to IPFS using web3.storage (if available)
 * @param filePath Path to the file to upload
 * @returns CID (Content Identifier) of the uploaded file
 */
async function uploadViaWeb3Storage(filePath: string): Promise<string | null> {
    // Check if web3.storage token is available
    const token = process.env.WEB3_STORAGE_TOKEN;
    if (!token) {
        return null;
    }

    try {
        // Use curl for web3.storage upload (simpler in Node.js)
        const fileName = filePath.split('/').pop() || 'file.json';
        const curlCommand = `curl -s -X POST \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            --data-binary "@${filePath}" \
            https://api.web3.storage/upload`;
        
        const output = execSync(curlCommand, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 30000,
        }).trim();
        
        const result = JSON.parse(output);
        const cid = result.cid;
        
        if (cid && (cid.startsWith("Qm") || cid.startsWith("bafy"))) {
            return cid;
        }
    } catch (error: any) {
        console.log("   web3.storage failed:", error.message);
        return null;
    }
    
    return null;
}

/**
 * Main function to upload file to IPFS
 * @param filePath Path to file to upload
 * @returns CID or null if upload failed
 */
async function uploadToIPFS(filePath: string): Promise<string | null> {
    if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    console.log(`\n[INFO] Uploading to IPFS: ${filePath}\n`);

    // Try HTTP API first (fastest if daemon is running)
    if (isIPFSDaemonRunning()) {
        const httpCid = await uploadViaHTTPAPI(filePath);
        if (httpCid) {
            return httpCid;
        }
    }

    // Try CLI
    const cliCid = await uploadViaCLI(filePath);
    if (cliCid) {
        return cliCid;
    }

    // Try web3.storage (if token is set)
    const web3Cid = await uploadViaWeb3Storage(filePath);
    if (web3Cid) {
        return web3Cid;
    }

    throw new Error("All IPFS upload methods failed. Please ensure IPFS is running or configure web3.storage token.");
}

async function main() {
    // Try environment variable first
    let filePath = process.env.WHITELIST_JSON || process.env.FILE_PATH;
    
    // If not in env, try to parse from argv
    if (!filePath) {
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
            !arg.includes("uploadToIPFS") &&
            !arg.endsWith(".ts")
        );

        if (filteredArgs.length > 0) {
            filePath = filteredArgs[0];
        }
    }

    if (!filePath) {
        console.error("[ERROR] File path is required\n");
        console.error("Usage (method 1 - environment variable):");
        console.error("  WHITELIST_JSON=whitelist-merkle-ipfs.json npx hardhat run scripts/uploadToIPFS.ts\n");
        console.error("Usage (method 2 - direct argument):");
        console.error("  npx hardhat run scripts/uploadToIPFS.ts whitelist-merkle-ipfs.json\n");
        console.error("Setup Instructions:");
        console.error("  1. Start IPFS daemon: npx ipfs daemon (in a separate terminal)");
        console.error("  2. Or install IPFS CLI: https://docs.ipfs.io/install/");
        console.error("  3. Or set WEB3_STORAGE_TOKEN environment variable for web3.storage\n");
        process.exit(1);
    }

    // Resolve relative paths
    if (!filePath.startsWith("/")) {
        filePath = join(process.cwd(), filePath);
    }

    try {
        const cid = await uploadToIPFS(filePath);
        
        if (!cid) {
            throw new Error("Upload failed - no CID returned");
        }

        console.log(`\n[SUCCESS] Upload successful!\n`);
        console.log(`[DETAILS]`);
        console.log(`   File: ${filePath}`);
        console.log(`   CID: ${cid}`);
        console.log(`   IPFS URL: https://ipfs.io/ipfs/${cid}`);
        console.log(`   Gateway URL: https://gateway.ipfs.io/ipfs/${cid}\n`);
        console.log(`[NEXT STEPS]`);
        console.log(`   1. Use this CID in setWhitelistCID() function:`);
        console.log(`      await auctionContract.setWhitelistCID("${cid}");`);
        console.log(`   2. Or call it via PresaleManager if you have owner access\n`);
        
        return cid;
    } catch (error: any) {
        console.error(`[ERROR] ${error.message}\n`);
        console.error("Troubleshooting:");
        console.error("  1. Make sure IPFS daemon is running: npx ipfs daemon");
        console.error("  2. Or install IPFS CLI globally: npm install -g ipfs");
        console.error("  3. Or use web3.storage: set WEB3_STORAGE_TOKEN environment variable\n");
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

export { uploadToIPFS };

