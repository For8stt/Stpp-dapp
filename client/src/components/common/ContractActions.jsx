import React, { useState } from "react";
import { toast } from "react-toastify";

import { depositFund, withdrawFund } from "../../services/web3/contract";

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
    <section className="rounded-[12px] bg-surface p-6 shadow-card">
      <header className="mb-6">
        <h2 className="m-0 mb-2 text-2xl font-semibold text-text">Contract Actions</h2>
        <p className="m-0 text-text-muted">Manage deposits and withdrawals</p>
      </header>
      <div className="flex flex-col gap-4">
        <input
          className="w-full rounded-lg border border-border bg-background p-3 text-text transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          type="number"
          step="0.0001"
          min="0"
          value={depositValue}
          onChange={(event) => setDepositValue(event.target.value)}
          placeholder="Amount in ETH"
          disabled={pendingAction || disabled}
        />
        <div className="flex flex-wrap gap-4">
          <button
            className="cursor-pointer rounded-lg border-0 bg-primary px-6 py-3 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDeposit}
            disabled={pendingAction || disabled}
          >
            {pendingAction ? "Processing..." : "Deposit Funds"}
          </button>
          <button
            className="cursor-pointer rounded-lg border-0 bg-secondary px-6 py-3 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleWithdraw}
            disabled={pendingAction || disabled}
          >
            {pendingAction ? "Processing..." : "Withdraw Funds"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ContractActions;
