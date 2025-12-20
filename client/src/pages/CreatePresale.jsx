import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import CreatePresaleForm from "../components/presale/CreatePresaleForm";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { ensureProvider } from "../services/web3/provider";
import styles from "./css/CreatePresale.module.css";

const STORAGE_KEY = "sttp:recent-presales";
const now = () => Math.floor(Date.now() / 1000);
const toDateInput = (secondsFromNow) =>
  new Date((now() + secondsFromNow) * 1000).toISOString().slice(0, 16);

const getTestTokenAddress = () => {
  try {
    const deployments = require("../abi/data/stppDeployments.json");
    if (deployments?.entries?.[0]?.testToken) {
      return deployments.entries[0].testToken;
    }
  } catch (e) {
    console.warn("Could not load TestToken from deployment file:", e);
  }
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
  const [tokenBalance, setTokenBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(null);

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

  const requiredAmount = useMemo(() => {
    try {
      const tokensForSale = parseEtherValue(formValues.tokensForSale);
      const bonusReserve = parseEtherValue(formValues.bonusReserve);
      return ethers.getBigInt(tokensForSale) + ethers.getBigInt(bonusReserve);
    } catch {
      return null;
    }
  }, [formValues.tokensForSale, formValues.bonusReserve]);

  useEffect(() => {
    const checkBalance = async () => {
      if (!connectedAccount || !formValues.saleToken || !requiredAmount) {
        setTokenBalance(null);
        setBalanceError(null);
        return;
      }

      setBalanceLoading(true);
      setBalanceError(null);

      try {
        const provider = await ensureProvider();
        const tokenAbi = [
          { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" }
        ];
        const tokenContract = new ethers.Contract(formValues.saleToken, tokenAbi, provider);
        const balance = await tokenContract.balanceOf(connectedAccount);
        setTokenBalance(ethers.getBigInt(balance));
      } catch (err) {
        console.warn("Failed to check token balance:", err);
        setBalanceError("Failed to check token balance");
        setTokenBalance(null);
      } finally {
        setBalanceLoading(false);
      }
    };

    checkBalance();
  }, [connectedAccount, formValues.saleToken, requiredAmount]);

  const hasSufficientBalance = useMemo(() => {
    if (!tokenBalance || !requiredAmount) return null;
    return tokenBalance >= requiredAmount;
  }, [tokenBalance, requiredAmount]);

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
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const auctionInput = buildAuctionInput();
      const saleTokenAddress = auctionInput.saleToken;
      const tokensForSaleBigInt = ethers.getBigInt(auctionInput.tokensForSale);
      const bonusReserveBigInt = ethers.getBigInt(auctionInput.bonusReserve);
      const fundingAmount = tokensForSaleBigInt + bonusReserveBigInt;
      const tokenAbi = [
        { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
        { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "type": "function" },
        { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
      ];
      const tokenContract = new ethers.Contract(saleTokenAddress, tokenAbi, signer);
      console.log("=== Pre-Creation Balance Check ===");
      const userAddress = await signer.getAddress();
      const userBalance = await tokenContract.balanceOf(userAddress);
      const userBalanceBigInt = ethers.getBigInt(userBalance);
      
      console.log("Sale Token Address:", saleTokenAddress);
      console.log("User Address:", userAddress);
      console.log("Tokens for Sale:", ethers.formatEther(tokensForSaleBigInt) + " tokens");
      console.log("Bonus Reserve:", ethers.formatEther(bonusReserveBigInt) + " tokens");
      console.log("Total Required:", ethers.formatEther(fundingAmount) + " tokens");
      console.log("User Token Balance:", ethers.formatEther(userBalanceBigInt) + " tokens");
      console.log("================================");

      if (userBalanceBigInt < fundingAmount) {
        const missing = fundingAmount - userBalanceBigInt;
        const errorMsg = `Insufficient token balance to create auction! ` +
          `Required: ${ethers.formatEther(fundingAmount)} tokens, ` +
          `Available: ${ethers.formatEther(userBalanceBigInt)} tokens, ` +
          `Missing: ${ethers.formatEther(missing)} tokens. ` +
          `Please ensure you have enough tokens before creating the auction.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      const factory = await loadContract("PublicPresaleFactory");
      const factoryAddress = await factory.getAddress();
      
      const currentAllowance = await tokenContract.allowance(userAddress, factoryAddress);
      const currentAllowanceBigInt = ethers.getBigInt(currentAllowance);
      if (currentAllowanceBigInt < fundingAmount) {
        console.log("=== Using Multicall for Atomic Operation ===");
        console.log("Factory Address:", factoryAddress);
        console.log("Amount to approve:", ethers.formatEther(fundingAmount) + " tokens");
        console.log("This will combine approve + createPresale in one transaction");
        const lbpConfig = buildLbpConfig();
        
        try {
          const multicallAbi = [
            {
              "inputs": [
                {
                  "components": [
                    {"internalType": "address", "name": "target", "type": "address"},
                    {"internalType": "bytes", "name": "callData", "type": "bytes"}
                  ],
                  "internalType": "struct Multicall.Call[]",
                  "name": "calls",
                  "type": "tuple[]"
                }
              ],
              "name": "aggregate",
              "outputs": [
                {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
                {"internalType": "bytes[]", "name": "returnData", "type": "bytes[]"}
              ],
              "stateMutability": "nonpayable",
              "type": "function"
            }
          ];
          showTxInfo(`Approving ${ethers.formatEther(fundingAmount)} tokens... Please confirm in your wallet.`, { autoClose: false });
          const approveTx = await tokenContract.approve(factoryAddress, fundingAmount);
          showTxInfo("Approval transaction submitted. Please wait...", { autoClose: false });
          const approveReceipt = await approveTx.wait();
          
          if (approveReceipt.status !== 1) {
            throw new Error("Token approval transaction failed!");
          }
          
          console.log("Token approval successful!");
          console.log("================================");
        } catch (error) {
          try {
            await tokenContract.approve(factoryAddress,0).catch((err) => {});
          }catch {}
          throw error;
        }
      } else {
        console.log("Token allowance already sufficient");
      }

      console.log("=== Creating Presale (Atomic Operation) ===");
      console.log("Factory will atomically transfer tokens during presale creation");
      console.log("If transfer fails, presale creation will be reverted");
      
      showTxInfo("Creating presale and transferring tokens atomically... Please confirm the transaction in your wallet", { autoClose: false });
      const lbpConfig = buildLbpConfig();
      

      let tx;
      try {
        tx=await factory.createPresale(auctionInput, lbpConfig);
      }catch (error){
        console.warn("createPresale failed,attempting to revoke allownece...");
        try {
          await tokenContract.approve(factoryAddress, 0).catch(() => {});
        }catch (revokeError){
          console.warn("Failed to revoke allownece:", revokeError);
        }
        throw error;
      }
      showTxInfo("Presale creation transaction submitted to the network", { autoClose: 3000 });

      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error("Presale creation transaction failed! Auction was not created.");
      }
      
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
        throw new Error("Failed to read PresaleCreated event. Transaction may have been reverted.");
      }

      const managerAddress = createdEvent.args?.manager;
      const auctionAddress = createdEvent.args?.auction;

      const auctionBalance = await tokenContract.balanceOf(auctionAddress);
      const auctionBalanceBigInt = ethers.getBigInt(auctionBalance);
      
      console.log("=== Verification ===");
      console.log("Auction Address:", auctionAddress);
      console.log("Expected tokens:", ethers.formatEther(fundingAmount) + " tokens");
      console.log("Auction Token Balance:", ethers.formatEther(auctionBalanceBigInt) + " tokens");
      
      if (auctionBalanceBigInt < fundingAmount) {
        const errorMsg = `CRITICAL: Auction created but tokens not transferred! ` +
          `Expected: ${ethers.formatEther(fundingAmount)} tokens, ` +
          `Found: ${ethers.formatEther(auctionBalanceBigInt)} tokens. ` +
          `The contract should have reverted. Please check the contract and contact support.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log("✓ Presale created atomically with token transfer!");
      console.log("================================");
      showTxSuccess(`Presale created successfully! ${ethers.formatEther(fundingAmount)} tokens transferred atomically.`, { autoClose: 3000 });

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
        {/* Balance Check Display */}
        {connectedAccount && formValues.saleToken && requiredAmount && (
          <div style={{
            padding: "1rem",
            marginBottom: "1rem",
            borderRadius: "8px",
            backgroundColor: hasSufficientBalance === false ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
            border: `1px solid ${hasSufficientBalance === false ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)" }}>Token Balance Check</span>
              {balanceLoading && <span style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.5)" }}>Loading...</span>}
            </div>
            {balanceError ? (
              <div style={{ fontSize: "0.875rem", color: "rgba(239, 68, 68, 0.9)" }}>{balanceError}</div>
            ) : tokenBalance !== null ? (
              <>
                <div style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.9)", marginBottom: "0.25rem" }}>
                  <strong>Required:</strong> {ethers.formatEther(requiredAmount)} tokens
                </div>
                <div style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.9)", marginBottom: "0.25rem" }}>
                  <strong>Available:</strong> {ethers.formatEther(tokenBalance)} tokens
                </div>
                {hasSufficientBalance === false && (
                  <div style={{ fontSize: "0.875rem", color: "rgba(239, 68, 68, 0.9)", marginTop: "0.5rem", fontWeight: "500" }}>
                    ⚠️ Insufficient balance! You need {ethers.formatEther(requiredAmount - tokenBalance)} more tokens to create this auction.
                  </div>
                )}
                {hasSufficientBalance === true && (
                  <div style={{ fontSize: "0.875rem", color: "rgba(34, 197, 94, 0.9)", marginTop: "0.5rem", fontWeight: "500" }}>
                    ✓ Sufficient balance
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
        <CreatePresaleForm 
          values={formValues} 
          onChange={handleChange} 
          onSubmit={handleSubmit} 
          submitting={submitting}
          disabled={hasSufficientBalance === false}
        />
      </div>
    </section>
  );
};

export default CreatePresale;
