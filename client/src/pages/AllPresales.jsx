import React, { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";

import PresaleCard from "../components/presale/PresaleCard";
import deployments from "../abi/data/stppDeployments.json";
import allAbis from "../abi/allAbis.json";

const AllPresales = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getReadProvider = () => {
    if (typeof window === "undefined") {
      return null;
    }
    if (window.ethereum) {
      return new BrowserProvider(window.ethereum);
    }
    return null;
  };

  const fetchManagerDetails = useCallback(async (managerAddress) => {
    const provider = getReadProvider();
    if (!provider) {
      return null;
    }

    try {
      const abi = Array.isArray(allAbis.PresaleManager) ? allAbis.PresaleManager : (allAbis.PresaleManager?.abi || allAbis.PresaleManager);
      const manager = new Contract(managerAddress, abi, provider);
      const owner = await manager.owner();
      let info = null;
      if (typeof manager.getLatestPresaleInfo === "function") {
        info = await manager.getLatestPresaleInfo();
      } else if (typeof manager.getPresaleInfo === "function") {
        info = await manager.getPresaleInfo(managerAddress);
      }
      return {
        manager: managerAddress,
        owner,
        auction: info ? info[1] : "",
        lbp: info && info[2] && info[2] !== ethers.ZeroAddress ? info[2] : "",
        vesting: info ? info[3] : "",
        finalized: info ? info[4] : false,
        lbpFinalized: info && info.length > 6 ? info[6] : false,
      };
    } catch (error) {
      console.warn("Failed to load manager info", error);
      return null;
    }
  }, []);

  const loadPresales = useCallback(async () => {
    const latestEntry =
      deployments?.entries && deployments.entries.length > 0
        ? deployments.entries[deployments.entries.length - 1]
        : null;

    if (!latestEntry?.publicFactory) {
      setError("PublicPresaleFactory address not available");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const provider = getReadProvider();
      if (!provider) {
        throw new Error("No provider available");
      }

      const factoryAbi = Array.isArray(allAbis.PublicPresaleFactory) 
        ? allAbis.PublicPresaleFactory 
        : (allAbis.PublicPresaleFactory?.abi || allAbis.PublicPresaleFactory);
      const factory = new Contract(latestEntry.publicFactory, factoryAbi, provider);
      const presales = await factory.getPresales();

      const enriched = await Promise.all(
        presales.map(async (managerAddress) => {
          return await fetchManagerDetails(managerAddress);
        })
      );

      setItems(enriched.filter(Boolean));
    } catch (factoryError) {
      console.error("Factory error:", factoryError);

      if (factoryError?.code === 'CALL_EXCEPTION') {
        setError("Contracts not found. Please redeploy contracts to the current network.");
      } else if (factoryError?.message?.includes('missing revert data')) {
        setError("Contracts are not deployed. Please run deployment scripts first.");
      } else {
        setError(factoryError?.message || "Failed to load presales");
      }
    } finally {
      setLoading(false);
    }
  }, [fetchManagerDetails]);

  useEffect(() => {
    loadPresales();
  }, [loadPresales]);

  return (
    <div className="min-h-screen bg-background">
      
      <section className="relative overflow-hidden border-b border-border/20 bg-gradient-to-b from-background via-background to-surface/5 py-20 sm:py-28">
        
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
          <div className="absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl"></div>
          <div className="absolute right-1/4 top-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/6 blur-3xl"></div>
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="mb-12 text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-primary backdrop-blur-sm">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Live Data</span>
              </div>
              <h1 className="mb-5 bg-gradient-to-br from-text via-text to-text/80 bg-clip-text text-5xl font-bold text-transparent sm:text-6xl lg:text-7xl">
                Permissionless Presales
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-text-muted sm:text-xl">
                Browse all PresaleManager clones created via the public factory. Track auctions, liquidity pools, and vesting schedules in real-time.
              </p>
            </div>

            
            <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/80 via-surface/60 to-surface/80 p-8 backdrop-blur-xl shadow-2xl shadow-black/20 transition-all duration-500 hover:border-primary/50 hover:shadow-primary/10 sm:p-10">
              
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-50 transition-opacity duration-500 group-hover:opacity-100"></div>
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl transition-opacity duration-500 group-hover:opacity-60"></div>
              <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-secondary/8 blur-3xl transition-opacity duration-500 group-hover:opacity-60"></div>
              
              <div className="relative z-10">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
                  <div className="relative rounded-xl border border-primary/20 bg-primary/5 p-6 backdrop-blur-sm">
                    <div className="absolute -left-1 top-0 h-full w-1 rounded-full bg-gradient-to-b from-primary to-primary/50"></div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-text-muted">Live auctions</p>
                    </div>
                    <p className="text-2xl font-bold text-text">Real-time tracking</p>
                  </div>
                  
                  <div className="relative rounded-xl border border-secondary/20 bg-secondary/5 p-6 backdrop-blur-sm">
                    <div className="absolute -left-1 top-0 h-full w-1 rounded-full bg-gradient-to-b from-secondary to-secondary/50"></div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-text-muted">Factory clones</p>
                    </div>
                    <p className="text-2xl font-bold text-text">Permissionless creation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section className="relative overflow-hidden py-16 sm:py-24">
        
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.02),transparent_70%)]"></div>
          <div className="absolute left-1/4 bottom-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary/4 blur-3xl"></div>
          <div className="absolute right-1/4 bottom-0 h-64 w-64 translate-x-1/2 translate-y-1/2 rounded-full bg-secondary/3 blur-3xl"></div>
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          {error && (
            <div className="group relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5 p-8 backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent"></div>
              <div className="relative z-10">
                <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2">
                  <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-lg font-semibold text-red-400">Error Loading Presales</p>
                </div>
                <p className="mb-6 text-base leading-relaxed text-red-300">{error}</p>
                {error.includes('not deployed') && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                    <p className="mb-4 text-sm font-medium text-red-400">To fix this issue:</p>
                    <ol className="m-0 list-none space-y-3 p-0">
                      <li className="flex items-start gap-3 border-l-2 border-red-500/30 pl-4 text-sm text-red-300">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">1</span>
                        <span>Make sure Hardhat network is running: <code className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 font-mono text-xs text-red-400">npx hardhat node</code></span>
                      </li>
                      <li className="flex items-start gap-3 border-l-2 border-red-500/30 pl-4 text-sm text-red-300">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">2</span>
                        <span>Deploy contracts: <code className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 font-mono text-xs text-red-400">npm run deploy:all</code></span>
                      </li>
                      <li className="flex items-start gap-3 border-l-2 border-red-500/30 pl-4 text-sm text-red-300">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">3</span>
                        <span>Refresh this page</span>
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/70 to-surface/50 p-16 text-center backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent"></div>
              <div className="relative z-10">
                <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
                <p className="text-xl font-medium text-text-muted">Loading presales...</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="group relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/70 to-surface/50 p-16 text-center backdrop-blur-sm transition-all duration-500 hover:border-primary/60 hover:from-surface/90 hover:to-surface/70">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent"></div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-lg shadow-primary/25">
                  <svg className="h-10 w-10 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                </div>
                <h3 className="mb-3 text-3xl font-bold text-text">No presales deployed yet</h3>
                <p className="mx-auto max-w-md text-lg leading-relaxed text-text-muted">
                  Create your first presale using the PublicPresaleFactory to see it listed here.
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-7xl">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
                {items.map((presale) => (
                  <PresaleCard key={presale.manager} presale={presale} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AllPresales;
