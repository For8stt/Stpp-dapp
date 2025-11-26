import fs from "node:fs";
import path from "node:path";

import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`🌐 Network: ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);

  // Deploy PresaleManager implementation
  console.log("\n📦 Deploying PresaleManager implementation...");
  const PresaleManager = await ethers.getContractFactory("PresaleManager");
  const manager = await PresaleManager.deploy();
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();
  console.log(`✅ PresaleManager implementation deployed at ${managerAddress}`);

  // Deploy PublicPresaleFactory
  console.log("\n🏭 Deploying PublicPresaleFactory...");
  const Factory = await ethers.getContractFactory("PublicPresaleFactory");
  const factory = await Factory.deploy(managerAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ PublicPresaleFactory deployed at ${factoryAddress}`);

  // Deploy TestToken
  console.log("\n🪙 Deploying TestToken...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const initialSupply = ethers.parseEther("1000000");
  const token = await TestToken.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`✅ TestToken deployed at ${tokenAddress}`);

  // Update deployment files
  const deploymentsFile = path.resolve(__dirname, "..", "..", "client", "src", "abi", "data", "stppDeployments.json");
  const addressesFileSrc = path.resolve(__dirname, "..", "..", "client", "src", "abi", "addresses.json");
  const addressesFilePublic = path.resolve(__dirname, "..", "..", "client", "public", "abi", "addresses.json");

  // Update stppDeployments.json
  const deployments = {
    entries: [{
      managerImpl: managerAddress,
      publicFactory: factoryAddress,
      auctionFactory: null,
      upkeepController: null,
      lbpOracle: null
    }]
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));

  // Update addresses.json files (both src and public)
  const networkId = network.config.chainId?.toString() || "31337";
  const addressMappings = {
    presaleManagerImpl: managerAddress,
    publicPresaleFactory: factoryAddress,
    testToken: tokenAddress
  };

  const addressesFiles = [addressesFileSrc, addressesFilePublic];

  for (const addressesFile of addressesFiles) {
    const addresses = fs.existsSync(addressesFile) ? JSON.parse(fs.readFileSync(addressesFile, 'utf8')) || {} : {};

    // Update with both numeric chainId and network name for compatibility
    addresses[networkId] = addressMappings;
    addresses[network.name] = addressMappings;

    fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2));
  }

  console.log("\n📝 Deployment files updated!");
  console.log("🎉 All contracts deployed successfully!");
  console.log("\nAddresses:");
  console.log(`  PresaleManager: ${managerAddress}`);
  console.log(`  PublicFactory:  ${factoryAddress}`);
  console.log(`  TestToken:      ${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
