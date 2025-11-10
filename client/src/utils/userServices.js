import { BrowserProvider, formatEther } from "ethers";

let walletProvider;

const ensureWalletProvider = () => {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask!");
    }

    if (!walletProvider) {
        walletProvider = new BrowserProvider(window.ethereum);
    }

    return walletProvider;
};

export const requestAccount = async () => {
    const provider = ensureWalletProvider();
    const accounts = await provider.send("eth_requestAccounts", []);
    return accounts[0];
};

export const getUserBalanceInETH = async (userAddress) => {
    if (!userAddress) {
        throw new Error("User address is required");
    }

    const provider = ensureWalletProvider();
    const balanceWei = await provider.getBalance(userAddress);
    return formatEther(balanceWei);
};

export const getNetworkName = async () => {
    if (!window.ethereum) return "No Ethereum provider";

    const chainId = await window.ethereum.request({ method: "eth_chainId" });

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
};
