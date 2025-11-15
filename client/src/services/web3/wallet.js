import { formatEther } from "ethers";

import {
  DEFAULT_CHAIN_ID_HEX,
  ensureProvider,
  getActiveEip1193Provider,
  rpcGuard,
  setTargetChainIdHex
} from "./provider";

let walletChainIdHex = DEFAULT_CHAIN_ID_HEX;

const refreshWalletChainId = async () => {
  const injected = getActiveEip1193Provider();
  if (!injected?.request) {
    walletChainIdHex = DEFAULT_CHAIN_ID_HEX;
    return walletChainIdHex;
  }

  try {
    walletChainIdHex = await injected.request({ method: "eth_chainId" });
    setTargetChainIdHex(walletChainIdHex);
  } catch {
    walletChainIdHex = DEFAULT_CHAIN_ID_HEX;
  }

  return walletChainIdHex;
};

export const requestAccount = async () =>
  rpcGuard(async () => {
    const provider = ensureProvider();
    await refreshWalletChainId();
    const accounts = await provider.send("eth_requestAccounts", []);
    return accounts[0] ?? null;
  });

export const getUserBalanceInETH = async (userAddress) => {
  if (!userAddress) {
    throw new Error("User address is required");
  }

  return rpcGuard(async () => {
    const provider = ensureProvider();
    await refreshWalletChainId();
    const balanceWei = await provider.getBalance(userAddress);
    return formatEther(balanceWei);
  });
};

export const getNetworkName = async () =>
  rpcGuard(async () => {
    const chainId = await refreshWalletChainId();
    switch (chainId) {
      case "0x1":
        return "Ethereum Mainnet";
      case "0x5":
        return "Goerli Testnet";
      case "0xaa36a7":
        return "Sepolia Testnet";
      case "0x2105":
        return "Base Mainnet";
      case "0x14a33":
        return "Base Sepolia Testnet";
      case "0xe708":
        return "Linea Mainnet";
      case "0xe705":
        return "Linea Testnet";
      case "0xa4b1":
        return "Arbitrum One Mainnet";
      case "0x66eed":
        return "Arbitrum Sepolia Testnet";
      case "0xa86a":
        return "Avalanche C-Chain Mainnet";
      case "0xa869":
        return "Avalanche Fuji Testnet";
      case "0x7a69":
        return "Hardhat Local Network";
      default:
        return `Unknown network (chainId: ${chainId})`;
    }
  });

export const subscribeWalletEvents = ({ onAccountsChanged, onChainChanged } = {}) => {
  const injected = getActiveEip1193Provider();
  if (!injected?.on) {
    return () => {};
  }

  if (onAccountsChanged) {
    injected.on("accountsChanged", onAccountsChanged);
  }

  if (onChainChanged) {
    injected.on("chainChanged", onChainChanged);
  }

  return () => {
    if (onAccountsChanged) {
      injected?.removeListener?.("accountsChanged", onAccountsChanged);
    }
    if (onChainChanged) {
      injected?.removeListener?.("chainChanged", onChainChanged);
    }
  };
};
