import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import CreatePresaleForm from "../components/presale/CreatePresaleForm";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import styles from "./CreatePresale.module.css";

const STORAGE_KEY = "sttp:recent-presales";
const now = () => Math.floor(Date.now() / 1000);
const toDateInput = (secondsFromNow) =>
  new Date((now() + secondsFromNow) * 1000).toISOString().slice(0, 16);

const getInitialValues = () => ({
  saleToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  treasury: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  tokensForSale: "1000000",
  bonusReserve: "50000",
  perAddressCap: "10000",
  softCap: "500000",
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  demandCheckDelay: "1800",
  earlyBonusWindow: "600",
  earlyBonusPct: "0",
  nonRevealPenaltyBps: "0",
  lbpStableShareBps: "4000",
  thresholdLow: "0",
  maxDecayMultiplier: "1",
  minCommitDuration: "600",
  merkleRoot: ethers.ZeroHash,
  vestingStart: toDateInput(86400),
  vestingDuration: "2592000",
  priceTicks: "1,0.9,0.8",
  lbpStart: toDateInput(7200),
  lbpEnd: toDateInput(17200),
  poolStartWeightToken: "80",
  poolEndWeightToken: "20",
  poolSwapFee: "0.003",
  vestingCliffDuration: "0",
  vestingFinalDuration: "2592000",
  vestingCliffPercentBP: "0",
});

const parseTimestamp = (value) => {
  if (!value) return now() + 600;
  const result = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(result) ? result : now() + 600;
};

const parseEtherValue = (value) => (value ? ethers.parseUnits(value, 18).toString() : "0");
const parseBps = (value) => Number(value || 0);
const parseWeight = (value) => ethers.parseUnits(((Number(value || 0) / 100) || 0).toString(), 18).toString();

const persistPresale = (entry) => {
  if (typeof window === "undefined") return;
  const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  current.unshift(entry);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current.slice(0, 20)));
};

const CreatePresale = ({ account, onConnect }) => {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState(getInitialValues);
  const [submitting, setSubmitting] = useState(false);

  const connectedAccount = account;

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const priceTicks = useMemo(
    () =>
      formValues.priceTicks
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [formValues.priceTicks]
  );

  const buildAuctionInput = () => {
    const startTime = parseTimestamp(formValues.startTime);
    const demandCheckTime = startTime + Number(formValues.demandCheckDelay || 0);
    return {
      saleToken: formValues.saleToken,
      treasury: formValues.treasury,
      startTime,
      commitDuration: Number(formValues.commitDuration || 0),
      revealDuration: Number(formValues.revealDuration || 0),
      perAddressCap: parseEtherValue(formValues.perAddressCap),
      softCap: parseEtherValue(formValues.softCap),
      tokensForSale: parseEtherValue(formValues.tokensForSale),
      bonusReserve: parseEtherValue(formValues.bonusReserve),
      earlyBonusWindow: Number(formValues.earlyBonusWindow || 0),
      earlyBonusPct: parseBps(formValues.earlyBonusPct),
      nonRevealPenaltyBps: parseBps(formValues.nonRevealPenaltyBps),
      lbpStableShareBps: parseBps(formValues.lbpStableShareBps),
      thresholdLow: Number(formValues.thresholdLow || 0),
      maxDecayMultiplier: ethers.parseUnits(formValues.maxDecayMultiplier || "1", 18).toString(),
      minCommitDuration: Number(formValues.minCommitDuration || 0),
      demandCheckTime,
      vestingStart: parseTimestamp(formValues.vestingStart),
      vestingDuration: Number(formValues.vestingDuration || 0),
      merkleRoot: formValues.merkleRoot || ethers.ZeroHash,
      priceTicks: priceTicks.map((tick) => ethers.parseEther(tick || "0").toString()),
    };
  };

  const buildLbpConfig = () => ({
    startTime: parseTimestamp(formValues.lbpStart),
    endTime: parseTimestamp(formValues.lbpEnd),
    poolStartWeightToken: parseWeight(formValues.poolStartWeightToken),
    poolEndWeightToken: parseWeight(formValues.poolEndWeightToken),
    poolSwapFee: ethers.parseUnits(formValues.poolSwapFee || "0.003", 18).toString(),
    vestingStartTime: parseTimestamp(formValues.vestingStart),
    vestingCliffDuration: Number(formValues.vestingCliffDuration || 0),
    vestingFinalDuration: Number(formValues.vestingFinalDuration || 0),
    vestingCliffPercentBP: parseBps(formValues.vestingCliffPercentBP),
  });

  const handleSubmit = async () => {
    try {
      if (!window?.ethereum) {
        throw new Error("Wallet not detected. Please install MetaMask.");
      }

      setSubmitting(true);
      showTxInfo("Please confirm the transaction in your wallet", { autoClose: false });
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const factory = await loadContract("PublicPresaleFactory");
      const auctionInput = buildAuctionInput();
      const lbpConfig = buildLbpConfig();
      const tx = await factory.createPresale(auctionInput, lbpConfig);
      showTxInfo("Transaction submitted to the network", { autoClose: 3000 });

      const receipt = await tx.wait();
      let createdEvent = receipt.events?.find((event) => event.event === "PresaleCreated");
      if (!createdEvent) {
        const eventsFromFilter = await factory.queryFilter(
          factory.filters.PresaleCreated(),
          receipt.blockNumber,
          receipt.blockNumber
        );
        createdEvent = eventsFromFilter[0];
      }
      if (!createdEvent) {
        const eventParsedLog = receipt.logs
          .map((log) => {
            try {
              return factory.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed) => parsed?.name === "PresaleCreated");
        createdEvent = eventParsedLog;
      }

      if (!createdEvent) {
        throw new Error("Failed to read PresaleCreated event");
      }

      const managerAddress = createdEvent.args?.manager;
      persistPresale({
        manager: managerAddress,
        owner: createdEvent.args?.owner,
        auction: createdEvent.args?.auction,
        lbp: createdEvent.args?.lbp,
        vesting: createdEvent.args?.vesting,
        timestamp: Date.now(),
      });

      showTxSuccess("Presale created successfully!", { autoClose: 3000 });
      navigate(`/presale/${managerAddress}`);
    } catch (error) {
      console.error(error);
      handleTxError(error, "Failed to create presale");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.heroCard}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Create a permissionless presale</h1>
          <p className={styles.heroSubtitle}>
            Configure your auction parameters and deploy a dedicated PresaleManager clone via the public factory.
            Launch your token sale with advanced Dutch auction mechanics and automated liquidity bootstrapping.
          </p>
          <div className={styles.heroStats}>
            <div>
              <p>Smart contracts</p>
              <strong>Automated deployment</strong>
            </div>
            <div>
              <p>Liquidity bootstrap</p>
              <strong>Built-in LBP</strong>
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          {!connectedAccount ? (
            <button onClick={onConnect} className={styles.heroButton}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect Wallet
            </button>
          ) : (
            <div className={styles.connectedPill}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Wallet Connected
            </div>
          )}
        </div>
      </div>

      {/* Form Section */}
      <div className={styles.formCard}>
        <CreatePresaleForm values={formValues} onChange={handleChange} onSubmit={handleSubmit} submitting={submitting} />
      </div>

      {/* Status Indicator */}
    </section>
  );
};

export default CreatePresale;
