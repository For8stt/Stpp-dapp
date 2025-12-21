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

  const fetchManagerDetails = async (managerAddress) => {
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
      };
    } catch (error) {
      console.warn("Failed to load manager info", error);
      return null;
    }
  };

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

      // Check if this is a network/contract issue
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
  }, []);

  useEffect(() => {
    loadPresales();
  }, [loadPresales]);

  return (
    <section className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 pb-16 pt-8">
      <div className="relative flex flex-col justify-between gap-8 overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6 shadow-card transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.5)] lg:flex-row lg:items-center lg:gap-12 lg:p-12">
        <div className="relative z-10 flex-1">
          <h1 className="mb-3 bg-gradient-to-br from-text to-[#cbd5e1] bg-clip-text text-[2rem] font-bold leading-tight text-transparent lg:text-[2.5rem]">
            Permissionless presales
          </h1>
          <p className="mb-6 max-w-[480px] text-base leading-relaxed text-text-muted">
            Browse all PresaleManager clones created via the public factory.
          </p>
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-muted p-4 text-sm text-text-muted backdrop-blur-sm transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.03)] lg:flex-row lg:gap-8">
            <div>
              <p>Live auctions</p>
              <strong className="mt-1 block text-[0.95rem] font-semibold text-text">Real-time tracking</strong>
            </div>
            <div>
              <p>Factory clones</p>
              <strong className="mt-1 block text-[0.95rem] font-semibold text-text">Permissionless creation</strong>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex flex-col items-start gap-4 lg:items-end">
          <button 
            onClick={loadPresales} 
            className="rounded-full border border-[rgba(255,255,255,0.1)] bg-gradient-to-r from-primary via-[#7c3aed] to-[#ec4899] px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            Refresh
          </button>
          <button 
            onClick={() => window.location.reload()} 
            className="rounded-full border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.05)] px-6 py-2.5 text-sm font-medium text-[#38bdf8] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(56,189,248,0.5)] hover:bg-[rgba(56,189,248,0.1)]"
          >
            Reload Page
          </button>
        </div>
      </div>

      {error && (
        <div className="relative overflow-hidden rounded-2xl border border-[rgba(239,68,68,0.3)] bg-gradient-to-br from-[rgba(239,68,68,0.1)] to-[rgba(220,38,38,0.05)] p-6 before:absolute before:right-4 before:top-4 before:text-2xl before:opacity-30">
          <div className="relative z-10">
            <p className="mb-2 font-semibold text-[#fca5a5]">⚠️ Error Loading Presales</p>
            <p className="mb-4 text-sm leading-relaxed text-[#fecaca]">{error}</p>
            {error.includes('not deployed') && (
              <div className="rounded-xl border border-[rgba(239,68,68,0.2)] bg-[rgba(0,0,0,0.2)] p-4">
                <p className="mb-2 text-sm font-medium text-[#fca5a5]">To fix this issue:</p>
                <ol className="m-0 list-none p-0">
                  <li className="mb-1 border-l-2 border-l-[rgba(239,68,68,0.3)] pl-3 text-xs text-[#fecaca]">
                    Make sure Hardhat network is running: <span className="rounded border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.1)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[#fca5a5]">npx hardhat node</span>
                  </li>
                  <li className="mb-1 border-l-2 border-l-[rgba(239,68,68,0.3)] pl-3 text-xs text-[#fecaca]">
                    Deploy contracts: <span className="rounded border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.1)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[#fca5a5]">npm run deploy:all</span>
                  </li>
                  <li className="border-l-2 border-l-[rgba(239,68,68,0.3)] pl-3 text-xs text-[#fecaca]">Refresh this page</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-8 text-center shadow-card backdrop-blur-[12px]">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[rgba(99,102,241,0.2)] border-t-primary"></div>
          <p className="relative z-10 text-lg font-medium text-text-muted">Loading presales...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[2rem] border border-border bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-8 text-center shadow-card backdrop-blur-[12px]">
          <div className="mb-4 flex items-center justify-center opacity-50">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-[rgba(248,250,252,0.3)]">
              <div className="relative h-8 w-8 rounded border-2 border-[rgba(248,250,252,0.3)]">
                <div className="absolute left-1/2 top-1/2 h-1 w-4 -translate-x-1/2 -translate-y-1/2 rounded bg-[rgba(248,250,252,0.3)]"></div>
                <div className="absolute left-1/2 top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-[rgba(248,250,252,0.3)]"></div>
              </div>
            </div>
          </div>
          <h3 className="mb-2 text-2xl font-semibold text-text-muted">No presales deployed yet</h3>
          <p className="mx-auto max-w-[400px] text-base leading-relaxed text-text-muted">
            Create your first presale using the PublicPresaleFactory to see it listed here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2 md:gap-6">
          {items.map((presale) => (
            <PresaleCard key={presale.manager} presale={presale} />
          ))}
        </div>
      )}
    </section>
  );
};

export default AllPresales;
