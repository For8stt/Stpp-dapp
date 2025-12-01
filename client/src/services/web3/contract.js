import { Contract, formatEther, parseEther, BrowserProvider } from "ethers";

import LockABI from "../../abi/Lock_ABI.json";

let contract;
let contractSignerAddress;
let contractChainId;

const clearContractCache = () => {
  contract = null;
  contractSignerAddress = undefined;
  contractChainId = undefined;
};

const ensureContract = async () => {
  if (!window?.ethereum) {
    throw new Error("Wallet not detected. Please connect your wallet.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  const signerAddress = (await signer.getAddress()).toLowerCase();
  const chainId = Number(network.chainId);

  const needsReinit =
    !contract || contractSignerAddress !== signerAddress || contractChainId !== chainId;

  if (needsReinit) {
    const address = LockABI.address;
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      throw new Error("Lock contract address not found in Lock_ABI.json. Please deploy Lock contract first using: npx hardhat run scripts/deploy.js");
    }

    const code = await provider.getCode(address);
    if (!code || code === "0x") {
      throw new Error("Lock contract is not deployed on the connected network. Please deploy it using: npx hardhat run scripts/deploy.js");
    }

    const abi = LockABI.abi || [];
    if (!abi || abi.length === 0) {
      throw new Error("Lock ABI not found in Lock_ABI.json. Please run deployment script: npx hardhat run scripts/deploy.js");
    }

    contract = new Contract(address, abi, signer);
    contractSignerAddress = signerAddress;
    contractChainId = chainId;
  }

  return contract;
};

export const getContractBalanceInETH = async () => {
  if (!window?.ethereum) {
    return "0";
  }

  try {
    const address = LockABI.address;
    const provider = new BrowserProvider(window.ethereum);
    const balanceWei = await provider.getBalance(address);
    
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
    console.error("Failed to get contract balance:", error);
    return "0";
  }
};

export const depositFund = async (depositValue) => {
  if (!depositValue || isNaN(depositValue) || Number(depositValue) <= 0) {
    throw new Error("Enter a valid deposit amount");
  }

  const currentContract = await ensureContract();
  const tx = await currentContract.deposit({ value: parseEther(depositValue) });
  await tx.wait();
};

export const withdrawFund = async () => {
  const currentContract = await ensureContract();
  const tx = await currentContract.withdraw();
  await tx.wait();
};

export const getUserDepositInETH = async (userAddress) => {
  if (!userAddress) {
    return "0";
  }

  try {
    // Перевіряємо чи контракт розгорнутий перед викликом
    if (!window?.ethereum) {
      return "0";
    }

    const address = LockABI.address;
    const provider = new BrowserProvider(window.ethereum);
    const code = await provider.getCode(address);
    
    // Якщо контракт не розгорнутий, повертаємо 0
    if (!code || code === "0x") {
      return "0";
    }

    const currentContract = await ensureContract();
    const balanceWei = await currentContract.getBalance(userAddress);
    
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
    console.error("Failed to get user deposit:", error);
    return "0";
  }
};

export const subscribeToContractEvents = (onUpdate) => {
  if (!contract) {
    return () => {};
  }

  const depositListener = () => onUpdate();
  const withdrawListener = () => onUpdate();

  contract.on("Deposit", depositListener);
  contract.on("Withdrawal", withdrawListener);

  return () => {
    contract?.off("Deposit", depositListener);
    contract?.off("Withdrawal", withdrawListener);
  };
};

export const resetConnection = async () => {
  if (typeof window?.ethereum === "undefined") {
    throw new Error("Wallet not detected. Please connect your wallet.");
  }

  clearContractCache();

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await ensureContract();
};

export const clearConnectionState = () => {
  clearContractCache();
};
