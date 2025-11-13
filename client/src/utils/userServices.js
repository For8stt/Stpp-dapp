import { BrowserProvider, formatEther } from "ethers";

const DEFAULT_CHAIN_ID_HEX = "0x7a69";
const INVALID_BLOCK_TAG_TEXT = "invalid block tag";
const NETWORK_RESET_MESSAGE =
    "Local node was restarted. Redeploy the Lock contract and reload the page.";

let walletProvider;
let walletChainIdHex = DEFAULT_CHAIN_ID_HEX;

const clearWalletProvider = () => {
    walletProvider = null;
    walletChainIdHex = DEFAULT_CHAIN_ID_HEX;
};

const getErrorMessage = (error) => {
    if (!error) return "";
    if (typeof error === "string") {
        return error;
    }

    return (
        error?.reason ||
        error?.message ||
        error?.data?.message ||
        error?.error?.message ||
        ""
    );
};

const isInvalidBlockTagError = (error) =>
    getErrorMessage(error).toLowerCase().includes(INVALID_BLOCK_TAG_TEXT);

const attemptWalletChainResync = async () => {
    if (typeof window.ethereum === "undefined") {
        return;
    }

    const targetChainIdHex =
        walletChainIdHex ||
        (await window.ethereum
            .request({ method: "eth_chainId" })
            .catch(() => DEFAULT_CHAIN_ID_HEX));

    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainIdHex }],
        });
    } catch (error) {
        // Ignore; the follow-up error message will explain what to do.
    }
};

const walletRpcGuard = async (operation, attempt = 0) => {
    try {
        return await operation();
    } catch (error) {
        if (!isInvalidBlockTagError(error)) {
            throw error;
        }

        clearWalletProvider();
        await attemptWalletChainResync();

        if (attempt === 0) {
            return walletRpcGuard(operation, attempt + 1);
        }

        throw new Error(NETWORK_RESET_MESSAGE);
    }
};

const refreshWalletChainId = async () => {
    if (typeof window.ethereum === "undefined") {
        walletChainIdHex = DEFAULT_CHAIN_ID_HEX;
        return;
    }

    try {
        walletChainIdHex = await window.ethereum.request({
            method: "eth_chainId",
        });
    } catch (error) {
        walletChainIdHex = DEFAULT_CHAIN_ID_HEX;
    }
};

const ensureWalletProvider = () => {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask!");
    }

    if (!walletProvider) {
        walletProvider = new BrowserProvider(window.ethereum);
    }

    return walletProvider;
};

export const requestAccount = async () =>
    walletRpcGuard(async () => {
        const provider = ensureWalletProvider();
        await refreshWalletChainId();
        const accounts = await provider.send("eth_requestAccounts", []);
        return accounts[0];
    });

export const getUserBalanceInETH = async (userAddress) => {
    if (!userAddress) {
        throw new Error("User address is required");
    }

    return walletRpcGuard(async () => {
        const provider = ensureWalletProvider();
        await refreshWalletChainId();
        const balanceWei = await provider.getBalance(userAddress);
        return formatEther(balanceWei);
    });
};

export const getNetworkName = async () =>
    walletRpcGuard(async () => {
        if (!window.ethereum) return "No Ethereum provider";

        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        walletChainIdHex = chainId;

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
