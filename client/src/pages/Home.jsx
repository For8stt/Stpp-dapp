import React from "react";
import { NavLink } from "react-router-dom";

import ConnectWalletButton from "../components/ConnectWalletButton";
import NetworkInfo from "../components/NetworkInfo";

const Home = ({ account }) => (
  <section className="page home">
    <div className="hero">
      <h1>Lock Contract Dashboard</h1>
      <p>Connect your wallet to manage deposits, monitor balances, and access the dashboard.</p>
      <NetworkInfo />
      {account ? (
        <div className="connected-banner">
          <span>Connected as {account}</span>
          <NavLink className="btn primary" to="/dashboard">
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
