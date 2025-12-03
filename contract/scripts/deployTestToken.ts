import fs from "node:fs";
import path from "node:path";

import { ethers, network } from "hardhat";

type AddressBook = Record<string, Record<string, string>>;

const addressFiles = [
  path.resolve(__dirname, "..", "..", "client", "src", "abi", "addresses.json"),
  path.resolve(__dirname, "..", "..", "client", "public", "abi", "addresses.json")
];

function getPrimaryAddressPath() {
  return addressFiles[0];
}

function readAddressBook(): AddressBook {
  const file = addressFiles[0];
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw ? (JSON.parse(raw) as AddressBook) : {};
  } catch {
    return {};
  }
}

function writeAddressBook(book: AddressBook) {
  for (const file of addressFiles) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(book, null, 2));
  }
}

async function resolveAddressKeys(): Promise<string[]> {
  const keys = new Set<string>();
  if (network.config.chainId) {
    keys.add(network.config.chainId.toString());
  }
  try {
    const providerNetwork = await ethers.provider.getNetwork();
    if (providerNetwork.chainId) {
      keys.add(providerNetwork.chainId.toString());
    }
  } catch {
    // best-effort only
  }
  if (network.name) {
    keys.add(network.name);
  }
  return [...keys];
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`🌐 Network: ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);

  const TestToken = await ethers.getContractFactory("TestToken");
  const initialSupply = ethers.parseEther("1000000");
  const token = await TestToken.deploy(initialSupply);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`✅ TestToken deployed at ${tokenAddress}`);

  // Transfer tokens to owner wallet (0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec)
  const ownerAddress = "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec";
  console.log(`\n💰 Transferring tokens to owner wallet: ${ownerAddress}`);
  try {
    const transferTx = await token.transfer(ownerAddress, initialSupply);
    await transferTx.wait();
    const ownerBalance = await token.balanceOf(ownerAddress);
    console.log(`✅ Successfully transferred ${ethers.formatEther(ownerBalance)} tokens to owner wallet`);
  } catch (error) {
    console.error(`❌ Failed to transfer tokens to owner wallet:`, error);
    // Don't fail the deployment if transfer fails - user can do it manually
    console.log(`⚠️  You may need to transfer tokens manually to ${ownerAddress}`);
  }

  const book = readAddressBook();
  const keys = await resolveAddressKeys();
  if (keys.length === 0) {
    throw new Error("Unable to determine network key for address book");
  }
  for (const key of keys) {
    book[key] = {
      ...(book[key] || {}),
      testToken: tokenAddress
    };
  }
  writeAddressBook(book);
  console.log(`📝 Addresses updated at ${getPrimaryAddressPath()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
