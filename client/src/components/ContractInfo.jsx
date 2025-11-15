import React, { useCallback, useEffect, useState } from "react";

import {
  getContractBalanceInETH,
  getUserDepositInETH,
  subscribeToContractEvents
} from "../services/web3/contract";
import { getUserBalanceInETH } from "../services/web3/wallet";

const ContractInfo = ({ account, refreshKey }) => {
  const [contractBalance, setContractBalance] = useState("0");
  const [userBalance, setUserBalance] = useState("0");
  const [userDeposit, setUserDeposit] = useState("0");

  const fetchBalances = useCallback(async () => {
    if (!account) {
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

      setContractBalance(contractBal);
      setUserBalance(walletBal);
      setUserDeposit(deposit);
    } catch (error) {
      console.error("Failed to fetch balances:", error);
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
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return `${value || "0"} ETH`;
    }
    return `${numeric.toFixed(4)} ETH`;
  };

  return (
    <section className="card">
      <header>
        <h2>Contract Overview</h2>
        <p className="muted">Live balances updated in real time</p>
      </header>
      <div className="metrics">
        <div>
          <span className="label">Contract Balance</span>
          <strong>{formatEth(contractBalance)}</strong>
        </div>
        <div>
          <span className="label">Connected Account</span>
          <strong>{account || "Not connected"}</strong>
        </div>
        <div>
          <span className="label">Wallet Balance</span>
          <strong>{formatEth(userBalance)}</strong>
        </div>
        <div>
          <span className="label">Your Deposit</span>
          <strong>{formatEth(userDeposit)}</strong>
        </div>
      </div>
    </section>
  );
};

export default ContractInfo;
