import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n" + "=".repeat(80));
  console.log("🚀 Deploying Uniswap V3 Mocks for Localhost");
  console.log("=".repeat(80));
  console.log(`🌐 Network: ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Deploy MockUniswapV3Factory
  console.log("📦 Deploying MockUniswapV3Factory...");
  const MockFactory = await ethers.getContractFactory("MockUniswapV3Factory");
  const factory = await MockFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ MockUniswapV3Factory deployed to: ${factoryAddress}`);

  // Deploy MockNonfungiblePositionManager
  console.log("\n📦 Deploying MockNonfungiblePositionManager...");
  const MockPositionManager = await ethers.getContractFactory("MockNonfungiblePositionManager");
  const positionManager = await MockPositionManager.deploy();
  await positionManager.waitForDeployment();
  const positionManagerAddress = await positionManager.getAddress();
  console.log(`✅ MockNonfungiblePositionManager deployed to: ${positionManagerAddress}`);

  // Deploy MockWETH9
  console.log("\n📦 Deploying MockWETH9...");
  const MockWETH = await ethers.getContractFactory("MockWETH9");
  const weth = await MockWETH.deploy();
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log(`✅ MockWETH9 deployed to: ${wethAddress}`);

  // Save addresses
  const addressesFile = path.resolve(__dirname, "../../client/src/abi/uniswapV3Addresses.json");
  const addresses = {
    [network.config.chainId?.toString() || "31337"]: {
      factory: factoryAddress,
      positionManager: positionManagerAddress,
      weth: wethAddress
    }
  };

  fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2));
  console.log(`\n📁 Addresses saved to: ${addressesFile}`);

  console.log("\n" + "=".repeat(80));
  console.log("🎉 Uniswap V3 Mocks Deployment Complete!");
  console.log("=".repeat(80));
  console.log("\n📋 Deployed Addresses:");
  console.log("─".repeat(80));
  console.log(`  Factory:            ${factoryAddress}`);
  console.log(`  Position Manager:    ${positionManagerAddress}`);
  console.log(`  WETH9:               ${wethAddress}`);
  console.log("─".repeat(80));
  console.log("\n💡 Use these addresses in the 'Uniswap V3 Configuration' section:");
  console.log(`   Factory:            ${factoryAddress}`);
  console.log(`   Position Manager:    ${positionManagerAddress}`);
  console.log(`   WETH9:               ${wethAddress}`);
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

