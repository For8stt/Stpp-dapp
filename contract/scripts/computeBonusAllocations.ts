/**
 * @title Compute Bonus Allocations
 * @notice Off-chain script to compute proportional bonus allocations for early participants
 * @dev This script reads on-chain auction data, computes fair bonus distribution,
 *      and generates a Merkle tree with proofs for on-chain verification.
 * 
 * IMPORTANT: This script is NOT trusted. All results are verified on-chain via Merkle proofs.
 * The protocol remains decentralized - anyone can run this script and verify the results.
 */

import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const BPS_DENOMINATOR = 10_000n;

interface BonusAllocation {
    address: string;
    allocatedQty: bigint;
    requestedBonus: bigint;
    finalBonus: bigint;
    merkleProof: string[];
}

interface BonusOutput {
    merkleRoot: string;
    allocations: Record<string, {
        bonusQty: string;
        merkleProof: string[];
    }>;
    summary: {
        totalEarlyParticipants: number;
        totalRequestedBonus: string;
        totalFinalBonus: string;
        scalingFactor: string;
        bonusReserve: string;
    };
    ipfsCID?: string; // IPFS Content Identifier for allocations JSON
}

/**
 * Builds a Merkle tree from leaves and returns root + proofs
 * Uses sorted pairs for deterministic tree construction
 */
function buildMerkleTree(leaves: string[]): { root: string; proofs: Record<string, string[]> } {
    if (leaves.length === 0) {
        return { root: ethers.ZeroHash, proofs: {} };
    }

    const sortedLeaves = [...leaves].sort((a, b) => {
        return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
    });

    const layers: string[][] = [sortedLeaves];
    while (layers[layers.length - 1].length > 1) {
        const current = layers[layers.length - 1];
        const next: string[] = [];
        
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = i + 1 < current.length ? current[i + 1] : current[i];
            const [lo, hi] = BigInt(left) < BigInt(right) ? [left, right] : [right, left];
            next.push(ethers.keccak256(ethers.concat([lo, hi])));
        }
        
        layers.push(next);
    }

    const root = layers[layers.length - 1][0];
    const proofs: Record<string, string[]> = {};

    for (let leafIndex = 0; leafIndex < sortedLeaves.length; leafIndex++) {
        const proof: string[] = [];
        let index = leafIndex;
        
        for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
            const layer = layers[layerIndex];
            const pairIndex = index ^ 1;
            
            if (pairIndex < layer.length) {
                proof.push(layer[pairIndex]);
            } else {
                proof.push(layer[index]);
            }
            
            index = Math.floor(index / 2);
        }
        
        proofs[sortedLeaves[leafIndex]] = proof;
    }

    return { root, proofs };
}

/**
 * Computes leaf hash: keccak256(address, bonusQty)
 */
function computeLeaf(address: string, bonusQty: bigint): string {
    return ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [address, bonusQty]));
}

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
 * Uploads a file to local IPFS using HTTP API or CLI
 * Tries HTTP API first (more reliable), then falls back to CLI
 * @param filePath Path to the file to upload
 * @returns CID (Content Identifier) of the uploaded file, or null if IPFS unavailable
 */
async function uploadToIPFS(filePath: string): Promise<string | null> {
    if (!isIPFSDaemonRunning()) {
        console.warn("[WARNING] IPFS daemon is not running.");
        console.warn("   Please start it in a separate terminal: npx ipfs daemon");
        console.warn("   Then run this script again.");
        console.warn("   Continuing without IPFS upload...");
        return null;
    }

    try {
        const apiPort = getIPFSAPIPort();
        if (apiPort) {
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
            } catch (httpError: any) {
                console.log("   HTTP API failed, trying CLI...");
            }
        }
        try {
            const addOutput = execSync(`npx ipfs add --quiet "${filePath}"`, {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 30000,
            }).trim();
            const cid = addOutput.split(/\s+/)[0];
            if (cid && cid.length > 0 && (cid.startsWith("Qm") || cid.startsWith("bafy"))) {
                return cid;
            }
        } catch (npxError: any) {
            try {
                const addOutput = execSync(`ipfs add --quiet "${filePath}"`, {
                    encoding: "utf-8",
                    stdio: ["ignore", "pipe", "pipe"],
                    timeout: 30000,
                }).trim();
                
                const cid = addOutput.split(/\s+/)[0];
                if (cid && cid.length > 0 && (cid.startsWith("Qm") || cid.startsWith("bafy"))) {
                    return cid;
                }
            } catch (globalError: any) {
                throw new Error("All IPFS methods failed");
            }
        }
        
        throw new Error("Could not extract CID from IPFS output");
    } catch (error: any) {
        console.warn("  Warning: Could not upload to IPFS:", error.message);
        console.warn("   To enable IPFS upload:");
        console.warn("   1. Start IPFS daemon in a separate terminal: npx ipfs daemon");
        console.warn("   2. Make sure daemon API is accessible at http://127.0.0.1:5001");
        console.warn("   3. Then run this script again");
        console.warn("   Continuing without IPFS upload...");
        return null;
    }
}

