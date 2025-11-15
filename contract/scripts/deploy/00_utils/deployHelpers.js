import fs from "node:fs";
import path from "node:path";

import hardhat from "hardhat";

import { DEPLOYMENT_OUTPUT_PATHS } from "./constants.js";

const HEADER_BAR = "=".repeat(64);

export function logHeader(message) {
  console.log("\n" + HEADER_BAR);
  console.log(message);
  console.log(HEADER_BAR);
}

export function logInfo(message) {
  console.log(`• ${message}`);
}

export async function deployContract(contractName, constructorArgs = [], options = {}) {
  const { label = contractName, txOverrides = {} } = options;
  logInfo(`Deploying ${label}...`);

  const factory = await hardhat.ethers.getContractFactory(contractName);
  const deployArgs = Array.isArray(constructorArgs) ? [...constructorArgs] : [constructorArgs];
  if (txOverrides && Object.keys(txOverrides).length > 0) {
    deployArgs.push(txOverrides);
  }

  const contract = await factory.deploy(...deployArgs);
  await contract.waitForDeployment();

  logInfo(`${label} deployed at ${contract.target}`);
  return contract;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadDeploymentFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { entries: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = raw ? JSON.parse(raw) : { entries: [] };
    if (!Array.isArray(parsed.entries)) {
      parsed.entries = [];
    }
    return parsed;
  } catch (error) {
    throw new Error(`Unable to parse deployment file at ${filePath}: ${error.message}`);
  }
}

function persistEntry(filePath, entry, { append = true } = {}) {
  ensureDirectory(path.dirname(filePath));

  if (append) {
    const data = loadDeploymentFile(filePath);
    data.entries.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } else {
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  logInfo(`Saved deployment graph → ${path.relative(process.cwd(), filePath)}`);
}

export function persistDeploymentGraph(tag, deployments, metadata = {}) {
  if (!tag) throw new Error("persistDeploymentGraph requires a tag identifier");

  const entry = {
    tag,
    timestamp: new Date().toISOString(),
    ...metadata,
    deployments,
  };

  if (DEPLOYMENT_OUTPUT_PATHS.latest) {
    persistEntry(DEPLOYMENT_OUTPUT_PATHS.latest, entry, { append: false });
  }

  return entry;
}
