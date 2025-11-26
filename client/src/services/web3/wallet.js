import { formatEther, BrowserProvider } from "ethers";

export const requestAccount = async () => {
  if (!window?.ethereum) {
    throw new Error("Wallet not detected. Please connect your wallet.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0] ?? null;
};

export const getUserBalanceInETH = async (userAddress) => {
  if (!userAddress) {
    return "0";
  }

  if (!window?.ethereum) {
    return "0";
  }

  try {
    const provider = new BrowserProvider(window.ethereum);
    const balanceWei = await provider.getBalance(userAddress);
    
    // Перевіряємо чи balanceWei валідний
    if (!balanceWei || balanceWei === null || balanceWei === undefined) {
      return "0";
    }
    
    // Перевіряємо чи balanceWei є BigInt або числом
    if (typeof balanceWei === 'bigint' || typeof balanceWei === 'number') {
      const balance = formatEther(balanceWei);
      
      // Перевіряємо чи баланс є валідним числом
      const numBalance = Number(balance);
      if (!balance || balance === "NaN" || isNaN(numBalance) || !isFinite(numBalance)) {
        return "0";
      }
      
      return balance;
    }
    
    return "0";
  } catch (error) {
    console.error("Failed to get user balance:", error);
    return "0";
  }
};

export const getNetworkName = async () => {
  if (!window?.ethereum) {
    return "Unknown network";
  }

  try {
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    const chainIdHex = `0x${chainId.toString(16)}`;

    switch (chainIdHex) {
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
        return `Unknown network (chainId: ${chainIdHex})`;
    }
  } catch (error) {
    console.error("Failed to get network name:", error);
    return "Unknown network";
  }
};

export const subscribeWalletEvents = ({ onAccountsChanged, onChainChanged } = {}) => {
  if (!window?.ethereum) {
    return () => {};
  }

  const ethereum = window.ethereum;

  if (onAccountsChanged) {
    ethereum.on("accountsChanged", onAccountsChanged);
  }

  if (onChainChanged) {
    ethereum.on("chainChanged", onChainChanged);
  }

  return () => {
    if (onAccountsChanged) {
      ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
    }
    if (onChainChanged) {
      ethereum?.removeListener?.("chainChanged", onChainChanged);
    }
  };
};
