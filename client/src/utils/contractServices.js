import Lock_ABI from "./Lock_ABI.json";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";

let provider;
let signer;
let contract;


export const initialize = async () => {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask!");
    }

    provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    contract = new Contract(Lock_ABI.address, Lock_ABI.abi, signer);

    console.log("✅ Contract initialized:", Lock_ABI.address);
    return contract;

};

export const getContractBalanceInETH = async () => {
    if (!provider) await initialize();
    const balanceWei = await provider.getBalance(Lock_ABI.address);
    return formatEther(balanceWei);
};

export const depositFund = async (depositValue) => {
    if (!contract) await initialize();
    if (!depositValue || isNaN(depositValue) || Number(depositValue) <= 0) {
        throw new Error("Enter a valid deposit amount");
    }

    const tx = await contract.deposit({ value: parseEther(depositValue) });
    await tx.wait();
    console.log("✅ Deposit successful!");
};

export const withdrawFund = async () => {
    if (!contract) await initialize();
    const tx = await contract.withdraw();
    await tx.wait();
    console.log("✅ Withdrawal successful!");
};

export const subscribeToEvents = (onUpdate) => {
    if (!contract) return () => {};

    const depositListener = () => onUpdate();
    const withdrawListener = () => onUpdate();

    contract.on("Deposit", depositListener);
    contract.on("Withdrawal", withdrawListener);

    return () => {
        contract.off("Deposit", depositListener);
        contract.off("Withdrawal", withdrawListener);
    };
};

export const requestAccount = async () => {
    if (typeof window.ethereum === "undefined") throw new Error("Please install MetaMask!");
    const provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    return accounts[0];
};

export const getUserBalanceInETH = async (userAddress) => {
    if (!provider) await initialize();
    const balanceWei = await provider.getBalance(userAddress);
    return formatEther(balanceWei);
};

export const getUserDepositInETH = async (userAddress) => {
    if (!contract) await initialize();
    const balanceWei = await contract.getBalance(userAddress);
    return formatEther(balanceWei);
};

export const getNetworkName = async () => {
    if (!window.ethereum) return "No Ethereum provider";

    const chainId = await window.ethereum.request({ method: "eth_chainId" });

    switch (chainId) {
        case "0x1":
            return "Ethereum Mainnet";
        case "0x3":
            return "Ropsten Testnet";
        case "0x4":
            return "Rinkeby Testnet";
        case "0x5":
            return "Goerli Testnet";
        case "0x2a":
            return "Kovan Testnet";
        case "0x7a69": // 1337 in hex
            return "Hardhat Local Network";
        default:
            return `Unknown network (chainId: ${chainId})`;
    }
};

export const resetProviderAndContract = async () => {
    provider = new BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    contract = new Contract(Lock_ABI.address, Lock_ABI.abi, signer);
};