/**
 * Main function to compute bonus allocations
 */
async function computeBonusAllocations(
    auctionAddress: string,
    outputPath?: string
): Promise<BonusOutput> {
    console.log(`\n[INFO] Computing bonus allocations for auction: ${auctionAddress}\n`);

    const auctionFactory = await ethers.getContractFactory("DutchAuction");
    const auction = auctionFactory.attach(auctionAddress);

    const earlyBonusPct = await auction.earlyBonusPct();
    const bonusReserve = await auction.bonusReserve();
    const bonusReserveRemaining = await auction.bonusReserveRemaining();
    const finalized = await auction.finalized();
    const successful = await auction.successful();

    console.log(`[INFO] Auction Configuration:`);
    console.log(`   Early Bonus %: ${earlyBonusPct} (${Number(earlyBonusPct) / 100}%)`);
    console.log(`   Bonus Reserve: ${ethers.formatEther(bonusReserve)} tokens`);
    console.log(`   Bonus Reserve Remaining: ${ethers.formatEther(bonusReserveRemaining)} tokens`);
    console.log(`   Finalized: ${finalized}`);
    console.log(`   Successful: ${successful}\n`);

    if (!finalized) {
        throw new Error("Auction must be finalized before computing bonuses");
    }

    if (!successful) {
        console.log("[WARNING] Auction was not successful - no bonuses to compute");
        return {
            merkleRoot: ethers.ZeroHash,
            allocations: {},
            summary: {
                totalEarlyParticipants: 0,
                totalRequestedBonus: "0",
                totalFinalBonus: "0",
                scalingFactor: "0",
                bonusReserve: bonusReserve.toString()
            }
        };
    }

    const earlyParticipantsCount = await auction.earlyParticipantsCount();
    console.log(`[INFO] Found ${earlyParticipantsCount} early participant(s)\n`);
    
    const earlyParticipants: string[] = [];
    for (let i = 0; i < earlyParticipantsCount; i++) {
        const participant = await auction.earlyParticipants(i);
        earlyParticipants.push(participant);
    }

    if (earlyParticipantsCount === 0 || earlyBonusPct === 0n || bonusReserveRemaining === 0n) {
        console.log("[WARNING] No early participants or bonus disabled - returning empty allocation");
        return {
            merkleRoot: ethers.ZeroHash,
            allocations: {},
            summary: {
                totalEarlyParticipants: 0,
                totalRequestedBonus: "0",
                totalFinalBonus: "0",
                scalingFactor: "0",
                bonusReserve: bonusReserve.toString()
            }
        };
    }

    const clearingTickIndex = await auction.clearingTickIndex();
    const clearingPrice = await auction.clearingPrice();
    const tokensSold = await auction.tokensSold();
    const totalQtyRevealed = await auction.totalQtyRevealed();
    const tokensForSale = await auction.tokensForSale();
    const proRataNumerator = await auction.proRataNumerator();
    const proRataDenominator = await auction.proRataDenominator();

    const computeBaseAllocation = async (account: string): Promise<bigint> => {
        const revealedBidsCount = await auction.revealedBidsCount(account);
        if (revealedBidsCount === 0n) {
            return 0n;
        }

        let allocated = 0n;

        for (let i = 0; i < Number(revealedBidsCount); i++) {
            const bid = await auction.revealedBids(account, i);
            const qty = typeof bid.qty === 'bigint' ? bid.qty : BigInt(bid.qty.toString());
            const priceTickIndex = typeof bid.priceTickIndex === 'bigint' ? bid.priceTickIndex : BigInt(bid.priceTickIndex.toString());
            
            let allocatedQty: bigint;

            if (tokensSold === totalQtyRevealed && totalQtyRevealed < tokensForSale) {
                allocatedQty = qty;
            } else if (priceTickIndex < clearingTickIndex) {
                allocatedQty = qty;
            } else if (priceTickIndex === clearingTickIndex) {
                if (proRataDenominator === 0n || proRataNumerator === 0n) {
                    allocatedQty = 0n;
                } else {
                    allocatedQty = (qty * proRataNumerator) / proRataDenominator;
                }
            } else {
                allocatedQty = 0n;
            }

            allocated += allocatedQty;
        }

        return allocated;
    };

    const computeEarlyAllocation = async (account: string): Promise<bigint> => {
        const revealedBidsCount = await auction.revealedBidsCount(account);
        if (revealedBidsCount === 0n) {
            return 0n;
        }

        let earlyAllocated = 0n;
        let totalBids = 0n;
        let earlyBids = 0n;

        for (let i = 0; i < Number(revealedBidsCount); i++) {
            const bid = await auction.revealedBids(account, i);
            totalBids++;
            const qty = typeof bid.qty === 'bigint' ? bid.qty : BigInt(bid.qty.toString());
            const priceTickIndex = typeof bid.priceTickIndex === 'bigint' ? bid.priceTickIndex : BigInt(bid.priceTickIndex.toString());
            const isEarly = bid.isEarly;
            
            console.log(`     Bid ${i}: qty=${ethers.formatEther(qty)}, isEarly=${isEarly}`);
            
            if (!isEarly) {
                console.log(`       Skipping non-early bid ${i}`);
                continue; // Skip non-early bids
            }
            
            earlyBids++;
            
            let allocatedQty: bigint;

            if (tokensSold === totalQtyRevealed && totalQtyRevealed < tokensForSale) {
                allocatedQty = qty;
            } else if (priceTickIndex < clearingTickIndex) {
                allocatedQty = qty;
            } else if (priceTickIndex === clearingTickIndex) {
                if (proRataDenominator === 0n || proRataNumerator === 0n) {
                    allocatedQty = 0n;
                } else {
                    allocatedQty = (qty * proRataNumerator) / proRataDenominator;
                }
            } else {
                allocatedQty = 0n;
            }

            console.log(`       Early bid ${i}: allocatedQty=${ethers.formatEther(allocatedQty)}`);
            earlyAllocated += allocatedQty;
        }

        console.log(`     Summary: totalBids=${totalBids}, earlyBids=${earlyBids}, earlyAllocated=${ethers.formatEther(earlyAllocated)}`);
        return earlyAllocated;
    };

    const allocations: BonusAllocation[] = [];
    let totalRequestedBonus = 0n;

    console.log(`[INFO] Computing allocations for early participants:\n`);

    for (const participant of earlyParticipants) {
        console.log(`   Computing early allocation for ${participant}...`);
        const earlyAllocatedQty = await computeEarlyAllocation(participant);
        
        if (earlyAllocatedQty === 0n) {
            console.log(`   ${participant}: 0 early allocated tokens, skipping`);
            continue;
        }

        let totalAllocatedQty: bigint;
        const allocationData = await auction.accountAllocations(participant);
        if (allocationData.computed) {
            totalAllocatedQty = allocationData.totalQty;
        } else {
            totalAllocatedQty = await computeBaseAllocation(participant);
        }

        const requestedBonus = (earlyAllocatedQty * earlyBonusPct) / BPS_DENOMINATOR;
        totalRequestedBonus += requestedBonus;

        allocations.push({
            address: participant,
            allocatedQty: earlyAllocatedQty, // Store early allocated qty for bonus calculation
            requestedBonus,
            finalBonus: 0n, // Will be computed after scaling
            merkleProof: []
        });

        console.log(`   ${participant}:`);
        console.log(`     Total Allocated: ${ethers.formatEther(totalAllocatedQty)} tokens`);
        console.log(`     Early Allocated: ${ethers.formatEther(earlyAllocatedQty)} tokens`);
        console.log(`     Requested Bonus: ${ethers.formatEther(requestedBonus)} tokens`);
    }

    console.log(`\n[INFO] Total Statistics:`);
    console.log(`   Total Requested Bonus: ${ethers.formatEther(totalRequestedBonus)} tokens`);
    console.log(`   Bonus Reserve: ${ethers.formatEther(bonusReserveRemaining)} tokens\n`);

    let scalingFactor = BPS_DENOMINATOR; // 100% = no scaling
    if (totalRequestedBonus > bonusReserveRemaining && totalRequestedBonus > 0n) {
        scalingFactor = (bonusReserveRemaining * BPS_DENOMINATOR) / totalRequestedBonus;
        console.log(`[INFO] Scaling required:`);
        console.log(`   Scaling Factor: ${Number(scalingFactor) / 100}%`);
        console.log(`   (Reserve insufficient - applying proportional scaling)\n`);
    } else {
        console.log(`[SUCCESS] No scaling needed - reserve sufficient\n`);
    }

    const leaves: string[] = [];
    const outputAllocations: Record<string, { bonusQty: string; merkleProof: string[] }> = {};

    for (const allocation of allocations) {
        const finalBonus = (allocation.requestedBonus * scalingFactor) / BPS_DENOMINATOR;
        allocation.finalBonus = finalBonus;

        const leaf = computeLeaf(allocation.address, finalBonus);
        leaves.push(leaf);

        outputAllocations[allocation.address.toLowerCase()] = {
            bonusQty: finalBonus.toString(),
            merkleProof: [] // Will be filled after tree construction
        };

        console.log(`   ${allocation.address}:`);
        console.log(`     Final Bonus: ${ethers.formatEther(finalBonus)} tokens`);
    }

    console.log(`\n[INFO] Building Merkle tree...\n`);
    const { root, proofs } = buildMerkleTree(leaves);

    for (const allocation of allocations) {
        const leaf = computeLeaf(allocation.address, allocation.finalBonus);
        const proof = proofs[leaf];
        
        if (!proof) {
            throw new Error(`Failed to generate proof for ${allocation.address}`);
        }

        outputAllocations[allocation.address.toLowerCase()].merkleProof = proof;
    }

    const totalFinalBonus = allocations.reduce((sum, a) => sum + a.finalBonus, 0n);

    const output: BonusOutput = {
        merkleRoot: root,
        allocations: outputAllocations,
        summary: {
            totalEarlyParticipants: allocations.length,
            totalRequestedBonus: totalRequestedBonus.toString(),
            totalFinalBonus: totalFinalBonus.toString(),
            scalingFactor: scalingFactor.toString(),
            bonusReserve: bonusReserveRemaining.toString()
        }
    };

    console.log(`[SUCCESS] Bonus computation complete!\n`);
    console.log(`[SUMMARY]`);
    console.log(`   Merkle Root: ${root}`);
    console.log(`   Total Early Participants: ${allocations.length}`);
    console.log(`   Total Final Bonus: ${ethers.formatEther(totalFinalBonus)} tokens`);
    console.log(`   Scaling Factor: ${Number(scalingFactor) / 100}%\n`);

    if (outputPath) {
        writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`[SUCCESS] Output written to: ${outputPath}\n`);
        console.log(`[INFO] Uploading to IPFS...\n`);
        const ipfsCID = await uploadToIPFS(outputPath);
        
        if (ipfsCID) {
            output.ipfsCID = ipfsCID;
            writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`[SUCCESS] Uploaded to IPFS successfully!`);
            console.log(`   CID: ${ipfsCID}`);
            console.log(`   IPFS URL: https://ipfs.io/ipfs/${ipfsCID}`);
            console.log(`   Gateway URL: https://gateway.ipfs.io/ipfs/${ipfsCID}\n`);
        } else {
            console.log(`[WARNING] IPFS upload skipped (IPFS not available)\n`);
        }
    }

    return output;
}

