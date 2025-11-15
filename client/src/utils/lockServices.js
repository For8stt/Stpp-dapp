import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import Lock_ABI from "./Lock_ABI.json";

const DEFAULT_CHAIN_ID_HEX = "0x7a69";
const INVALID_BLOCK_TAG_TEXT = "invalid block tag";
const NETWORK_RESET_MESSAGE =
    "Local node was restarted. Redeploy the Lock contract and reload the page.";

let provider;
let signer;
let contract;
let signerAddress;
let chainId;
let chainIdHex = DEFAULT_CHAIN_ID_HEX;

const clearCachedConnection = () => {
    provider = null;
    signer = null;
    contract = null;
    signerAddress = null;
    chainId = null;
    chainIdHex = DEFAULT_CHAIN_ID_HEX;
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

const attemptChainResync = async () => {
    if (typeof window.ethereum === "undefined") {
        return;
    }

    const targetChainIdHex =
        chainIdHex ||
        (await window.ethereum
            .request({ method: "eth_chainId" })
            .catch(() => DEFAULT_CHAIN_ID_HEX));

    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainIdHex }],
        });
    } catch (error) {
        // User can reject the switch; swallow the error so original message surfaces.
    }
};

const rpcGuard = async (operation, attempt = 0) => {
    try {
        return await operation();
    } catch (error) {
        if (!isInvalidBlockTagError(error)) {
            throw error;
        }

        clearCachedConnection();
        await attemptChainResync();

        if (attempt === 0) {
            return rpcGuard(operation, attempt + 1);
        }

        throw new Error(NETWORK_RESET_MESSAGE);
    }
};

const ensureProvider = () => {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask!");
    }

    if (!provider) {
        provider = new BrowserProvider(window.ethereum);
    }

    return provider;
};

const ensureContract = async () =>
    rpcGuard(async () => {
        const currentProvider = ensureProvider();
        await currentProvider.send("eth_requestAccounts", []);

        const currentSigner = await currentProvider.getSigner();
        const currentSignerAddress = (await currentSigner.getAddress()).toLowerCase();
        const network = await currentProvider.getNetwork();
        const currentChainIdBigInt = network.chainId;
        const currentChainId = Number(currentChainIdBigInt);
        const currentChainIdHex = `0x${currentChainIdBigInt.toString(16)}`;

        const shouldReinitialize =
            !contract ||
            !signer ||
            signerAddress !== currentSignerAddress ||
            chainId !== currentChainId;

        if (shouldReinitialize) {
            const contractCode = await currentProvider.getCode(Lock_ABI.address);
            if (!contractCode || contractCode === "0x") {
                throw new Error("Lock contract is not deployed on the connected network.");
            }

            signer = currentSigner;
            signerAddress = currentSignerAddress;
            chainId = currentChainId;
            chainIdHex = currentChainIdHex;
            contract = new Contract(Lock_ABI.address, Lock_ABI.abi, signer);
        }

        return contract;
    });

export const getContractBalanceInETH = async () =>
    rpcGuard(async () => {
        const currentProvider = ensureProvider();
        const balanceWei = await currentProvider.getBalance(Lock_ABI.address);
        return formatEther(balanceWei);
    });

export const depositFund = async (depositValue) => {
    if (!depositValue || isNaN(depositValue) || Number(depositValue) <= 0) {
        throw new Error("Enter a valid deposit amount");
    }

    await rpcGuard(async () => {
        const currentContract = await ensureContract();
        const tx = await currentContract.deposit({ value: parseEther(depositValue) });
        await tx.wait();
    });
};

export const withdrawFund = async () =>
    rpcGuard(async () => {
        const currentContract = await ensureContract();
        const tx = await currentContract.withdraw();
        await tx.wait();
    });

export const getUserDepositInETH = async (userAddress) =>
    rpcGuard(async () => {
        const currentContract = await ensureContract();
        const balanceWei = await currentContract.getBalance(userAddress);
        return formatEther(balanceWei);
    });

export const subscribeToEvents = (onUpdate) => {
    if (!contract) {
        return () => {};
    }

    const depositListener = () => onUpdate();
    const withdrawListener = () => onUpdate();

    contract.on("Deposit", depositListener);
    contract.on("Withdrawal", withdrawListener);

    return () => {
        contract.off("Deposit", depositListener);
        contract.off("Withdrawal", withdrawListener);
    };
};

export const resetProviderAndContract = async () =>
    rpcGuard(async () => {
        if (typeof window.ethereum === "undefined") {
            throw new Error("Please install MetaMask!");
        }

        clearCachedConnection();
        provider = new BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        await ensureContract();
    });
