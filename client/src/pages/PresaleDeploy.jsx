import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract } from "ethers";

import deployments from "../abi/data/stppDeployments.json";
import allAbis from "../abi/allAbis.json";

import { ensureProvider } from "../services/web3/provider";
import { ensureSigner } from "../services/web3/signer";
import { getNetworkName, requestAccount, subscribeWalletEvents } from "../services/web3/wallet";
import { useAddressBook } from "../services/web3/addressBook";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import PresaleCreateForm from "../components/presale/PresaleCreateForm";
import PresaleInfoCard from "../components/presale/PresaleInfoCard";
import PresaleList from "../components/presale/PresaleList";

const now = Math.floor(Date.now() / 1000);
const defaultAuctionInput = JSON.stringify(
  {
    saleToken: "0x0000000000000000000000000000000000000000",
    treasury: "0x0000000000000000000000000000000000000000",
    startTime: now + 3600,
    commitDuration: 3600,
    revealDuration: 3600,
    perAddressCap: "0",
    softCap: "0",
    tokensForSale: "0",
    bonusReserve: "0",
    earlyBonusWindow: 0,
    earlyBonusPct: 0,
    nonRevealPenaltyBps: 0,
    lbpStableShareBps: 0,
    thresholdLow: 0,
    maxDecayMultiplier: 0,
    minCommitDuration: 0,
    demandCheckTime: now + 7200,
    vestingStart: now + 10800,
    vestingDuration: 604800,
    merkleRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
    priceTicks: ["1000000000000000000"]
  },
  null,
  2
);

const defaultLbpConfig = JSON.stringify(
  {
    startTime: now + 14400,
    endTime: now + 17400,
    poolStartWeightToken: "800000000000000000",
    poolEndWeightToken: "200000000000000000",
    poolSwapFee: "3000000000000000",
    vestingStartTime: now + 20000,
    vestingCliffDuration: 0,
    vestingFinalDuration: 604800,
    vestingCliffPercentBP: 0
  },
  null,
  2
);

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
  const legacyAddresses = latestEntry?.deployments ?? latestEntry ?? {};
  const addressBook = useAddressBook();

  const [walletAddress, setWalletAddress] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [chainId, setChainId] = useState(null);
  const [auctionInputJSON, setAuctionInputJSON] = useState(defaultAuctionInput);
  const [lbpConfigJSON, setLbpConfigJSON] = useState(defaultLbpConfig);
  const [presales, setPresales] = useState([]);
  const [userPresales, setUserPresales] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [creating, setCreating] = useState(false);
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
  }, [resolvedRegistry, legacyAddresses]);
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

      // Filter presales for current user
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

  // Update user presales filter when wallet address changes
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

  const handleCreatePresale = async () => {
    if (!factoryAvailable) {
      setErrorMessage("PublicPresaleFactory address not available");
      return;
    }
    setStatusMessage("");
    setErrorMessage("");

    let auctionPayload;
    let lbpPayload;
    try {
      auctionPayload = JSON.parse(auctionInputJSON);
      lbpPayload = JSON.parse(lbpConfigJSON);
    } catch (error) {
      setErrorMessage("Invalid JSON payloads. Please double-check the inputs.");
      return;
    }

    const isZeroAddress = (value) =>
      typeof value === "string" && value.toLowerCase() === "0x0000000000000000000000000000000000000000";
    const isValidAddress = (value) => typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);

    if (!isValidAddress(auctionPayload.saleToken) || isZeroAddress(auctionPayload.saleToken)) {
      setErrorMessage("saleToken must be a valid ERC20 address.");
      return;
    }

    if (!isValidAddress(auctionPayload.treasury) || isZeroAddress(auctionPayload.treasury)) {
      setErrorMessage("treasury must be a valid address.");
      return;
    }

    if (!Array.isArray(auctionPayload.priceTicks) || auctionPayload.priceTicks.length === 0) {
      setErrorMessage("priceTicks array cannot be empty.");
      return;
    }

    setCreating(true);
    try {
      const factory = await getFactoryContract();
      showTxInfo("Please confirm the transaction in your wallet", { autoClose: false });
      const tx = await factory.createPresale(auctionPayload, lbpPayload);
      showTxInfo("Transaction submitted to the network", { autoClose: 3000 });
      setStatusMessage("Transaction submitted, waiting for confirmation…");
      await tx.wait();
      showTxSuccess("Presale created successfully!", { autoClose: 3000 });
      setStatusMessage("Presale created successfully!");
      await loadPresales();
    } catch (error) {
      console.error(error);
      handleTxError(error, "Failed to create presale");
      setErrorMessage(error?.message || "Failed to create presale");
    } finally {
      setCreating(false);
    }
  };

  if (!latestEntry) {
    return (
      <section className="page">
        <div className="card">
          <h2>No deployment history found</h2>
          <p>Run the on-chain deploy script to initialize the permissionless presale system.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="card">
        <h1>Presale Deployment Console</h1>
        <p>Interact with the permissionless presale factory deployed on-chain.</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Wallet</h2>
            <p>Address: {walletAddress || "Not connected"}</p>
            <p>Network: {networkName || "Unknown"}</p>
          </div>
          <button className="btn primary" onClick={connectWallet} disabled={initializing}>
            {walletAddress ? "Reconnect" : "Connect Wallet"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Deployed Contracts</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {infoCards.map((card) => (
            <PresaleInfoCard key={card.name} title={card.name} address={resolveAddressValue(card.keys)} />
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Create New Presale</h2>
        {!factoryAvailable ? (
          <p style={{ color: "#f87171" }}>PublicPresaleFactory address is not yet available.</p>
        ) : (
          <PresaleCreateForm
            auctionJSON={auctionInputJSON}
            lbpJSON={lbpConfigJSON}
            onAuctionChange={setAuctionInputJSON}
            onLbpChange={setLbpConfigJSON}
            onSubmit={handleCreatePresale}
            submitting={creating}
            disabled={!factoryAvailable}
          />
        )}
        {statusMessage && <p style={{ color: "#14b8a6", marginTop: "0.75rem" }}>{statusMessage}</p>}
        {errorMessage && <p style={{ color: "#f87171", marginTop: "0.5rem" }}>{errorMessage}</p>}
      </div>

      <div className="card">
        <h2>Existing Presales</h2>
        {!factoryAvailable ? (
          <p>Factory not deployed, no presales to display.</p>
        ) : loading ? (
          <p>Loading presales…</p>
        ) : (
          <PresaleList items={userPresales} />
        )}
      </div>
    </section>
  );
};

export default PresaleDeploy;
