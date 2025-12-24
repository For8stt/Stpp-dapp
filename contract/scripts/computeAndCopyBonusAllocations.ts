/**
 * @title Compute and Copy Bonus Allocations
 * @notice Automated script that computes bonus allocations and copies the result to frontend
 * @dev This script:
 *      1. Runs computeBonusAllocations.ts to generate bonus-allocations.json
 *      2. Automatically copies the file to client/public/bonus-allocations/{auctionAddress}.json
 * 
 * Usage:
 *   AUCTION_ADDRESS=0x... npx hardhat run scripts/computeAndCopyBonusAllocations.ts --network localhost
 */

import { execSync } from "child_process";
import { readFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
// AUCTION_ADDRESS=0x99B21f3d076611b7750CcDB56fBFC9BC4003d7a1 npx hardhat run scripts/computeAndCopyBonusAllocations.ts --network localhost
async function main() {
    // Get auction address from environment variable
    const auctionAddress = process.env.AUCTION_ADDRESS;
    
    if (!auctionAddress) {
        console.error("❌ Error: AUCTION_ADDRESS environment variable is required");
        console.error("");
        console.error("Usage:");
        console.error("  AUCTION_ADDRESS=0x... npx hardhat run scripts/computeAndCopyBonusAllocations.ts --network localhost");
        console.error("");
        console.error("Example:");
        console.error("  AUCTION_ADDRESS=0x99B21f3d076611b7750CcDB56fBFC9BC4003d7a1 npx hardhat run scripts/computeAndCopyBonusAllocations.ts --network localhost");
        process.exit(1);
    }

    // Validate address format
    if (!auctionAddress.startsWith("0x") || auctionAddress.length !== 42) {
        console.error(`❌ Error: Invalid auction address format: ${auctionAddress}`);
        console.error("   Address must be a valid Ethereum address (0x followed by 40 hex characters)");
        process.exit(1);
    }

    console.log(`\n🚀 Starting bonus allocation computation for auction: ${auctionAddress}\n`);

    // Paths
    const contractDir = process.cwd(); // contract directory
    const clientDir = join(contractDir, "..", "client");
    const sourceFile = join(contractDir, "bonus-allocations.json");
    const targetDir = join(clientDir, "public", "bonus-allocations");
    const targetFile = join(targetDir, `${auctionAddress.toLowerCase()}.json`);

    try {
        // Step 1: Run computeBonusAllocations.ts
        console.log("📊 Step 1: Computing bonus allocations...\n");
        
        // Determine network from process.argv or use localhost as default
        let network = "localhost";
        const networkIndex = process.argv.indexOf("--network");
        if (networkIndex >= 0 && process.argv[networkIndex + 1]) {
            network = process.argv[networkIndex + 1];
        }
        
        // Set AUCTION_ADDRESS for the child process
        process.env.AUCTION_ADDRESS = auctionAddress;
        
        // Run the computeBonusAllocations script
        execSync(
            `npx hardhat run scripts/computeBonusAllocations.ts --network ${network}`,
            {
                stdio: "inherit",
                cwd: contractDir,
                env: {
                    ...process.env,
                    AUCTION_ADDRESS: auctionAddress
                }
            }
        );

        // Step 2: Check if source file was created
        if (!existsSync(sourceFile)) {
            console.error(`\n❌ Error: Source file not found: ${sourceFile}`);
            console.error("   The computeBonusAllocations script may have failed or produced no allocations.");
            process.exit(1);
        }

        console.log(`\n✅ Bonus allocations computed successfully!`);
        console.log(`   Source file: ${sourceFile}\n`);

        // Step 3: Read and validate the JSON file
        console.log("📖 Step 2: Reading generated file...");
        const bonusData = JSON.parse(readFileSync(sourceFile, "utf-8"));
        
        // Validate structure
        if (!bonusData.merkleRoot) {
            console.warn("⚠️  Warning: No merkleRoot found in generated file");
        }
        if (!bonusData.allocations || Object.keys(bonusData.allocations).length === 0) {
            console.warn("⚠️  Warning: No allocations found in generated file");
        } else {
            console.log(`   Found ${Object.keys(bonusData.allocations).length} allocation(s)`);
        }

        // Step 4: Create target directory if it doesn't exist
        console.log("\n📁 Step 3: Preparing target directory...");
        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
            console.log(`   Created directory: ${targetDir}`);
        } else {
            console.log(`   Directory exists: ${targetDir}`);
        }

        // Step 5: Copy file to target location
        console.log("\n📋 Step 4: Copying file to frontend...");
        copyFileSync(sourceFile, targetFile);
        console.log(`   ✅ File copied successfully!`);
        console.log(`   Target file: ${targetFile}\n`);

        // Step 6: Summary
        console.log("🎉 Success! Bonus allocations file is ready for frontend use.\n");
        console.log("📊 Summary:");
        console.log(`   Auction Address: ${auctionAddress}`);
        console.log(`   Merkle Root: ${bonusData.merkleRoot || "N/A"}`);
        console.log(`   Allocations: ${Object.keys(bonusData.allocations || {}).length}`);
        if (bonusData.summary) {
            console.log(`   Total Final Bonus: ${bonusData.summary.totalFinalBonus || "0"}`);
        }
        console.log(`   Frontend File: ${targetFile}\n`);

    } catch (error: any) {
        console.error("\n❌ Error during bonus allocation computation:");
        if (error.message) {
            console.error(`   ${error.message}`);
        } else {
            console.error(`   ${error}`);
        }
        
        if (error.stderr) {
            console.error("\n   stderr:", error.stderr.toString());
        }
        
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

export { main };

