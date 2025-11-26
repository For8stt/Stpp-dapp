import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import TxStatusIndicator from "../components/common/TxStatusIndicator";
import CreatePresaleForm from "../components/presale/CreatePresaleForm";
import loadContract from "../services/web3/loadContract";
import styles from "./CreatePresale.module.css";

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

const fetchPresaleDetails = async (managerAddress) => {
  if (!managerAddress) {
    throw new Error("Missing manager address");
  }
  const manager = await loadContract("PresaleManager", managerAddress);
  const owner = await manager.owner();
  const info = await manager.getLatestPresaleInfo();
  return {
    manager: managerAddress,
    owner,
    auction: info[1],
    lbp: info[2],
    vesting: info[3],
    timestamp: Date.now(),
  };
};

const CreatePresale = ({ account, onConnect }) => {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState(getInitialValues);
  const [submitting, setSubmitting] = useState(false);
  const [txIndicator, setTxIndicator] = useState(null);
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
      setTxIndicator({ status: "pending", message: "Waiting for wallet confirmation..." });
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const factory = await loadContract("PublicPresaleFactory");
      const auctionInput = buildAuctionInput();
      const lbpConfig = buildLbpConfig();
      const tx = await factory.createPresale(auctionInput, lbpConfig);
      setTxIndicator({ status: "pending", message: "Transaction submitted.", hash: tx.hash });

      const receipt = await tx.wait();
      const createdEvent = await extractPresaleCreated(factory, receipt);
      let presaleDetails;

      if (createdEvent) {
        presaleDetails = {
          manager: createdEvent.args?.manager,
          owner: createdEvent.args?.owner,
          auction: createdEvent.args?.auction,
          lbp: createdEvent.args?.lbp,
          vesting: createdEvent.args?.vesting,
          timestamp: Date.now(),
        };
      } else {
        const onChainList = await factory.getPresales();
        if (!onChainList || onChainList.length === 0) {
          throw new Error("Transaction mined but factory returned no presales.");
        }
        presaleDetails = await fetchPresaleDetails(onChainList[onChainList.length - 1]);
      }

      setTxIndicator({ status: "success", message: "Presale created successfully!", hash: tx.hash });
      navigate(`/presale/${presaleDetails.manager}`);
    } catch (error) {
      console.error(error);
      setTxIndicator({ status: "error", message: error?.message || "Failed to create presale" });
    } finally {
      setSubmitting(false);
    }
  };

  const extractPresaleCreated = async (factory, receipt) => {
    try {
      const direct = receipt.events?.find((event) => event.event === "PresaleCreated");
      if (direct) return direct;

      const eventsFromFilter = await factory.queryFilter(
        factory.filters.PresaleCreated(),
        receipt.blockNumber,
        receipt.blockNumber
      );
      if (eventsFromFilter.length > 0) {
        return eventsFromFilter[0];
      }

      const parsed = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.name === "PresaleCreated");
      return parsed || null;
    } catch (error) {
      console.warn("Failed to parse PresaleCreated event", error);
      return null;
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.heroCard}>
        <div>
          <p className={styles.heroBadge}>Permissionless Presale</p>
          <h1 className={styles.heroTitle}>Create a dedicated PresaleManager clone</h1>
          <p className={styles.heroSubtitle}>
            Configure Dutch auction and LBP parameters, then deploy through the public factory. Each field is validated
            before any on-chain action.
          </p>
        </div>
        <div className={styles.heroActions}>
          {!connectedAccount ? (
            <button className={styles.heroButton} onClick={onConnect}>
              Connect wallet
            </button>
          ) : (
            <div className={styles.connectedPill}>Wallet connected</div>
          )}
          <div className={styles.heroStats}>
            <div>
              <p>Live auctions</p>
              <strong>Tracked in realtime</strong>
            </div>
            <div>
              <p>Liquidity window</p>
              <strong>90 days default</strong>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <article className={styles.infoCard}>
          <h2>Presale configuration in one place</h2>
          <p>
            Supply the sale token, treasury, auction timeline, and liquidity bootstrap settings. The UI serializes the
            data into the structs the factory expects.
          </p>
          <ul className={styles.infoList}>
            <li>Sale + treasury wiring auto-checked</li>
            <li>Dutch auction commit/reveal cycle</li>
            <li>Vesting + LBP launch built-in</li>
            <li>
              Results reflected on{" "}
              <span className={styles.highlight}>/deploy</span> and <span className={styles.highlight}>/all</span>
            </li>
          </ul>
          <p className={styles.note}>After submit, monitor TxStatus and jump directly to the manager view.</p>
        </article>

        <article className={styles.formCard}>
          <CreatePresaleForm values={formValues} onChange={handleChange} onSubmit={handleSubmit} submitting={submitting} />
          <div className={styles.statusWrapper}>
            <TxStatusIndicator
              status={txIndicator?.status}
              message={txIndicator?.message}
              hash={txIndicator?.hash}
              onClear={() => setTxIndicator(null)}
            />
          </div>
        </article>
      </div>
    </section>
  );
};

export default CreatePresale;
