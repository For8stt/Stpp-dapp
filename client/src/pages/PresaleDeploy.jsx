import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";

import deployments from "../abi/data/stppDeployments.json";
import PresaleManagerABI from "../abi/PresaleManager.json";
import PublicPresaleFactoryABI from "../abi/PublicPresaleFactory.json";
import AuctionFactoryABI from "../abi/AuctionFactory.json";
import LBPOracleABI from "../abi/LBPOracle.json";
import UpkeepControllerABI from "../abi/UpkeepController.json";

import { ensureProvider } from "../services/web3/provider";
import { ensureSigner } from "../services/web3/signer";
import { getNetworkName, requestAccount, subscribeWalletEvents } from "../services/web3/wallet";
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

const infoCards = [
  { name: "PresaleManager Impl", key: "managerImpl", abi: PresaleManagerABI },
  { name: "PublicPresaleFactory", key: "publicFactory", abi: PublicPresaleFactoryABI },
  { name: "AuctionFactory", key: "auctionFactory", abi: AuctionFactoryABI },
  { name: "UpkeepController", key: "upkeepController", abi: UpkeepControllerABI },
  { name: "LBPOracle", key: "lbpOracle", abi: LBPOracleABI }
];

const PresaleDeploy = () => {
  const latestEntry =
    deployments?.entries && deployments.entries.length > 0
      ? deployments.entries[deployments.entries.length - 1]
      : null;
  const addresses = latestEntry?.deployments ?? latestEntry ?? {};

  const [walletAddress, setWalletAddress] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [auctionInputJSON, setAuctionInputJSON] = useState(defaultAuctionInput);
  const [lbpConfigJSON, setLbpConfigJSON] = useState(defaultLbpConfig);
  const [presales, setPresales] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [creating, setCreating] = useState(false);

  const factoryAddress = addresses?.publicFactory;
  const factoryAvailable = Boolean(factoryAddress);

  const connectWallet = useCallback(async () => {
    try {
      const account = await requestAccount();
      if (account) {
        setWalletAddress(account);
      }
      const name = await getNetworkName();
      setNetworkName(name);
      await ensureProvider();
    } catch (error) {
      setErrorMessage(error?.message || "Failed to connect wallet");
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    connectWallet();
    const unsubscribe = subscribeWalletEvents({
      onAccountsChanged: (accounts) => setWalletAddress(accounts?.[0] ?? ""),
      onChainChanged: async () => {
        const name = await getNetworkName();
        setNetworkName(name);
      }
    });
    return () => unsubscribe();
  }, [connectWallet]);

  const getFactoryContract = useCallback(async () => {
    if (!factoryAddress) {
      throw new Error("PublicPresaleFactory address not available");
    }
    const signer = await ensureSigner();
    return new Contract(factoryAddress, PublicPresaleFactoryABI.abi, signer);
  }, [factoryAddress]);

  const loadPresales = useCallback(async () => {
    if (!factoryAddress) return;
    try {
      setLoading(true);
      const factory = await getFactoryContract();
      const logs = await factory.queryFilter(factory.filters.PresaleCreated());
      const formatted = logs.map((event) => ({
        owner: event.args?.owner || "",
        manager: event.args?.manager || "",
        auction: event.args?.auction || "",
        lbp: event.args?.lbp || "",
        vesting: event.args?.vesting || "",
        blockNumber: Number(event.blockNumber || 0),
        txHash: event.transactionHash
      }));
      setPresales(formatted);
    } catch (error) {
      setErrorMessage(error?.message || "Unable to load presales");
    } finally {
      setLoading(false);
    }
  }, [factoryAddress, getFactoryContract]);

  useEffect(() => {
    loadPresales();
  }, [loadPresales]);

  useEffect(() => {
    if (!factoryAddress) return;
    let factoryInstance;
    const handler = (owner, manager, auction, lbp, vesting, event) => {
      setPresales((prev) => [
        ...prev,
        {
          owner,
          manager,
          auction,
          lbp,
          vesting,
          blockNumber: Number(event.blockNumber || 0),
          txHash: event.transactionHash
        }
      ]);
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
  }, [factoryAddress, getFactoryContract]);

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
      const tx = await factory.createPresale(auctionPayload, lbpPayload);
      setStatusMessage("Transaction submitted, waiting for confirmation…");
      await tx.wait();
      setStatusMessage("Presale created successfully!");
      await loadPresales();
    } catch (error) {
      console.error(error);
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
            <PresaleInfoCard key={card.key} title={card.name} address={addresses[card.key]} />
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
          <PresaleList items={presales} />
        )}
      </div>
    </section>
  );
};

export default PresaleDeploy;
