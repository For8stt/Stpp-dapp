import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import CreatePresaleForm from "../components/presale/CreatePresaleForm";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import styles from "./css/CreatePresale.module.css";

const STORAGE_KEY = "sttp:recent-presales";
const now = () => Math.floor(Date.now() / 1000);
const toDateInput = (secondsFromNow) =>
  new Date((now() + secondsFromNow) * 1000).toISOString().slice(0, 16);

// Try to load TestToken address from deployment file
const getTestTokenAddress = () => {
  try {
    const deployments = require("../abi/data/stppDeployments.json");
    if (deployments?.entries?.[0]?.testToken) {
      return deployments.entries[0].testToken;
    }
  } catch (e) {
    console.warn("Could not load TestToken from deployment file:", e);
  }
  // Fallback to the correct address from deployment output
  return "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
};

const getInitialValues = () => ({
  saleToken: getTestTokenAddress(),
  treasury: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  tokensForSale: "100000",
  bonusReserve: "5000",
  perAddressCap: "1000",
  softCap: "50", //50000
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
  merkleRoot: "",
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
      merkleRoot: formValues.merkleRoot && formValues.merkleRoot.trim() !== "" 
        ? formValues.merkleRoot.trim() 
        : ethers.ZeroHash,
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
      const auctionAddress = createdEvent.args?.auction;
      

      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const saleTokenAddress = auctionInput.saleToken;

      const tokensForSaleBigInt = ethers.getBigInt(auctionInput.tokensForSale);
      const bonusReserveBigInt = ethers.getBigInt(auctionInput.bonusReserve);
      const fundingAmount = tokensForSaleBigInt + bonusReserveBigInt;
      
      console.log("=== Token Transfer Info ===");
      console.log("Sale Token Address:", saleTokenAddress);
      console.log("Auction Address:", auctionAddress);
      console.log("Tokens for Sale:", ethers.formatEther(tokensForSaleBigInt) + " tokens (" + tokensForSaleBigInt.toString() + " wei)");
      console.log("Bonus Reserve:", ethers.formatEther(bonusReserveBigInt) + " tokens (" + bonusReserveBigInt.toString() + " wei)");
      console.log("Total Funding Amount:", ethers.formatEther(fundingAmount) + " tokens (" + fundingAmount.toString() + " wei)");
      console.log("==========================");
      
      // Check if user has enough tokens
      const tokenAbi = [
        { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
        { "constant": false, "inputs": [{ "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "type": "function" }
      ];
      const tokenContract = new ethers.Contract(saleTokenAddress, tokenAbi, signer);
      
      const userAddress = await signer.getAddress();
      const userBalance = await tokenContract.balanceOf(userAddress);
      const userBalanceBigInt = ethers.getBigInt(userBalance);
      
      console.log("User Token Balance:", ethers.formatEther(userBalanceBigInt) + " tokens (" + userBalanceBigInt.toString() + " wei)");

      if (userBalanceBigInt < fundingAmount) {
        const missing = fundingAmount - userBalanceBigInt;
        const errorMsg = `Insufficient token balance to fund auction! ` +
          `Required: ${ethers.formatEther(fundingAmount)} tokens, ` +
          `Available: ${ethers.formatEther(userBalanceBigInt)} tokens, ` +
          `Missing: ${ethers.formatEther(missing)} tokens. ` +
          `Please ensure you have enough tokens before creating the auction.`;
        console.error("", errorMsg);
        throw new Error(errorMsg);
      }

      showTxInfo(`Transferring ${ethers.formatEther(fundingAmount)} tokens to auction... Please confirm in your wallet.`, { autoClose: false });
      const transferTx = await tokenContract.transfer(auctionAddress, fundingAmount);
      showTxInfo("Token transfer submitted to the network", { autoClose: 3000 });
      const transferReceipt = await transferTx.wait();
      
      console.log("Token Transfer Transaction:", {
        hash: transferTx.hash,
        blockNumber: transferReceipt.blockNumber,
        status: transferReceipt.status === 1 ? "success" : "failed"
      });

      const auctionBalance = await tokenContract.balanceOf(auctionAddress);
      const auctionBalanceBigInt = ethers.getBigInt(auctionBalance);
      console.log("Auction Token Balance (after transfer):", ethers.formatEther(auctionBalanceBigInt) + " tokens (" + auctionBalanceBigInt.toString() + " wei)");
      
      if (auctionBalanceBigInt < fundingAmount) {
        const missing = fundingAmount - auctionBalanceBigInt;
        const errorMsg = `Token transfer verification failed! ` +
          `Expected: ${ethers.formatEther(fundingAmount)} tokens in auction, ` +
          `Found: ${ethers.formatEther(auctionBalanceBigInt)} tokens, ` +
          `Missing: ${ethers.formatEther(missing)} tokens. ` +
          `Please check the transaction and try again.`;
        console.error("", errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log("Token transfer successful!");
      console.log("Amount transferred:", ethers.formatEther(fundingAmount) + " tokens (" + fundingAmount.toString() + " wei)");
      console.log("Auction now has:", ethers.formatEther(auctionBalanceBigInt) + " tokens");
      console.log("==========================");
      
      showTxSuccess(`Successfully transferred ${ethers.formatEther(fundingAmount)} tokens to auction!`, { autoClose: 3000 });

      persistPresale({
        manager: managerAddress,
        owner: createdEvent.args?.owner,
        auction: auctionAddress,
        lbp: createdEvent.args?.lbp,
        vesting: createdEvent.args?.vesting,
        timestamp: Date.now(),
      });

      showTxSuccess("Presale created and funded successfully!", { autoClose: 3000 });
      navigate(`/manager/${managerAddress}`);
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
    </section>
  );
};

export default CreatePresale;
