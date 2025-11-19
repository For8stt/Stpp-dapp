import React from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";

import Dashboard from "../pages/Dashboard";
import Home from "../pages/Home";
import PresaleDeploy from "../pages/PresaleDeploy";

const AppRouter = ({
  account,
  onConnect,
  onDisconnect,
  onWalletChange,
  selectedWalletId,
  refreshKey,
  onActionComplete,
  initializing
}) => (
  <BrowserRouter>
    <div className="app">
      <header className="app-header">
        <h1 className="logo">STTP dApp</h1>
        <div className="header-actions">
          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/deploy">Deploy</NavLink>
          </nav>
          {account ? (
            <button className="btn ghost" onClick={onDisconnect}>
              Disconnect
            </button>
          ) : null}
        </div>
      </header>
      <main>
        {initializing ? (
          <section className="page">
            <div className="card">
              <p>Checking wallet connection…</p>
            </div>
          </section>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <Home
                  account={account}
                  onConnect={onConnect}
                  onWalletChange={onWalletChange}
                  selectedWalletId={selectedWalletId}
                />
              }
            />
            <Route
              path="/dashboard"
              element={<Dashboard account={account} refreshKey={refreshKey} onActionComplete={onActionComplete} />}
            />
            <Route path="/deploy" element={<PresaleDeploy />} />
          </Routes>
        )}
      </main>
    </div>
  </BrowserRouter>
);

export default AppRouter;
