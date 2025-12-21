import React from "react";
import { NavLink } from "react-router-dom";

import ContractActions from "../components/common/ContractActions";
import ContractInfo from "../components/common/ContractInfo";
import NetworkInfo from "../components/common/NetworkInfo";

const Dashboard = ({ account, refreshKey, onActionComplete }) => {
  if (!account) {
    return (
      <section className="flex flex-col gap-6">
        <div className="rounded-[12px] bg-surface p-6 shadow-card">
          <h2 className="m-0 mb-4 text-2xl font-semibold text-text">Wallet not connected</h2>
          <p className="mb-4 text-text-muted">Please connect your wallet on the Home page to access the dashboard.</p>
          <NavLink className="inline-block rounded-lg bg-primary px-6 py-3 text-base text-white no-underline transition-opacity hover:opacity-90" to="/">
            Back to Home
          </NavLink>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="m-0 text-3xl font-bold text-text">Dashboard</h1>
        <NetworkInfo />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        <ContractInfo account={account} refreshKey={refreshKey} />
        <ContractActions onActionComplete={onActionComplete} />
      </div>
    </section>
  );
};

export default Dashboard;
