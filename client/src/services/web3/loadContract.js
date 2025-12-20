import { ethers } from "ethers";

import allAbis from "../../abi/allAbis.json";
import fallbackAddresses from "../../abi/addresses.json";
import { fetchAddressBook } from "./addressBook";
import { ensureProvider } from "./provider";

const ADDRESS_ALIASES = {
  PresaleManager: ["PresaleManager", "presaleManager", "presaleManagerImpl"],
  PublicPresaleFactory: ["PublicPresaleFactory", "publicPresaleFactory"],
  AuctionFactory: ["AuctionFactory", "auctionFactory"],
  UpkeepController: ["UpkeepController", "upkeepController"],
  LBPOracle: ["LBPOracle", "lbpOracle", "feeOracle"],
};

const resolveRegistry = (addresses, chainId) => {
  const source = addresses && typeof addresses === "object" ? addresses : fallbackAddresses;
  if (!chainId) {
    return source;
  }
  const chainIdKey = chainId.toString();
  const candidates = [
    chainIdKey ? source[chainIdKey] : null,
    source.default || null,
    source,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || source;
};

const resolveAddress = (registry, name) => {
  if (!registry || typeof registry !== "object") {
    return undefined;
  }
  const aliases = ADDRESS_ALIASES[name] || [name];
  for (const key of aliases) {
    if (registry[key]) {
      return registry[key];
    }
  }
  return undefined;
};

const ABI_MAP = {
  AuctionFactory: allAbis.AuctionFactory,
  DutchAuction: allAbis.DutchAuction,
  LBPOracle: allAbis.FeeOracleMock, // LBPOracle is stored as FeeOracleMock in allAbis.json
  PresaleManager: allAbis.PresaleManager,
  PublicPresaleFactory: allAbis.PublicPresaleFactory,
  UpkeepController: allAbis.UpkeepController,
};

/**
 * Dynamically loads a contract instance bound to the connected wallet.
 * Uses window.ethereum directly for ethers compatibility if available,
 * otherwise falls back to public read-only provider.
 */
export const loadContract = async (name, addressOverride = null, options = {}) => {
  let provider;
  let chainId;
  
  const useSigner = options.useSigner !== false;
  if (!useSigner || !window?.ethereum) {
    provider = ensureProvider();
    try {
      const network = await provider.getNetwork();
      chainId = Number(network.chainId);
    } catch {
      chainId = null;
    }
  } else {
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      chainId = Number(network.chainId);
      provider = browserProvider;
    } catch (error) {
      console.warn("Could not use injected wallet, falling back to public provider:", error);
      provider = ensureProvider();
      try {
        const network = await provider.getNetwork();
        chainId = Number(network.chainId);
      } catch {
        chainId = null;
      }
    }
  }

  const addressBook = await fetchAddressBook();
  const registry = resolveRegistry(addressBook, chainId);
  const abiEntry = ABI_MAP[name];
  
  if (!abiEntry) {
    throw new Error(`ABI for ${name} is not registered in loadContract.`);
  }
  
  const abi = Array.isArray(abiEntry) ? abiEntry : (abiEntry.abi || abiEntry);
  const derivedAddress = resolveAddress(registry, name);
  const address = addressOverride || derivedAddress;
  
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    throw new Error(`Address for ${name} not found. Deploy contracts or update addresses.json.`);
  }

  const shouldUseSigner = useSigner && window?.ethereum && provider && typeof provider.getSigner === 'function';
  const signerOrProvider = shouldUseSigner ? await provider.getSigner() : provider;
  return new ethers.Contract(address, abi, signerOrProvider);
};

export default loadContract;
