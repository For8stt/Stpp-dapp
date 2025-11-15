import path from "node:path";

const PROJECT_ROOT = process.cwd();

export const DEPLOY_DIR = path.join(PROJECT_ROOT, "scripts", "deploy");

export const DEPLOYMENT_OUTPUT_PATHS = Object.freeze({
  latest: path.join(DEPLOY_DIR, "deployments-latest.json"),
});

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const DEFAULT_PRICE_FEEDS = Object.freeze({
  mainnet: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419", // Chainlink ETH/USD
  sepolia: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Chainlink ETH/USD (testnet)
});

export const DEPLOYMENT_TAGS = Object.freeze({
  baseSystem: "permissionless-presale-base",
});
