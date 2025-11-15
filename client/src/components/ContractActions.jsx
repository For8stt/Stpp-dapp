import React, { useState } from "react";
import { toast } from "react-toastify";

import { depositFund, withdrawFund } from "../services/web3/contract";

const ContractActions = ({ onActionComplete = () => {}, disabled }) => {
  const [depositValue, setDepositValue] = useState("");
  const [pendingAction, setPendingAction] = useState(false);

  const handleDeposit = async () => {
    setPendingAction(true);
    try {
      await depositFund(depositValue);
      toast.success("Deposit successful!");
      setDepositValue("");
      onActionComplete();
    } catch (error) {
      toast.error(error?.reason || error?.message || "Deposit failed");
    } finally {
      setPendingAction(false);
    }
  };

  const handleWithdraw = async () => {
    setPendingAction(true);
    try {
      await withdrawFund();
      toast.success("Withdrawal successful!");
      onActionComplete();
    } catch (error) {
      toast.error(error?.reason || error?.message || "Withdrawal failed");
    } finally {
      setPendingAction(false);
    }
  };

  return (
    <section className="card">
      <header>
        <h2>Contract Actions</h2>
        <p className="muted">Manage deposits and withdrawals</p>
      </header>
      <div className="actions">
        <input
          type="number"
          step="0.0001"
          min="0"
          value={depositValue}
          onChange={(event) => setDepositValue(event.target.value)}
          placeholder="Amount in ETH"
          disabled={pendingAction || disabled}
        />
        <div className="button-row">
          <button className="btn primary" onClick={handleDeposit} disabled={pendingAction || disabled}>
            {pendingAction ? "Processing..." : "Deposit Funds"}
          </button>
          <button className="btn secondary" onClick={handleWithdraw} disabled={pendingAction || disabled}>
            {pendingAction ? "Processing..." : "Withdraw Funds"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ContractActions;
