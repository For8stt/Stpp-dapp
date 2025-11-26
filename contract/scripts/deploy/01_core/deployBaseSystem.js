import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hardhat from "hardhat";

import { getDeploymentConfig } from "../00_utils/config.js";
import { DEPLOYMENT_TAGS } from "../00_utils/constants.js";
import { deployContract, logHeader, logInfo, persistDeploymentGraph } from "../00_utils/deployHelpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTRACT_ROOT = path.resolve(__dirname, "..", "..", "..");
const FRONTEND_SRC = path.resolve(CONTRACT_ROOT, "..", "client", "src");

async function main() {
  logHeader(" Deploying Permissionless Presale Base System");

  const deploymentConfig = getDeploymentConfig();
  const [deployer] = await hardhat.ethers.getSigners();
  const networkInfo = await deployer.provider.getNetwork();
  const chainId = Number(networkInfo.chainId);

  logInfo(`Network: ${deploymentConfig.networkName} (chainId ${chainId})`);
  logInfo(`Deployer: ${deployer.address}`);

  const deploymentGraph = {
    managerImpl: null,
    publicFactory: null,
    auctionFactory: null,
    upkeepController: null,
    lbpOracle: null,
  };

  const managerImpl = await deployContract("PresaleManager", [], {
    label: "PresaleManager implementation",
  });
  deploymentGraph.managerImpl = managerImpl.target;

  const publicFactory = await deployContract("PublicPresaleFactory", [managerImpl.target], {
    label: "PublicPresaleFactory",
  });
  deploymentGraph.publicFactory = publicFactory.target;

  if (deploymentConfig.deployAuctionFactory) {
    const auctionFactory = await deployContract("AuctionFactory", [managerImpl.target], {
      label: "AuctionFactory",
    });
    deploymentGraph.auctionFactory = auctionFactory.target;
    logInfo("AuctionFactory ownership initialized to manager implementation");
  } else {
    logInfo("Skipping AuctionFactory deployment (config override)");
  }

  if (deploymentConfig.deployUpkeepController) {
    const upkeepController = await deployContract("UpkeepController", [managerImpl.target], {
      label: "UpkeepController",
    });
    deploymentGraph.upkeepController = upkeepController.target;
  } else {
    logInfo("Skipping UpkeepController deployment (config override)");
  }

  if (deploymentConfig.deployLBPOracle) {
    const lbpOracle = await deployContract("LBPOracle", [deploymentConfig.priceFeedAddress], {
      label: "LBPOracle",
    });
    deploymentGraph.lbpOracle = lbpOracle.target;
  } else {
    logInfo("Skipping LBPOracle deployment (config override)");
  }

  logHeader(" Base system contracts deployed");
  console.table(deploymentGraph);

  persistDeploymentGraph(DEPLOYMENT_TAGS.baseSystem, deploymentGraph, {
    network: deploymentConfig.networkName,
    chainId,
    deployer: deployer.address,
  });

  await exportFrontendArtifacts(deploymentGraph);
  logInfo("Frontend artifacts exported successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export default main;

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return defaultValue;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    logInfo(`Unable to parse ${path.relative(process.cwd(), filePath)} (${error.message}). Using default.`);
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const CONTRACT_ARTIFACTS = {
  PresaleManager: ["contracts", "manager", "PresaleManager.sol", "PresaleManager.json"],
  PublicPresaleFactory: ["contracts", "manager", "PublicPresaleFactory.sol", "PublicPresaleFactory.json"],
  AuctionFactory: ["contracts", "manager", "AuctionFactory.sol", "AuctionFactory.json"],
  UpkeepController: ["contracts", "manager", "UpkeepController.sol", "UpkeepController.json"],
  LBPOracle: ["contracts", "core", "lbp", "LBPOracle.sol", "LBPOracle.json"],
};

async function exportFrontendArtifacts(deploymentGraph) {
  const abiDir = path.join(FRONTEND_SRC, "abi");
  ensureDirectory(abiDir);
  const dataDir = path.join(abiDir, "data");
  ensureDirectory(dataDir);

  const deploymentOutputPath = path.join(dataDir, "stppDeployments.json");
  const defaultData = { entries: [] };
  const existingData = readJsonFile(deploymentOutputPath, defaultData);
  if (!Array.isArray(existingData.entries)) {
    existingData.entries = [];
  }
  existingData.entries.push({ ...deploymentGraph });
  writeJsonFile(deploymentOutputPath, existingData);

  const contracts = [
    { name: "PresaleManager", address: deploymentGraph.managerImpl },
    { name: "PublicPresaleFactory", address: deploymentGraph.publicFactory },
    { name: "AuctionFactory", address: deploymentGraph.auctionFactory },
    { name: "UpkeepController", address: deploymentGraph.upkeepController },
    { name: "LBPOracle", address: deploymentGraph.lbpOracle },
  ];

  for (const { name } of contracts) {
    const artifactSegments = CONTRACT_ARTIFACTS[name];
    const artifactPath = artifactSegments
      ? path.join(CONTRACT_ROOT, "artifacts", ...artifactSegments)
      : path.join(CONTRACT_ROOT, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
    let abi = [];
    if (fs.existsSync(artifactPath)) {
      const artifact = readJsonFile(artifactPath, {});
      if (Array.isArray(artifact?.abi)) {
        abi = artifact.abi;
      }
    } else {
      logInfo(`Artifact not found for ${name}; exporting empty ABI.`);
    }

    const abiOutputPath = path.join(abiDir, `${name}.json`);
    writeJsonFile(abiOutputPath, { abi });
    logInfo(`Exported ABI for ${name} → ${path.relative(CONTRACT_ROOT, abiOutputPath)}`);
  }

  // Update addresses.json files
  await updateAddressesJson(deploymentGraph);
}

async function updateAddressesJson(deploymentGraph) {
  const network = await hardhat.ethers.provider.getNetwork();
  const networkId = network.chainId.toString();

  // Address mappings for the JSON structure
  const addressMappings = {
    presaleManagerImpl: deploymentGraph.managerImpl,
    publicPresaleFactory: deploymentGraph.publicFactory,
    auctionFactory: deploymentGraph.auctionFactory,
    upkeepController: deploymentGraph.upkeepController,
    lbpOracle: deploymentGraph.lbpOracle,
  };

  // Remove null values to keep the JSON clean
  Object.keys(addressMappings).forEach(key => {
    if (addressMappings[key] === null) {
      delete addressMappings[key];
    }
  });

  // Update both addresses.json files
  const addressesFiles = [
    path.join(FRONTEND_SRC, "abi", "addresses.json"),
    path.join(FRONTEND_SRC, "..", "public", "abi", "addresses.json")
  ];

  for (const addressesFile of addressesFiles) {
    let addressesData = {};
    if (fs.existsSync(addressesFile)) {
      addressesData = readJsonFile(addressesFile, {});
    }

    // Update the network entry (use both numeric and string keys for compatibility)
    addressesData[networkId] = addressMappings;
    // Also update "localhost" for hardhat network
    if (networkId === "31337") {
      addressesData["localhost"] = addressMappings;
    }

    writeJsonFile(addressesFile, addressesData);
    logInfo(`Updated addresses.json → ${path.relative(CONTRACT_ROOT, addressesFile)}`);
  }
}
