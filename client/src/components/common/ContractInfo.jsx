import React, { useCallback, useEffect, useState } from "react";

import {
  getContractBalanceInETH,
  getUserDepositInETH,
  subscribeToContractEvents
} from "../../services/web3/contract";
import { getUserBalanceInETH } from "../../services/web3/wallet";

const ContractInfo = ({ account, refreshKey }) => {
  const [contractBalance, setContractBalance] = useState("0");
  const [userBalance, setUserBalance] = useState("0");
  const [userDeposit, setUserDeposit] = useState("0");

  const fetchBalances = useCallback(async () => {
    if (!account) {
      setContractBalance("0");
      setUserBalance("0");
      setUserDeposit("0");
      return;
    }

    try {
      const [contractBal, walletBal, deposit] = await Promise.all([
        getContractBalanceInETH(),
        getUserBalanceInETH(account),
        getUserDepositInETH(account)
      ]);

      const cleanValue = (value) => {
        if (!value || value === null || value === undefined) return "0";
        const str = String(value).trim();
        if (str === "" || str === "NaN" || str === "null" || str === "undefined") return "0";
        const num = Number(str);
        if (isNaN(num) || !isFinite(num)) return "0";
        return str;
      };

      setContractBalance(cleanValue(contractBal));
      setUserBalance(cleanValue(walletBal));
      setUserDeposit(cleanValue(deposit));
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      setContractBalance("0");
      setUserBalance("0");
      setUserDeposit("0");
    }
  }, [account]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, refreshKey]);

  useEffect(() => {
    const unsubscribe = subscribeToContractEvents(fetchBalances);
    return () => unsubscribe && unsubscribe();
  }, [fetchBalances]);

  const formatEth = (value) => {
    if (!value || value === null || value === undefined) {
      return "0.0000 ETH";
    }
    
    const str = String(value).trim();
    if (str === "" || str === "NaN" || str === "null" || str === "undefined" || str === "Infinity") {
      return "0.0000 ETH";
    }
    
    const numeric = Number(str);
    if (Number.isNaN(numeric) || !isFinite(numeric)) {
      return "0.0000 ETH";
    }
    
    return `${numeric.toFixed(4)} ETH`;
  };

  return (
    <section className="rounded-[12px] bg-surface p-6 shadow-card">
      <header className="mb-6">
        <h2 className="m-0 mb-2 text-2xl font-semibold text-text">Contract Overview</h2>
        <p className="m-0 text-text-muted">Live balances updated in real time</p>
      </header>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <div>
          <span className="block text-[0.85rem] text-text-muted">Contract Balance</span>
          <strong className="block mt-1 text-lg font-semibold text-text">{formatEth(contractBalance)}</strong>
        </div>
        <div>
          <span className="block text-[0.85rem] text-text-muted">Connected Account</span>
          <strong className="block mt-1 text-lg font-semibold text-text break-all">{account || "Not connected"}</strong>
        </div>
        <div>
          <span className="block text-[0.85rem] text-text-muted">Wallet Balance</span>
          <strong className="block mt-1 text-lg font-semibold text-text">{formatEth(userBalance)}</strong>
        </div>
        <div>
          <span className="block text-[0.85rem] text-text-muted">Your Deposit</span>
          <strong className="block mt-1 text-lg font-semibold text-text">{formatEth(userDeposit)}</strong>
        </div>
      </div>
    </section>
  );
};

export default ContractInfo;
