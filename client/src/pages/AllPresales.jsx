import React, { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";

import PresaleCard from "../components/presale/PresaleCard";
import deployments from "../abi/data/stppDeployments.json";
import PublicPresaleFactoryABI from "../abi/PublicPresaleFactory.json";
import PresaleManagerABI from "../abi/PresaleManager.json";

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
      const manager = new Contract(managerAddress, PresaleManagerABI.abi, provider);
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
        lbp: info ? info[2] : "",
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

      const factory = new Contract(latestEntry.publicFactory, PublicPresaleFactoryABI.abi, provider);
      const presales = await factory.getPresales();

      const enriched = await Promise.all(
        presales.map(async (managerAddress) => {
          return await fetchManagerDetails(managerAddress);
        })
      );

      setItems(enriched.filter(Boolean));
    } catch (factoryError) {
      console.error(factoryError);
      setError(factoryError?.message || "Failed to load presales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresales();
  }, [loadPresales]);

  return (
    <section className="page space-y-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-8 text-white shadow-lg shadow-black/30">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Permissionless presales</h1>
            <p className="text-white/70">Browse all PresaleManager clones created via the public factory.</p>
          </div>
          <button
            onClick={loadPresales}
            className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center text-white/70">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center text-white/70">
          No presales deployed yet.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">{items.map((presale) => <PresaleCard key={presale.manager} presale={presale} />)}</div>
      )}
    </section>
  );
};

export default AllPresales;
