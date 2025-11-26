import fs from "node:fs";
import path from "node:path";

import { ethers, network } from "hardhat";

type AddressBook = Record<string, Record<string, string>>;
type DeploymentEntry = {
  managerImpl: string;
  publicFactory: string | null;
  auctionFactory: string | null;
  upkeepController: string | null;
  lbpOracle: string | null;
};
type DeploymentsData = {
  entries: DeploymentEntry[];
};

const addressFiles = [
  path.resolve(__dirname, "..", "..", "client", "src", "abi", "addresses.json"),
  path.resolve(__dirname, "..", "..", "client", "public", "abi", "addresses.json")
];

const deploymentsFile = path.resolve(__dirname, "..", "..", "client", "src", "abi", "data", "stppDeployments.json");

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

function readDeploymentsData(): DeploymentsData {
  if (!fs.existsSync(deploymentsFile)) {
    return { entries: [] };
  }
  try {
    const raw = fs.readFileSync(deploymentsFile, "utf8");
    return raw ? (JSON.parse(raw) as DeploymentsData) : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function writeDeploymentsData(data: DeploymentsData) {
  fs.mkdirSync(path.dirname(deploymentsFile), { recursive: true });
  fs.writeFileSync(deploymentsFile, JSON.stringify(data, null, 2));
}

function updateLatestDeployment(updates: Partial<DeploymentEntry>) {
  const deployments = readDeploymentsData();
  if (deployments.entries.length === 0) {
    // Створюємо новий запис, якщо немає існуючих
    deployments.entries.push({
      managerImpl: "",
      publicFactory: null,
      auctionFactory: null,
      upkeepController: null,
      lbpOracle: null,
      ...updates
    });
  } else {
    // Оновлюємо останній запис
    const latestIndex = deployments.entries.length - 1;
    deployments.entries[latestIndex] = {
      ...deployments.entries[latestIndex],
      ...updates
    };
  }
  writeDeploymentsData(deployments);
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
  const book = readAddressBook();
  const keys = await resolveAddressKeys();
  if (keys.length === 0) {
    throw new Error("Unable to determine network key for address book");
  }
  const primaryKey = keys[0];
  const previouslyDeployed = book[primaryKey] || {};
  const managerImpl = process.env.MANAGER_IMPL || previouslyDeployed.presaleManagerImpl;

  if (!managerImpl) {
    throw new Error("Missing PresaleManager implementation. Set MANAGER_IMPL or deploy it first.");
  }

  console.log(`🌐 Network: ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`🔗 Using PresaleManager implementation: ${managerImpl}`);

  const Factory = await ethers.getContractFactory("PublicPresaleFactory");
  const factory = await Factory.deploy(managerImpl);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ PublicPresaleFactory deployed at ${factoryAddress}`);

  for (const key of keys) {
    book[key] = {
      ...(book[key] || {}),
      presaleManagerImpl: managerImpl,
      publicPresaleFactory: factoryAddress,
    };
  }
  writeAddressBook(book);

  // Оновлюємо deployments.json
  updateLatestDeployment({ managerImpl, publicFactory: factoryAddress });

  console.log(`📝 Addresses updated at ${getPrimaryAddressPath()}`);
  console.log(`📝 Deployments updated at ${deploymentsFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
