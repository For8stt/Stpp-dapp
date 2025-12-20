import React from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import Dashboard from "../pages/Dashboard";
import Home from "../pages/Home";
import PresaleDeploy from "../pages/PresaleDeploy";
import CreatePresale from "../pages/CreatePresale";
import AllPresales from "../pages/AllPresales";
import PresalePage from "../pages/PresalePage";
import AuctionView from "../pages/AuctionView";
import LbpView from "../pages/LBPView";
import VestingView from "../pages/VestingView";

const AppRouter = ({
  account,
  onConnect,
  onDisconnect,
  refreshKey,
  onActionComplete,
  initializing
}) => (
  <BrowserRouter>
    <div className="app">
      <header className="app-header">
        <h1 className="logo">STPP dApp</h1>
        <div className="header-actions">
          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/create">Create</NavLink>
            <NavLink to="/all">All presales</NavLink>
            <NavLink to="/deploy">Deploy</NavLink>
          </nav>
          <ConnectButton 
            showBalance={false}
            chainStatus="icon"
          />
        </div>
      </header>
      <main>
        {initializing ? (
          <section className="page">
            <div className="card">
              <p>Loading…</p>
            </div>
          </section>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <Home
                  account={account}
                />
              }
            />
            <Route
              path="/dashboard"
              element={<Dashboard account={account} refreshKey={refreshKey} onActionComplete={onActionComplete} />}
            />
            <Route path="/deploy" element={<PresaleDeploy />} />
            <Route path="/create" element={<CreatePresale account={account} onConnect={onConnect} />} />
            <Route path="/all" element={<AllPresales />} />
            <Route path="/manager/:address" element={<PresalePage account={account} />} />
            <Route path="/presale/:address/auction" element={<AuctionView />} />
            <Route path="/lbp/:lbpAddress" element={<LbpView />} />
            <Route path="/vesting/:escrowAddress" element={<VestingView />} />
          </Routes>
        )}
      </main>
    </div>
  </BrowserRouter>
);

export default AppRouter;
