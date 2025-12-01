import { ethers } from "ethers";

import allAbis from "../../abi/allAbis.json";
import fallbackAddresses from "../../abi/addresses.json";
import { fetchAddressBook } from "./addressBook";

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

// Map contract names to their keys in allAbis.json
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
 * Uses window.ethereum directly for ethers compatibility.
 */
export const loadContract = async (name, addressOverride = null, options = {}) => {
  if (!window?.ethereum) {
    throw new Error("Wallet not detected. Please connect your wallet.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
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

  const useSigner = options.useSigner !== false;
  const signerOrProvider = useSigner ? await provider.getSigner() : provider;
  return new ethers.Contract(address, abi, signerOrProvider);
};

export default loadContract;
