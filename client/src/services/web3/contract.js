import { Contract, formatEther, parseEther } from "ethers";

import LockABI from "../../abi/Lock_ABI.json";
import { clearProviderCache, ensureProvider, rpcGuard } from "./provider";
import { clearSignerCache, ensureSigner, getChainId, getSignerAddress } from "./signer";

let contract;
let contractSignerAddress;
let contractChainId;

const clearContractCache = () => {
  contract = null;
  contractSignerAddress = undefined;
  contractChainId = undefined;
};

const ensureContract = async () =>
  rpcGuard(async () => {
    const signer = await ensureSigner();
    const signerAddress = getSignerAddress();
    const chainId = getChainId();

    const needsReinit =
      !contract || contractSignerAddress !== signerAddress || contractChainId !== chainId;

    if (needsReinit) {
      const provider = ensureProvider();
      const code = await provider.getCode(LockABI.address);
      if (!code || code === "0x") {
        throw new Error("Lock contract is not deployed on the connected network.");
      }

      contract = new Contract(LockABI.address, LockABI.abi, signer);
      contractSignerAddress = signerAddress;
      contractChainId = chainId;
    }

    return contract;
  });

export const getContractBalanceInETH = async () =>
  rpcGuard(async () => {
    const provider = ensureProvider();
    const balanceWei = await provider.getBalance(LockABI.address);
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

export const resetConnection = async () =>
  rpcGuard(async () => {
    if (typeof window?.ethereum === "undefined") {
      throw new Error("Please install MetaMask!");
    }

    clearContractCache();
    clearSignerCache();
    clearProviderCache();

    const provider = ensureProvider();
    await provider.send("eth_requestAccounts", []);
    await ensureContract();
  });

export const clearConnectionState = () => {
  clearContractCache();
  clearSignerCache();
  clearProviderCache();
};
