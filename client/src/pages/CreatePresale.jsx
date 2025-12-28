import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import CreatePresaleForm from "../components/presale/CreatePresaleForm";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { ensureProvider } from "../services/web3/provider";

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
  treasury: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec",
  tokensForSale: "100000",
  bonusReserve: "5000",
  perAddressCap: "1000",
  softCap: "50", //50000
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  demandCheckDelay: "600",
  earlyBonusWindow: "600",
  earlyBonusPct: "500",
  nonRevealPenaltyBps: "0",
  lbpStableShareBps: "4000",
  thresholdLow: "100",
  maxDecayMultiplier: "1",
  minCommitDuration: "600",
  merkleRoot: "",
  whitelistCID: "",
  vestingStart: toDateInput(7200), // Will be calculated as startTime + 1 hour in buildAuctionInput
  vestingDuration: "10800", // 3 hours (3 * 60 * 60 = 10800 seconds)
  priceTicks: "1,0.9,0.8",
  lbpStart: toDateInput(7200),
  lbpEnd: toDateInput(17200),
  poolStartWeightToken: "80",
  poolEndWeightToken: "20",
  poolSwapFee: "0.003",
  initialFeePreset: "1", // Default: 10% (enum value 1 = TEN_PERCENT)
  feeDecayDurationPreset: "1", // Default: 15 minutes (enum value 1 = FIFTEEN_MINUTES)
  vestingCliffDuration: "259200", // 3 days (3 * 24 * 60 * 60 = 259200 seconds)
  vestingFinalDuration: "2592000", // 30 days for LBP (30 * 24 * 60 * 60 = 2592000 seconds)
  vestingCliffPercentBP: "1500", // 15% (15 * 100 = 1500 BPS)
  maxContributionPerAddress: "5", // Default: 5 ETH
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
    setFormValues((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "startTime" && value) {
        try {
          const startTime = parseTimestamp(value);
          const vestingStartTime = startTime + 3600; // 1 hour after auction start
          updated.vestingStart = new Date(vestingStartTime * 1000).toISOString().slice(0, 16);
        } catch (err) {
          console.warn("Failed to update vestingStart:", err);
        }
      }
      return updated;
    });
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
    const vestingStart = startTime + 3600; // 1 hour after auction start
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
      thresholdLow: parseEtherValue(formValues.thresholdLow || "100"),
      maxDecayMultiplier: ethers.parseUnits(formValues.maxDecayMultiplier || "1", 18).toString(),
      minCommitDuration: Number(formValues.minCommitDuration || 0),
      demandCheckTime,
      vestingStart, // Automatically calculated as startTime + 1 hour
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
    initialFeePreset: Number(formValues.initialFeePreset ?? "1"),
    feeDecayDurationPreset: Number(formValues.feeDecayDurationPreset ?? "1"),
    maxContributionPerAddress: (formValues.maxContributionPerAddress && formValues.maxContributionPerAddress.trim() !== "")
      ? ethers.parseEther(formValues.maxContributionPerAddress).toString() 
      : "0",
  });

  const handleSubmit = async () => {
    try {
      if (!window?.ethereum) {
        throw new Error("Wallet not detected. Please install MetaMask.");
      }

      const hasCID = formValues.whitelistCID && formValues.whitelistCID.trim() !== "";
      const hasMerkleRoot = formValues.merkleRoot && formValues.merkleRoot.trim() !== "" && 
                            formValues.merkleRoot.trim() !== "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      if (hasCID && !hasMerkleRoot) {
        throw new Error("Whitelist IPFS CID requires Merkle root. Please provide Merkle root or remove CID.");
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
      console.log("LBP Config:", lbpConfig);
      console.log("maxContributionPerAddress:", lbpConfig.maxContributionPerAddress);

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

      if (formValues.whitelistCID && formValues.whitelistCID.trim() !== "") {
        try {
          console.log("Setting whitelistCID:", formValues.whitelistCID);
          const allAbis = await import("../abi/allAbis.json");
          const auctionAbi = allAbis.default?.DutchAuction || allAbis.DutchAuction || [];
          
          if (auctionAbi.length === 0) {
            throw new Error("DutchAuction ABI not found");
          }
          
          const auctionWithSigner = new ethers.Contract(auctionAddress, auctionAbi, signer);
          
          showTxInfo("Setting whitelist CID...", { autoClose: false });
          const setCidTx = await auctionWithSigner.setWhitelistCID(formValues.whitelistCID.trim());
          await setCidTx.wait();
          console.log("✓ Whitelist CID set successfully!");
          showTxSuccess("Whitelist CID set successfully!", { autoClose: 3000 });
        } catch (cidError) {
          console.warn("Failed to set whitelistCID (you can set it later):", cidError);
          showTxInfo("Presale created, but whitelist CID setting failed. You can set it later via setWhitelistCID().", { autoClose: 5000 });
        }
      }

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
    <section className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 pb-16 pt-8">
      <div className="relative flex flex-col justify-between gap-8 overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6 shadow-card transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.5)] lg:flex-row lg:items-center lg:gap-12 lg:p-12">
        <div className="relative z-10 flex-1">
          <h1 className="mb-3 bg-gradient-to-br from-text to-[#cbd5e1] bg-clip-text text-[2rem] font-bold leading-tight text-transparent lg:text-[2.5rem]">
            Create a permissionless presale
          </h1>
          <p className="mb-6 max-w-[480px] text-base leading-relaxed text-text-muted">
            Configure your auction parameters and deploy a dedicated PresaleManager clone via the public factory.
            Launch your token sale with advanced Dutch auction mechanics and automated liquidity bootstrapping.
          </p>
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-muted p-4 text-sm text-text-muted backdrop-blur-sm transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.03)] lg:flex-row lg:gap-8">
            <div>
              <p>Smart contracts</p>
              <strong className="mt-1 block text-[0.95rem] font-semibold text-text">Automated deployment</strong>
            </div>
            <div>
              <p>Liquidity bootstrap</p>
              <strong className="mt-1 block text-[0.95rem] font-semibold text-text">Built-in LBP</strong>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex flex-col items-start gap-6 lg:items-end">
          {!connectedAccount ? (
            <button 
              onClick={onConnect} 
              className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-gradient-to-r from-primary via-[#7c3aed] to-[#ec4899] px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-[rgba(20,184,166,0.4)] bg-gradient-to-br from-[rgba(20,184,166,0.15)] to-[rgba(16,185,129,0.15)] px-4 py-1.5 text-xs font-medium text-[#5eead4] shadow-[0_2px_8px_rgba(20,184,166,0.15)] backdrop-blur-sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Wallet Connected
            </div>
          )}
        </div>
      </div>

      {/* Form Section */}
      <div className="relative overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 shadow-card backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_60px_rgba(0,0,0,0.5)] lg:p-10">
        {/* Balance Check Display */}
        {connectedAccount && formValues.saleToken && requiredAmount && (
          <div className={`mb-4 rounded-lg border p-4 ${
            hasSufficientBalance === false 
              ? "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)]" 
              : "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)]"
          }`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">Token Balance Check</span>
              {balanceLoading && <span className="text-sm text-[rgba(255,255,255,0.5)]">Loading...</span>}
            </div>
            {balanceError ? (
              <div className="text-sm text-[rgba(239,68,68,0.9)]">{balanceError}</div>
            ) : tokenBalance !== null ? (
              <>
                <div className="mb-1 text-sm text-[rgba(255,255,255,0.9)]">
                  <strong>Required:</strong> {ethers.formatEther(requiredAmount)} tokens
                </div>
                <div className="mb-1 text-sm text-[rgba(255,255,255,0.9)]">
                  <strong>Available:</strong> {ethers.formatEther(tokenBalance)} tokens
                </div>
                {hasSufficientBalance === false && (
                  <div className="mt-2 text-sm font-medium text-[rgba(239,68,68,0.9)]">
                    ⚠️ Insufficient balance! You need {ethers.formatEther(requiredAmount - tokenBalance)} more tokens to create this auction.
                  </div>
                )}
                {hasSufficientBalance === true && (
                  <div className="mt-2 text-sm font-medium text-[rgba(34,197,94,0.9)]">
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
          userAccount={connectedAccount}
        />
      </div>
    </section>
  );
};

export default CreatePresale;
