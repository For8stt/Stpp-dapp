import fs from "node:fs";
import path from "node:path";

import { ethers, network } from "hardhat";

// ============ TYPES ============
interface DeploymentAddresses {
  managerImpl: string;
  publicFactory: string;
  auctionFactory: string;
  upkeepController: string;
  secureLbpImpl: string;
  vestingImpl: string;
  lbpAmmImpl: string;
  feeOracle: string;
  testToken: string;
}

interface DeploymentConfig {
  entries: DeploymentAddresses[];
}

interface ArtifactFile {
  abi: any[];
  contractName?: string;
  [key: string]: any;
}

// ============ HELPER FUNCTIONS ============

/**
 * Ensures a directory exists, creating it if necessary
 */
function ensureDirectory(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 Created directory: ${dirPath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to create directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Loads ABI from Hardhat artifacts by contract name
 * Searches in artifacts/contracts directory structure
 */
function loadAbi(contractName: string): any {
  const artifactsDir = path.resolve(__dirname, "..", "artifacts", "contracts");
  
  // Map contract names to their artifact paths
  const contractPaths: Record<string, string[]> = {
    PresaleManager: ["manager", "PresaleManager.sol", "PresaleManager.json"],
    PublicPresaleFactory: ["manager", "PublicPresaleFactory.sol", "PublicPresaleFactory.json"],
    AuctionFactory: ["manager", "AuctionFactory.sol", "AuctionFactory.json"],
    UpkeepController: ["manager", "UpkeepController.sol", "UpkeepController.json"],
    DutchAuction: ["core", "auction", "DutchAuction.sol", "DutchAuction.json"],
    SecureLBP: ["core", "lbp", "SecureLBP.sol", "SecureLBP.json"],
    LBPWeightedAMM: ["core", "lbp", "WeightedAMM.sol", "LBPWeightedAMM.json"],
    TokenVestingEscrow: ["core", "vesting", "TokenVestingEscrow.sol", "TokenVestingEscrow.json"],
    LBPOracle: ["oracle", "LBPOracle.sol", "LBPOracle.json"],
    MockPriceFeed: ["mocks", "MockPriceFeed.sol", "MockPriceFeed.json"],
    TestToken: ["mocks", "TestToken.sol", "TestToken.json"],
  };

  const paths = contractPaths[contractName];
  if (!paths) {
    throw new Error(`Contract ${contractName} not found in artifact paths mapping`);
  }

  const artifactPath = path.resolve(artifactsDir, ...paths);
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact file not found: ${artifactPath}`);
  }

  try {
    const artifactContent = fs.readFileSync(artifactPath, "utf8");
    const artifact: ArtifactFile = JSON.parse(artifactContent);
    
    if (!artifact.abi || !Array.isArray(artifact.abi)) {
      throw new Error(`Invalid ABI in artifact: ${artifactPath}`);
    }

    return artifact.abi;
  } catch (error) {
    console.error(`Failed to load ABI for ${contractName} from ${artifactPath}:`, error);
    throw error;
  }
}

/**
 * Updates the allAbis.json file with collected ABIs
 */
function updateAllAbis(abis: Record<string, any>): void {
  const allAbisFile = path.resolve(
    __dirname,
    "..",
    "..",
    "client",
    "src",
    "abi",
    "allAbis.json"
  );

  ensureDirectory(path.dirname(allAbisFile));

  try {
    fs.writeFileSync(allAbisFile, JSON.stringify(abis, null, 2));
    console.log(`\n📝 Saved all ABIs to: ${allAbisFile}`);
  } catch (error) {
    console.error(`❌ Failed to write ${allAbisFile}:`, error);
    throw error;
  }
}

/**
 * Deploys a contract and waits for deployment
 */
async function deploy(
  contractName: string,
  constructorArgs: any[] = [],
  label?: string
): Promise<any> {
  const displayName = label || contractName;
  console.log(`\n📦 Deploying ${displayName}...`);
  
  try {
    const ContractFactory = await ethers.getContractFactory(contractName);
    const contract = await ContractFactory.deploy(...constructorArgs);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`✅ ${displayName} deployed at: ${address}`);
    return contract;
  } catch (error) {
    console.error(`❌ Failed to deploy ${displayName}:`, error);
    throw error;
  }
}

/**
 * Saves deployment addresses to stppDeployments.json
 */
function saveDeploymentJSON(addresses: DeploymentAddresses): void {
  const deploymentsFile = path.resolve(
    __dirname,
    "..",
    "..",
    "client",
    "src",
    "abi",
    "data",
    "stppDeployments.json"
  );

  ensureDirectory(path.dirname(deploymentsFile));

  const config: DeploymentConfig = {
    entries: [addresses],
  };

  try {
    fs.writeFileSync(deploymentsFile, JSON.stringify(config, null, 2));
    console.log(`\n📝 Saved deployment config to: ${deploymentsFile}`);
  } catch (error) {
    console.error(`❌ Failed to write ${deploymentsFile}:`, error);
    throw error;
  }
}

/**
 * Writes addresses to addresses.json (both src and public)
 */
function writeAddressesFile(addresses: DeploymentAddresses): void {
  const addressesFileSrc = path.resolve(
    __dirname,
    "..",
    "..",
    "client",
    "src",
    "abi",
    "addresses.json"
  );
  const addressesFilePublic = path.resolve(
    __dirname,
    "..",
    "..",
    "client",
    "public",
    "abi",
    "addresses.json"
  );

  ensureDirectory(path.dirname(addressesFileSrc));
  ensureDirectory(path.dirname(addressesFilePublic));

  const networkId = network.config.chainId?.toString() || "31337";
  const addressMappings: Record<string, string> = {
    presaleManagerImpl: addresses.managerImpl,
    publicPresaleFactory: addresses.publicFactory,
    auctionFactory: addresses.auctionFactory,
    upkeepController: addresses.upkeepController,
    secureLbpImpl: addresses.secureLbpImpl,
    vestingImpl: addresses.vestingImpl,
    lbpAmmImpl: addresses.lbpAmmImpl,
    feeOracle: addresses.feeOracle,
    testToken: addresses.testToken,
  };

  const addressesFiles = [addressesFileSrc, addressesFilePublic];

  for (const addressesFile of addressesFiles) {
    try {
      let addressesData: Record<string, any> = {};
      if (fs.existsSync(addressesFile)) {
        addressesData = JSON.parse(fs.readFileSync(addressesFile, "utf8")) || {};
      }

      // Update with both numeric chainId and network name for compatibility
      addressesData[networkId] = addressMappings;
      addressesData[network.name] = addressMappings;

      fs.writeFileSync(addressesFile, JSON.stringify(addressesData, null, 2));
      console.log(`📝 Updated addresses file: ${addressesFile}`);
    } catch (error) {
      console.error(`❌ Failed to write ${addressesFile}:`, error);
      throw error;
    }
  }
}

/**
 * Collects ABIs for all deployed contracts and saves them to allAbis.json
 */
function collectAndSaveAbis(): void {
  console.log("\n📚 Collecting ABIs from artifacts...");

  const abis: Record<string, any> = {};

  // Contract name mapping: artifact name -> JSON key name
  const contractMappings: Array<{ artifactName: string; jsonKey: string }> = [
    { artifactName: "PresaleManager", jsonKey: "PresaleManager" },
    { artifactName: "PublicPresaleFactory", jsonKey: "PublicPresaleFactory" },
    { artifactName: "AuctionFactory", jsonKey: "AuctionFactory" },
    { artifactName: "UpkeepController", jsonKey: "UpkeepController" },
    { artifactName: "DutchAuction", jsonKey: "DutchAuction" },
    { artifactName: "SecureLBP", jsonKey: "SecureLBP" },
    { artifactName: "LBPWeightedAMM", jsonKey: "LBPWeightedAMM" },
    { artifactName: "TokenVestingEscrow", jsonKey: "TokenVestingEscrow" },
    { artifactName: "LBPOracle", jsonKey: "FeeOracleMock" },
    { artifactName: "TestToken", jsonKey: "TestToken" },
  ];

  for (const mapping of contractMappings) {
    try {
      const abi = loadAbi(mapping.artifactName);
      abis[mapping.jsonKey] = abi;
      console.log(`  ✅ Loaded ABI for ${mapping.jsonKey}`);
    } catch (error) {
      console.error(`  ❌ Failed to load ABI for ${mapping.jsonKey}:`, error);
      throw error;
    }
  }

  updateAllAbis(abis);
  console.log(`\n✅ Successfully collected and saved ${Object.keys(abis).length} ABIs`);
}

/**
 * Prints deployment summary
 */
function printSummary(addresses: DeploymentAddresses): void {
  console.log("\n" + "=".repeat(80));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(80));
  console.log(`\n🌐 Network: ${network.name} (Chain ID: ${network.config.chainId || "31337"})`);
  
  console.log("\n📋 Deployed Contract Addresses:");
  console.log("─".repeat(80));
  console.log(`  PresaleManager Implementation: ${addresses.managerImpl}`);
  console.log(`  PublicPresaleFactory:         ${addresses.publicFactory}`);
  console.log(`  AuctionFactory:               ${addresses.auctionFactory}`);
  console.log(`  UpkeepController:             ${addresses.upkeepController}`);
  console.log(`  SecureLBP Implementation:     ${addresses.secureLbpImpl}`);
  console.log(`  TokenVestingEscrow Impl:      ${addresses.vestingImpl}`);
  console.log(`  LBPWeightedAMM Implementation: ${addresses.lbpAmmImpl}`);
  console.log(`  LBPOracle (Fee Oracle):       ${addresses.feeOracle}`);
  console.log(`  TestToken:                    ${addresses.testToken}`);
  console.log("─".repeat(80));

  console.log("\n📁 Configuration Files Updated:");
  console.log(`  ✓ client/src/abi/data/stppDeployments.json`);
  console.log(`  ✓ client/src/abi/addresses.json`);
  console.log(`  ✓ client/public/abi/addresses.json`);
  console.log(`  ✓ client/src/abi/allAbis.json`);

  console.log("\n🚀 Next Steps:");
  console.log("─".repeat(80));
  console.log("1. Start Hardhat node:");
  console.log("   npx hardhat node");
  console.log("\n2. Deploy to local network:");
  console.log("   npx hardhat run scripts/deployAll.ts --network localhost");
  console.log("\n3. Connect your frontend:");
  console.log("   - The UI will automatically read addresses from:");
  console.log("     • client/src/abi/data/stppDeployments.json");
  console.log("     • client/src/abi/addresses.json");
  console.log("   - ABIs are available in:");
  console.log("     • client/src/abi/allAbis.json");
  console.log("   - Make sure your wagmi config uses chainId:", network.config.chainId || 31337);
  console.log("\n4. To redeploy:");
  console.log("   npx hardhat run scripts/deployAll.ts --network <network>");
  console.log("=".repeat(80) + "\n");
}

// ============ MAIN DEPLOYMENT FUNCTION ============

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n" + "=".repeat(80));
  console.log("🚀 STPP Protocol Deployment");
  console.log("=".repeat(80));
  console.log(`🌐 Network: ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const addresses: Partial<DeploymentAddresses> = {};

  try {
    // 1. Deploy PresaleManager implementation
    const managerImpl = await deploy("PresaleManager", [], "PresaleManager Implementation");
    addresses.managerImpl = await managerImpl.getAddress();

    // 2. Deploy PublicPresaleFactory (uses PresaleManager implementation)
    const publicFactory = await deploy(
      "PublicPresaleFactory",
      [addresses.managerImpl],
      "PublicPresaleFactory"
    );
    addresses.publicFactory = await publicFactory.getAddress();

    // 3. Deploy AuctionFactory (owner is PresaleManager implementation)
    const auctionFactory = await deploy(
      "AuctionFactory",
      [addresses.managerImpl],
      "AuctionFactory"
    );
    addresses.auctionFactory = await auctionFactory.getAddress();

    // 4. Deploy UpkeepController (manager is PresaleManager implementation)
    const upkeepController = await deploy(
      "UpkeepController",
      [addresses.managerImpl],
      "UpkeepController"
    );
    addresses.upkeepController = await upkeepController.getAddress();

    // 5. Deploy MockPriceFeed for local testing (initial price: 2000 USD/ETH in 8 decimals)
    const mockPriceFeed = await deploy(
      "MockPriceFeed",
      [ethers.parseUnits("2000", 8)],
      "MockPriceFeed"
    );
    const mockPriceFeedAddress = await mockPriceFeed.getAddress();

    // 6. Deploy LBPOracle (Fee Oracle) using MockPriceFeed
    const lbpOracle = await deploy(
      "LBPOracle",
      [mockPriceFeedAddress],
      "LBPOracle (Fee Oracle)"
    );
    addresses.feeOracle = await lbpOracle.getAddress();

    // 7. Deploy TestToken (ERC20)
    const initialSupply = ethers.parseEther("1000000"); // 1M tokens
    const testToken = await deploy(
      "TestToken",
      [initialSupply],
      "TestToken"
    );
    addresses.testToken = await testToken.getAddress();

    // 8. Deploy SecureLBP implementation (with dummy parameters for frontend reference)
    // Note: Actual SecureLBP instances are deployed dynamically by PresaleManager
    // This is just a reference implementation for the frontend
    const now = BigInt(Math.floor(Date.now() / 1000));
    const dummyStartTime = now + BigInt(3600); // 1 hour from now
    const dummyEndTime = dummyStartTime + BigInt(86400); // 24 hours later
    const dummyTreasury = deployer.address;
    const dummyPoolStartWeight = ethers.parseEther("0.7"); // 70%
    const dummyPoolEndWeight = ethers.parseEther("0.3"); // 30%
    const dummyPoolSwapFee = ethers.parseEther("0.003"); // 0.3%

    const secureLbpImpl = await deploy(
      "SecureLBP",
      [
        addresses.testToken, // token
        dummyStartTime, // startTime
        dummyEndTime, // endTime
        dummyTreasury, // treasury
        dummyPoolStartWeight, // poolStartWeightToken
        dummyPoolEndWeight, // poolEndWeightToken
        dummyPoolSwapFee, // poolSwapFee
        ethers.ZeroAddress, // presaleManager (can be set later)
        ethers.ZeroAddress, // auction (can be set later)
      ],
      "SecureLBP Implementation"
    );
    addresses.secureLbpImpl = await secureLbpImpl.getAddress();

    // 9. Deploy TokenVestingEscrow implementation (with dummy parameters)
    // Note: Actual TokenVestingEscrow instances are deployed dynamically
    // This is just a reference implementation for the frontend
    const vestingImpl = await deploy(
      "TokenVestingEscrow",
      [
        addresses.testToken, // token
        addresses.secureLbpImpl, // secureLBP (dummy reference)
      ],
      "TokenVestingEscrow Implementation"
    );
    addresses.vestingImpl = await vestingImpl.getAddress();

    // 10. Deploy LBPWeightedAMM implementation (with dummy parameters)
    // Note: Actual LBPWeightedAMM pools are deployed dynamically by SecureLBP
    // This is just a reference implementation for the frontend
    const lbpAmmImpl = await deploy(
      "LBPWeightedAMM",
      [
        addresses.testToken, // token
        dummyPoolStartWeight, // startWeightToken
        dummyPoolEndWeight, // endWeightToken
        dummyStartTime, // startTime
        dummyEndTime, // endTime
        dummyPoolSwapFee, // swapFee
      ],
      "LBPWeightedAMM Implementation"
    );
    addresses.lbpAmmImpl = await lbpAmmImpl.getAddress();

    // Ensure all addresses are set
    const completeAddresses: DeploymentAddresses = {
      managerImpl: addresses.managerImpl!,
      publicFactory: addresses.publicFactory!,
      auctionFactory: addresses.auctionFactory!,
      upkeepController: addresses.upkeepController!,
      secureLbpImpl: addresses.secureLbpImpl!,
      vestingImpl: addresses.vestingImpl!,
      lbpAmmImpl: addresses.lbpAmmImpl!,
      feeOracle: addresses.feeOracle!,
      testToken: addresses.testToken!,
    };

    // Save deployment files
    saveDeploymentJSON(completeAddresses);
    writeAddressesFile(completeAddresses);

    // Collect and save all ABIs
    collectAndSaveAbis();

    // Print summary
    printSummary(completeAddresses);
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exitCode = 1;
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
