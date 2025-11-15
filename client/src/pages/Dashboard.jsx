import React from "react";
import { NavLink } from "react-router-dom";

import ContractActions from "../components/ContractActions";
import ContractInfo from "../components/ContractInfo";
import NetworkInfo from "../components/NetworkInfo";

const Dashboard = ({ account, refreshKey, onActionComplete }) => {
  if (!account) {
    return (
      <section className="page dashboard">
        <div className="card">
          <h2>Wallet not connected</h2>
          <p>Please connect your wallet on the Home page to access the dashboard.</p>
          <NavLink className="btn primary" to="/">
            Back to Home
          </NavLink>
        </div>
      </section>
    );
  }

  return (
    <section className="page dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <NetworkInfo />
      </div>
      <div className="dashboard-grid">
        <ContractInfo account={account} refreshKey={refreshKey} />
        <ContractActions onActionComplete={onActionComplete} />
      </div>
    </section>
  );
};

export default Dashboard;
