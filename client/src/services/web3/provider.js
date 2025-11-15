import { BrowserProvider } from "ethers";

export const DEFAULT_CHAIN_ID_HEX = "0x7a69";
const INVALID_BLOCK_TAG_TEXT = "invalid block tag";
export const NETWORK_RESET_MESSAGE =
  "Local node was restarted. Redeploy the Lock contract and reload the page.";
const WALLET_STORAGE_KEY = "lockdapp:selectedWalletProvider";

let provider;
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
    // Ignore; the original error will bubble up for the UI.
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

export const ensureProvider = () => {
  const eipProvider = getActiveEip1193Provider();
  if (!eipProvider) {
    throw new Error("No injected wallet detected. Please install MetaMask, Rabby, or another wallet.");
  }

  if (!provider) {
    provider = new BrowserProvider(eipProvider);
  }

  return provider;
};

export const clearProviderCache = () => {
  provider = null;
};

export const getTargetChainIdHex = () => targetChainIdHex;

export const setTargetChainIdHex = (hex) => {
  targetChainIdHex = hex || DEFAULT_CHAIN_ID_HEX;
};