async function main() {
    let auctionAddress: string | undefined;
    let outputPath: string | undefined;
    auctionAddress = process.env.AUCTION_ADDRESS;
    if (!auctionAddress) {
        const scriptIndex = process.argv.findIndex(arg => arg.includes('computeBonusAllocations'));
        if (scriptIndex >= 0) {
            const remainingArgs = process.argv.slice(scriptIndex + 1);
            const filteredArgs = remainingArgs.filter(arg => 
                !arg.startsWith('--') && 
                arg !== 'localhost' && 
                arg !== 'hardhat' && 
                arg !== 'sepolia' && 
                arg !== 'goerli' && 
                arg !== 'mainnet' &&
                arg.startsWith('0x') // Address should start with 0x
            );
            if (filteredArgs.length > 0) {
                auctionAddress = filteredArgs[0];
                if (filteredArgs.length > 1) {
                    outputPath = filteredArgs[1];
                }
            }
        }
    }
    
    outputPath = outputPath || process.env.OUTPUT_PATH || join(process.cwd(), "bonus-allocations.json");
    
    if (!auctionAddress) {
        console.error("[ERROR] Auction address is required");
        console.error("");
        console.error("Usage (method 1 - environment variable):");
        console.error("  AUCTION_ADDRESS=0x... npx hardhat run scripts/computeBonusAllocations.ts --network localhost");
        console.error("");
        console.error("Usage (method 2 - as argument, but Hardhat may not support this):");
        console.error("  npx hardhat run scripts/computeBonusAllocations.ts --network localhost 0x...");
        console.error("");
        console.error("Example:");
        console.error("  AUCTION_ADDRESS=0x11Acc5dCc46A6B4Cbbf10dDf4FaEabC231F730bC npx hardhat run scripts/computeBonusAllocations.ts --network localhost");
        process.exit(1);
    }

    try {
        await computeBonusAllocations(auctionAddress, outputPath);
    } catch (error) {
        console.error("[ERROR] Computing bonus allocations:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

export { computeBonusAllocations, buildMerkleTree, computeLeaf };

