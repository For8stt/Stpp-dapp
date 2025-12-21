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
      <section className="flex flex-col gap-6">
        <div className="rounded-[12px] bg-surface p-6 shadow-card">
          <h2 className="m-0 mb-2 text-2xl font-semibold text-text">No deployment history found</h2>
          <p className="m-0 text-text-muted">Run the on-chain deploy script to initialize the permissionless presale system.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-[12px] bg-surface p-6 shadow-card">
        <h1 className="m-0 mb-2 text-3xl font-bold text-text">Presale Deployment Console</h1>
        <p className="m-0 text-text-muted">Interact with the permissionless presale factory deployed on-chain.</p>
      </div>

      <div className="rounded-[12px] bg-surface p-6 shadow-card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="m-0 mb-2 text-2xl font-semibold text-text">Wallet</h2>
            <p className="m-0 mb-1 text-text-muted">Address: {walletAddress || "Not connected"}</p>
            <p className="m-0 text-text-muted">Network: {networkName || "Unknown"}</p>
          </div>
          <button
            className="cursor-pointer rounded-lg border-0 bg-primary px-6 py-3 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={connectWallet}
            disabled={initializing}
          >
            {walletAddress ? "Reconnect" : "Connect Wallet"}
          </button>
        </div>
      </div>

      <div className="rounded-[12px] bg-surface p-6 shadow-card">
        <h2 className="m-0 mb-4 text-2xl font-semibold text-text">Deployed Contracts</h2>
        <div className="flex flex-wrap gap-4">
          {infoCards.map((card) => (
            <PresaleInfoCard key={card.name} title={card.name} address={resolveAddressValue(card.keys)} />
          ))}
        </div>
      </div>

      <div className="rounded-[12px] bg-surface p-6 shadow-card">
        <h2 className="m-0 mb-4 text-2xl font-semibold text-text">Existing Presales</h2>
        {!factoryAvailable ? (
          <p className="m-0 text-text-muted">Factory not deployed, no presales to display.</p>
        ) : loading ? (
          <p className="m-0 text-text-muted">Loading presales…</p>
        ) : (
          <PresaleList items={userPresales} />
        )}
      </div>
    </section>
  );
};

export default PresaleDeploy;
