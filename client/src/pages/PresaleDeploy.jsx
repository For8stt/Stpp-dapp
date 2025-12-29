import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract } from "ethers";

import deployments from "../abi/data/stppDeployments.json";
import allAbis from "../abi/allAbis.json";

import { ensureProvider } from "../services/web3/provider";
import { ensureSigner } from "../services/web3/signer";
import { getNetworkName, requestAccount, subscribeWalletEvents } from "../services/web3/wallet";
import { useAddressBook } from "../services/web3/addressBook";
import PresaleInfoCard from "../components/presale/PresaleInfoCard";
import PresaleList from "../components/presale/PresaleList";

const ADDRESS_ALIASES = {
  managerImpl: ["presaleManagerImpl", "managerImpl"],
  publicFactory: ["publicPresaleFactory", "publicFactory"],
  auctionFactory: ["auctionFactory"],
  upkeepController: ["upkeepController"],
  lbpOracle: ["lbpOracle", "feeOracle"],
};

const resolveRegistry = (addressBook, chainId) => {
  if (!addressBook || typeof addressBook !== "object") {
    return undefined;
  }
  if (!chainId) {
    return addressBook.default || addressBook;
  }
  const key = chainId.toString();
  const candidate = addressBook[key];
  if (candidate && typeof candidate === "object") {
    return candidate;
  }
  if (addressBook.default && typeof addressBook.default === "object") {
    return addressBook.default;
  }
  return addressBook;
};

const infoCards = [
  { name: "PresaleManager Impl", keys: ADDRESS_ALIASES.managerImpl, abi: allAbis.PresaleManager },
  { name: "PublicPresaleFactory", keys: ADDRESS_ALIASES.publicFactory, abi: allAbis.PublicPresaleFactory },
  { name: "AuctionFactory", keys: ADDRESS_ALIASES.auctionFactory, abi: allAbis.AuctionFactory },
  { name: "UpkeepController", keys: ADDRESS_ALIASES.upkeepController, abi: allAbis.UpkeepController },
  { name: "LBPOracle", keys: ADDRESS_ALIASES.lbpOracle, abi: allAbis.FeeOracleMock }
];

const createPresaleEntry = (event) => {
  const data = {
    owner: event.args?.owner || "",
    manager: event.args?.manager || "",
    auction: event.args?.auction || "",
    lbp: event.args?.lbp || "",
    vesting: event.args?.vesting || "",
    blockNumber: Number(event.blockNumber || 0),
    txHash: event.transactionHash,
  };
  return data;
};

const getReadProvider = () => {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.ethereum) {
    return new BrowserProvider(window.ethereum);
  }
  try {
    return ensureProvider();
  } catch {
    return null;
  }
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
      lbp: info ? info[2] : "",
      vesting: info ? info[3] : "",
      finalized: info ? info[4] : false,
    };
  } catch (error) {
    console.warn("Failed to load manager info", error);
    return null;
  }
};

