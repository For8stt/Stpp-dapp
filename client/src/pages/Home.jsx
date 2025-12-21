import React from "react";
import { NavLink } from "react-router-dom";

import ConnectWalletButton from "../components/common/ConnectWalletButton";
import NetworkInfo from "../components/common/NetworkInfo";

const Home = ({ account }) => (
  <section className="flex flex-col gap-6">
    <div className="flex max-w-[640px] flex-col gap-4">
      <h1>Lock Contract Dashboard</h1>
      <p>Connect your wallet to manage deposits, monitor balances, and access the dashboard.</p>
      <NetworkInfo />
      {account ? (
        <div className="flex items-center gap-4 rounded-lg bg-muted px-4 py-3">
          <span>Connected as {account}</span>
          <NavLink className="rounded-lg bg-primary px-6 py-3 text-base text-white" to="/dashboard">
            Go to Dashboard
          </NavLink>
        </div>
      ) : (
        <ConnectWalletButton />
      )}
    </div>
  </section>
);

export default Home;
