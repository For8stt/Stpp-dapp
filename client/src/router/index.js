import React from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import Home from "../pages/Home";
import PresaleDeploy from "../pages/PresaleDeploy";
import CreatePresale from "../pages/CreatePresale";
import AllPresales from "../pages/AllPresales";
import PresalePage from "../pages/PresalePage";
import AuctionView from "../pages/AuctionView";
import LbpView from "../pages/LBPView";
import VestingView from "../pages/VestingView";

const NavItem = ({ to, end, children, onClick }) => (
  <NavLink 
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) => 
      `rounded-lg px-5 py-2.5 text-base font-medium transition-all duration-300 ${
        isActive 
          ? "bg-primary/10 text-primary shadow-md shadow-primary/10" 
          : "text-text-muted hover:bg-surface hover:text-text"
      }`
    }
  >
    {children}
  </NavLink>
);

const AppRouter = ({
  account,
  onConnect,
  refreshKey,
  onActionComplete,
  initializing
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background font-sans text-text">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-surface/90 backdrop-blur-xl shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            
            <NavLink 
              to="/" 
              className="flex items-center gap-2.5 no-underline outline-none focus:outline-none active:outline-none"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-text sm:text-2xl">
                  <span className="font-extrabold">STPP</span>
                  <span className="ml-1.5 bg-gradient-to-r from-primary via-indigo-400 to-secondary bg-clip-text text-transparent font-bold">dApp</span>
                </h1>
              </div>
            </NavLink>

            
            <nav className="hidden items-center gap-0.5 md:flex">
              <NavItem to="/" end>Home</NavItem>
              <NavItem to="/all">All Presales</NavItem>
              <NavItem to="/create">Create</NavItem>
              <NavItem to="/deploy">Deploy</NavItem>
            </nav>

            
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <ConnectButton 
                  showBalance={false}
                  chainStatus="icon"
                />
              </div>
              
              
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface hover:text-text md:hidden"
                aria-label="Toggle menu"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
          
          
          {mobileMenuOpen && (
            <div className="border-t border-border/50 bg-surface/95 backdrop-blur-xl md:hidden">
              <nav className="flex flex-col gap-1 p-4">
                <NavItem to="/" end onClick={() => setMobileMenuOpen(false)}>Home</NavItem>
                <NavItem to="/all" onClick={() => setMobileMenuOpen(false)}>All Presales</NavItem>
                <NavItem to="/create" onClick={() => setMobileMenuOpen(false)}>Create</NavItem>
                <NavItem to="/deploy" onClick={() => setMobileMenuOpen(false)}>Deploy</NavItem>
                <div className="mt-4 pt-4 border-t border-border/50">
                  <ConnectButton 
                    showBalance={false}
                    chainStatus="icon"
                  />
                </div>
              </nav>
            </div>
          )}
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
};

export default AppRouter;
