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
    <div className="min-h-screen bg-background font-sans text-text">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-8">
        <h1 className="m-0 text-xl font-bold text-text sm:text-2xl">STPP dApp</h1>
        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="flex flex-wrap items-center gap-2 sm:gap-4">
            <NavLink 
              className={({ isActive }) => 
                `text-sm no-underline transition-colors hover:text-text sm:text-base ${
                  isActive ? "text-primary font-medium" : "text-text-muted"
                }`
              }
              to="/" 
              end
            >
              Home
            </NavLink>
            <NavLink 
              className={({ isActive }) => 
                `text-sm no-underline transition-colors hover:text-text sm:text-base ${
                  isActive ? "text-primary font-medium" : "text-text-muted"
                }`
              }
              to="/dashboard"
            >
              Dashboard
            </NavLink>
            <NavLink 
              className={({ isActive }) => 
                `text-sm no-underline transition-colors hover:text-text sm:text-base ${
                  isActive ? "text-primary font-medium" : "text-text-muted"
                }`
              }
              to="/create"
            >
              Create
            </NavLink>
            <NavLink 
              className={({ isActive }) => 
                `text-sm no-underline transition-colors hover:text-text sm:text-base ${
                  isActive ? "text-primary font-medium" : "text-text-muted"
                }`
              }
              to="/all"
            >
              All presales
            </NavLink>
            <NavLink 
              className={({ isActive }) => 
                `text-sm no-underline transition-colors hover:text-text sm:text-base ${
                  isActive ? "text-primary font-medium" : "text-text-muted"
                }`
              }
              to="/deploy"
            >
              Deploy
            </NavLink>
          </nav>
          <ConnectButton 
            showBalance={false}
            chainStatus="icon"
          />
        </div>
      </header>
      <main className="p-8">
        {initializing ? (
          <section className="flex flex-col gap-6">
            <div className="rounded-[12px] bg-surface p-6 shadow-card">
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
