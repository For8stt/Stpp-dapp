import hardhat from "hardhat";

import { DEFAULT_PRICE_FEEDS } from "./constants.js";

const TRUE_LITERALS = new Set(["1", "true", "yes", "y", "on"]);
const FALSE_LITERALS = new Set(["0", "false", "no", "n", "off"]);

function parseBoolean(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_LITERALS.has(normalized)) return true;
  if (FALSE_LITERALS.has(normalized)) return false;
  return undefined;
}

function boolFromEnv(envKey, fallback, overrideValue) {
  if (typeof overrideValue === "boolean") return overrideValue;
  const parsed = parseBoolean(process.env[envKey]);
  if (typeof parsed === "boolean") return parsed;
  return fallback;
}

const { network } = hardhat;

export function getDeploymentConfig(overrides = {}) {
  const resolvedNetwork =
    overrides.networkName || process.env.STTP_NETWORK || (network ? network.name : undefined) || "hardhat";

  const config = {
    networkName: resolvedNetwork,
    deployAuctionFactory: boolFromEnv("STTP_DEPLOY_AUCTION_FACTORY", false, overrides.deployAuctionFactory),
    deployUpkeepController: boolFromEnv("STTP_DEPLOY_UPKEEP_CONTROLLER", false, overrides.deployUpkeepController),
    deployLBPOracle: boolFromEnv("STTP_DEPLOY_LBP_ORACLE", false, overrides.deployLBPOracle),
    priceFeedAddress:
      overrides.priceFeedAddress ||
      process.env.STTP_LBP_PRICE_FEED ||
      DEFAULT_PRICE_FEEDS[resolvedNetwork] ||
      null,
  };

  if (config.deployLBPOracle && !config.priceFeedAddress) {
    throw new Error(
      "LBP oracle deployment requested but no Chainlink price feed was provided. Set STTP_LBP_PRICE_FEED or override in getDeploymentConfig()."
    );
  }

  return config;
}
