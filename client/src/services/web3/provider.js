import { BrowserProvider, JsonRpcProvider } from "ethers";

export const DEFAULT_CHAIN_ID_HEX = "0x7a69";
const INVALID_BLOCK_TAG_TEXT = "invalid block tag";
export const NETWORK_RESET_MESSAGE =
  "Local node was restarted. Redeploy the Lock contract and reload the page.";
const WALLET_STORAGE_KEY = "lockdapp:selectedWalletProvider";

let provider;
let publicProvider;
let targetChainIdHex = DEFAULT_CHAIN_ID_HEX;
let injectedProvider;
let injectedWalletMeta;

const getErrorMessage = (error) => {
  if (!error) return "";
  if (typeof error === "string") {
    return error;
  }
  return error?.reason || error?.message || error?.data?.message || error?.error?.message || "";
};

const isInvalidBlockTagError = (error) =>
  getErrorMessage(error).toLowerCase().includes(INVALID_BLOCK_TAG_TEXT);

const attemptChainResync = async () => {
  const eipProvider = getActiveEip1193Provider();
  if (!eipProvider?.request) {
    return;
  }

  const desiredChainId = targetChainIdHex;
  try {
    await eipProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: desiredChainId }]
    });
  } catch {
  }
};

const describeProvider = (candidate, index) => {
  if (!candidate) {
    return null;
  }

  const name =
    (candidate.isMetaMask && "MetaMask") ||
    (candidate.isRabby && "Rabby Wallet") ||
    (candidate.isCoinbaseWallet && "Coinbase Wallet") ||
    (candidate.isBraveWallet && "Brave Wallet") ||
    candidate.name ||
    candidate.providerName ||
    `Injected Wallet ${index + 1}`;

  const idBase =
    (candidate.isMetaMask && "metamask") ||
    (candidate.isRabby && "rabby") ||
    (candidate.isCoinbaseWallet && "coinbase") ||
    (candidate.isBraveWallet && "brave") ||
    candidate.id ||
    candidate.uuid ||
    candidate.session?.id ||
    `injected-${index}`;

  return {
    id: String(idBase),
    name,
    provider: candidate
  };
};

const readStoredWalletId = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(WALLET_STORAGE_KEY);
};

const storeWalletId = (id) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!id) {
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } else {
    window.localStorage.setItem(WALLET_STORAGE_KEY, id);
  }
};

const setInjectedWallet = (record) => {
  injectedProvider = record?.provider ?? null;
  injectedWalletMeta = record ? { id: record.id, name: record.name } : null;
  if (record) {
    storeWalletId(record.id);
  } else {
    storeWalletId(null);
  }
};

const detectInjectedCandidates = () => {
  if (typeof window === "undefined") {
    return [];
  }

  const { ethereum } = window;
  if (!ethereum) {
    return [];
  }

  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    return ethereum.providers;
  }

  return [ethereum];
};

const ensureWalletSelection = () => {
  if (injectedProvider || typeof window === "undefined") {
    return injectedProvider;
  }

  const storedId = readStoredWalletId();
  const options = getWalletProviders();
  const match = storedId ? options.find((option) => option.id === storedId) : options[0];

  if (match) {
    setInjectedWallet(match);
  } else if (window.ethereum) {
    const fallback = describeProvider(window.ethereum, 0);
    if (fallback) {
      setInjectedWallet(fallback);
    }
  }

  return injectedProvider;
};

export const getWalletProviders = () => {
  const candidates = detectInjectedCandidates();
  const seen = new Set();
  const records = [];

  candidates.forEach((candidate, index) => {
    const record = describeProvider(candidate, index);
    if (!record) {
      return;
    }

    let uniqueId = record.id;
    let suffix = 1;
    while (seen.has(uniqueId)) {
      uniqueId = `${record.id}-${suffix++}`;
    }
    seen.add(uniqueId);

    records.push({
      id: uniqueId,
      name: record.name,
      provider: record.provider
    });
  });

  return records;
};

export const selectWalletProvider = (providerId) => {
  if (typeof window === "undefined") {
    return null;
  }

  const options = getWalletProviders();
  const nextRecord =
    (providerId && options.find((option) => option.id === providerId)) ||
    options[0] ||
    (window.ethereum ? describeProvider(window.ethereum, 0) : null);

  setInjectedWallet(nextRecord);
  clearProviderCache();
  return injectedWalletMeta;
};

export const getCurrentWalletInfo = () => {
  ensureWalletSelection();
  return injectedWalletMeta ? { ...injectedWalletMeta } : null;
};

export const getActiveEip1193Provider = () => {
  ensureWalletSelection();
  return injectedProvider ?? null;
};

export const rpcGuard = async (operation, attempt = 0) => {
  try {
    return await operation();
  } catch (error) {
    if (!isInvalidBlockTagError(error)) {
      throw error;
    }

    clearProviderCache();
    await attemptChainResync();

    if (attempt === 0) {
      return rpcGuard(operation, attempt + 1);
    }

    throw new Error(NETWORK_RESET_MESSAGE);
  }
};

/**
 * Gets a public read-only provider
 * Falls back to default RPC URLs based on chain ID
 */
const getPublicReadOnlyProvider = (chainIdOverride = null) => {
  if (publicProvider && !chainIdOverride) {
    return publicProvider;
  }

  const chainId = chainIdOverride || parseInt(targetChainIdHex, 16);
  let rpcUrl;
  if (chainId === 31337) {
    rpcUrl = "http://127.0.0.1:8545"; // Hardhat local
  } else if (chainId === 11155111) {
    rpcUrl = "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"; // Sepolia
  } else if (chainId === 1) {
    rpcUrl = "https://eth.llamarpc.com"; // Mainnet public RPC
  } else if (chainId === 8453) {
    rpcUrl = "https://mainnet.base.org"; // Base mainnet
  } else if (chainId === 84532) {
    rpcUrl = "https://sepolia.base.org"; // Base Sepolia
  } else {
    rpcUrl = `https://rpc.ankr.com/eth`;
  }

  if (!publicProvider || (chainIdOverride && publicProvider.network?.chainId !== BigInt(chainId))) {
    publicProvider = new JsonRpcProvider(rpcUrl, chainId);
  }
  
  return publicProvider;
};

/**
 * Gets a provider for read-only operations
 * ALWAYS uses public RPC to avoid triggering wallet connection popups
 * For write operations, use ensureSigner() which will require explicit connection
 * @param {number|null} chainIdOverride - Optional chain ID to use for public provider
 */
export const ensureProvider = (chainIdOverride = null) => {
  return getPublicReadOnlyProvider(chainIdOverride);
};

export const clearProviderCache = () => {
  provider = null;
  publicProvider = null;
};

export const getTargetChainIdHex = () => targetChainIdHex;

export const setTargetChainIdHex = (hex) => {
  targetChainIdHex = hex || DEFAULT_CHAIN_ID_HEX;
};