const PresaleDeploy = () => {
  const latestEntry =
    deployments?.entries && deployments.entries.length > 0
      ? deployments.entries[deployments.entries.length - 1]
      : null;
  const legacyAddresses = useMemo(() => latestEntry?.deployments ?? latestEntry ?? {}, [latestEntry]);
  const addressBook = useAddressBook();

  const [walletAddress, setWalletAddress] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [chainId, setChainId] = useState(null);
  const [presales, setPresales] = useState([]);
  const [userPresales, setUserPresales] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const resolvedRegistry = useMemo(() => resolveRegistry(addressBook, chainId), [addressBook, chainId]);
  const resolvedRecords = useMemo(() => {
    const records = [];
    if (resolvedRegistry) {
      records.push(resolvedRegistry);
    }
    if (addressBook?.default && typeof addressBook.default === "object") {
      records.push(addressBook.default);
    }
    if (legacyAddresses && Object.keys(legacyAddresses).length > 0) {
      records.push(legacyAddresses);
    }
    return records;
  }, [resolvedRegistry, legacyAddresses, addressBook?.default]);
  const resolveAddressValue = useCallback(
    (keys) => {
      for (const record of resolvedRecords) {
        for (const key of keys) {
          const value = record?.[key];
          if (value) {
            return value;
          }
        }
      }
      return null;
    },
    [resolvedRecords]
  );
  const factoryAddress = resolveAddressValue(ADDRESS_ALIASES.publicFactory);
  const factoryAvailable = Boolean(factoryAddress);

  const refreshNetworkData = useCallback(async () => {
    const provider = ensureProvider();
    const network = await provider.getNetwork();
    setChainId(Number(network.chainId));
    const name = await getNetworkName();
    setNetworkName(name);
  }, []);

  const connectWallet = useCallback(async () => {
    try {
      const account = await requestAccount();
      if (account) {
        setWalletAddress(account);
      }
      await refreshNetworkData();
    } catch (error) {
      setErrorMessage(error?.message || "Failed to connect wallet");
    } finally {
      setInitializing(false);
    }
  }, [refreshNetworkData]);

  useEffect(() => {
    connectWallet();
    const unsubscribe = subscribeWalletEvents({
      onAccountsChanged: (accounts) => setWalletAddress(accounts?.[0] ?? ""),
      onChainChanged: async () => {
        try {
          await refreshNetworkData();
        } catch (error) {
          console.error(error);
        }
      }
    });
    return () => unsubscribe();
  }, [connectWallet, refreshNetworkData]);

  const getFactoryContract = useCallback(async () => {
    if (!factoryAddress) {
      throw new Error("PublicPresaleFactory address not available");
    }
    const signer = await ensureSigner();
    const abi = Array.isArray(allAbis.PublicPresaleFactory) ? allAbis.PublicPresaleFactory : (allAbis.PublicPresaleFactory?.abi || allAbis.PublicPresaleFactory);
    return new Contract(factoryAddress, abi, signer);
  }, [factoryAddress]);

  const loadPresales = useCallback(async () => {
    if (!factoryAddress) return;
    try {
      setLoading(true);
      const factory = await getFactoryContract();
      const [logs, managerAddresses] = await Promise.all([
        factory.queryFilter(factory.filters.PresaleCreated()),
        factory.getPresales()
      ]);
      const eventEntries = logs.map(createPresaleEntry);
      const eventMap = new Map(
        eventEntries.map((entry) => [entry.manager.toLowerCase(), entry])
      );
      const managerDetails = await Promise.all(managerAddresses.map((address) => fetchManagerDetails(address)));
      const detailMap = new Map(
        managerDetails
          .filter(Boolean)
          .map((detail) => [detail.manager?.toLowerCase(), detail])
      );
      const combined = managerAddresses
        .map((managerAddress) => {
          const key = managerAddress.toLowerCase();
          const eventEntry = eventMap.get(key);
          const detail = detailMap.get(key);
          if (!eventEntry && !detail) {
            return null;
          }
          return {
            manager: managerAddress,
            owner: detail?.owner || eventEntry?.owner || "",
            auction: detail?.auction || eventEntry?.auction || "",
            lbp: detail?.lbp || eventEntry?.lbp || "",
            vesting: detail?.vesting || eventEntry?.vesting || "",
            blockNumber: eventEntry?.blockNumber || null,
            txHash: eventEntry?.txHash || "",
            finalized: detail?.finalized ?? eventEntry?.finalized ?? false
          };
        })
        .filter(Boolean);
      setPresales(combined);

      const filtered = combined.filter(presale =>
        walletAddress && presale.owner.toLowerCase() === walletAddress.toLowerCase()
      );
      setUserPresales(filtered);
    } catch (error) {
      setErrorMessage(error?.message || "Unable to load presales");
    } finally {
      setLoading(false);
    }
  }, [factoryAddress, getFactoryContract, walletAddress]);

  useEffect(() => {
    loadPresales();
  }, [loadPresales]);

  useEffect(() => {
    const filtered = presales.filter(presale =>
      walletAddress && presale.owner.toLowerCase() === walletAddress.toLowerCase()
    );
    setUserPresales(filtered);
  }, [presales, walletAddress]);

  useEffect(() => {
    if (!factoryAddress) return;
    let factoryInstance;
    const handler = () => {
      loadPresales();
    };
    (async () => {
      try {
        factoryInstance = await getFactoryContract();
        factoryInstance.on("PresaleCreated", handler);
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      if (factoryInstance) {
        factoryInstance.off("PresaleCreated", handler);
      }
    };
  }, [factoryAddress, getFactoryContract, loadPresales]);

  if (!latestEntry) {
    return (
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.02),transparent_70%)]"></div>
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-[2px] backdrop-blur-xl shadow-2xl shadow-primary/30 transition-all duration-700 hover:border-primary/80 hover:shadow-[0_12px_48px_rgba(99,102,241,0.6),0_0_0_1px_rgba(99,102,241,0.5)]">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/80 via-indigo-500/80 via-purple-500/80 to-secondary/80 opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
              <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-60"></div>
              <div className="relative z-0 overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface to-surface p-8 sm:p-10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/12 to-secondary/20 opacity-70 transition-opacity duration-700 group-hover:opacity-100"></div>
                <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
                <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
                <div className="relative z-10">
                  <h2 className="mb-4 bg-gradient-to-br from-text via-text to-text/80 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">No deployment history found</h2>
                  <p className="text-lg text-text-muted sm:text-xl">Run the on-chain deploy script to initialize the permissionless presale system.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden py-16 sm:py-20">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.02),transparent_70%)]"></div>
      </div>
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-8">
                    <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-[2px] backdrop-blur-xl shadow-2xl shadow-primary/30 transition-all duration-700 hover:border-primary/80 hover:shadow-[0_12px_48px_rgba(99,102,241,0.6),0_0_0_1px_rgba(99,102,241,0.5)]">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/80 via-indigo-500/80 via-purple-500/80 to-secondary/80 opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
            <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-60"></div>
            <div className="relative z-0 overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface to-surface p-8 sm:p-10">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/12 to-secondary/20 opacity-70 transition-opacity duration-700 group-hover:opacity-100"></div>
              <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
              <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
              <div className="relative z-10">
                <h1 className="mb-4 bg-gradient-to-br from-text via-text to-text/80 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl lg:text-6xl">Presale Deployment Console</h1>
                <p className="text-lg text-text-muted sm:text-xl">Interact with the permissionless presale factory deployed on-chain.</p>
              </div>
            </div>
          </div>

                    <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-[2px] backdrop-blur-xl shadow-2xl shadow-primary/30 transition-all duration-700 hover:border-primary/80 hover:shadow-[0_12px_48px_rgba(99,102,241,0.6),0_0_0_1px_rgba(99,102,241,0.5)]">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/80 via-indigo-500/80 via-purple-500/80 to-secondary/80 opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
            <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-60"></div>
            <div className="relative z-0 overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface to-surface p-8 sm:p-10">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/12 to-secondary/20 opacity-70 transition-opacity duration-700 group-hover:opacity-100"></div>
              <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
              <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
              <div className="relative z-10">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/15 text-primary shadow-lg">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <h2 className="bg-gradient-to-r from-text via-primary to-text bg-clip-text text-2xl font-bold text-transparent">Wallet</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border-2 border-border/50 bg-gradient-to-br from-surface/90 to-surface/80 p-4 shadow-lg">
                    <span className="text-sm font-semibold text-text-muted">Address:</span>
                    <span className="font-mono text-base font-bold text-text">{walletAddress || "Not connected"}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border-2 border-border/50 bg-gradient-to-br from-surface/90 to-surface/80 p-4 shadow-lg">
                    <span className="text-sm font-semibold text-text-muted">Network:</span>
                    <span className="text-base font-bold text-text">{networkName || "Unknown"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

                    <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-[2px] backdrop-blur-xl shadow-2xl shadow-primary/30 transition-all duration-700 hover:border-primary/80 hover:shadow-[0_12px_48px_rgba(99,102,241,0.6),0_0_0_1px_rgba(99,102,241,0.5)]">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/80 via-indigo-500/80 via-purple-500/80 to-secondary/80 opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
            <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-60"></div>
            <div className="relative z-0 overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface to-surface p-8 sm:p-10">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/12 to-secondary/20 opacity-70 transition-opacity duration-700 group-hover:opacity-100"></div>
              <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
              <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
              <div className="relative z-10">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/15 text-primary shadow-lg">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="bg-gradient-to-r from-text via-primary to-text bg-clip-text text-2xl font-bold text-transparent">Deployed Contracts</h2>
                </div>
                <div className="flex flex-wrap gap-4">
                  {infoCards.map((card) => (
                    <PresaleInfoCard key={card.name} title={card.name} address={resolveAddressValue(card.keys)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

                    <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-[2px] backdrop-blur-xl shadow-2xl shadow-primary/30 transition-all duration-700 hover:border-primary/80 hover:shadow-[0_12px_48px_rgba(99,102,241,0.6),0_0_0_1px_rgba(99,102,241,0.5)]">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/80 via-indigo-500/80 via-purple-500/80 to-secondary/80 opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
            <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-60"></div>
            <div className="relative z-0 overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface to-surface p-8 sm:p-10">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/12 to-secondary/20 opacity-70 transition-opacity duration-700 group-hover:opacity-100"></div>
              <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
              <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
              <div className="relative z-10">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/15 text-primary shadow-lg">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  </div>
                  <h2 className="bg-gradient-to-r from-text via-primary to-text bg-clip-text text-2xl font-bold text-transparent">Existing Presales</h2>
                </div>
                {!factoryAvailable ? (
                  <p className="text-base text-text-muted">Factory not deployed, no presales to display.</p>
                ) : loading ? (
                  <p className="text-base text-text-muted">Loading presales…</p>
                ) : (
                  <PresaleList items={userPresales} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PresaleDeploy;
