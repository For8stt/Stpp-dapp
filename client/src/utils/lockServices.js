import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import Lock_ABI from "./Lock_ABI.json";

let provider;
let signer;
let contract;

const ensureProvider = () => {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask!");
    }

    if (!provider) {
        provider = new BrowserProvider(window.ethereum);
    }

    return provider;
};

const ensureContract = async () => {
    if (!contract) {
        const currentProvider = ensureProvider();
        await currentProvider.send("eth_requestAccounts", []);
        signer = await currentProvider.getSigner();
        contract = new Contract(Lock_ABI.address, Lock_ABI.abi, signer);
    }

    return contract;
};

export const getContractBalanceInETH = async () => {
    const currentProvider = ensureProvider();
    const balanceWei = await currentProvider.getBalance(Lock_ABI.address);
    return formatEther(balanceWei);
};

export const depositFund = async (depositValue) => {
    const currentContract = await ensureContract();
    if (!depositValue || isNaN(depositValue) || Number(depositValue) <= 0) {
        throw new Error("Enter a valid deposit amount");
    }

    const tx = await currentContract.deposit({ value: parseEther(depositValue) });
    await tx.wait();
};

export const withdrawFund = async () => {
    const currentContract = await ensureContract();
    const tx = await currentContract.withdraw();
    await tx.wait();
};

export const getUserDepositInETH = async (userAddress) => {
    const currentContract = await ensureContract();
    const balanceWei = await currentContract.getBalance(userAddress);
    return formatEther(balanceWei);
};

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

export const resetProviderAndContract = async () => {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask!");
    }

    provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    contract = new Contract(Lock_ABI.address, Lock_ABI.abi, signer);
};
