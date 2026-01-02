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

const getInitialValues = (account = null) => ({
  saleToken: getTestTokenAddress(),
  treasury: account || "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec",
  tokensForSale: "10000",
  bonusReserve: "1000",
  perAddressCap: "500",
  softCap: "100", //50000
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  demandCheckDelay: "600",
  earlyBonusWindow: "900",
  earlyBonusPct: "500",
  nonRevealPenaltyBps: "1000",
  lbpStableShareBps: "8000",
  thresholdLow: "100",
  maxDecayMultiplier: "1",
  minCommitDuration: "600",
  merkleRoot: "",
  whitelistCID: "",
  vestingStart: toDateInput(7200), // Will be calculated as startTime + 1 hour in buildAuctionInput
  vestingDuration: "10800", // 3 hours (3 * 60 * 60 = 10800 seconds)
  priceTicks: "0.3,0.25,0.20,0.15,0.10,0.05",
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
  const [formValues, setFormValues] = useState(() => getInitialValues(account));
  const [submitting, setSubmitting] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(null);

  const connectedAccount = account;

  // Update treasury address when account becomes available
  useEffect(() => {
    if (account && account !== formValues.treasury) {
      setFormValues((prev) => ({
        ...prev,
        treasury: account,
      }));
    }
  }, [account]);

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
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border/20 bg-gradient-to-b from-background via-background to-surface/5 py-16 sm:py-20">
        
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
          <div className="absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl"></div>
          <div className="absolute right-1/4 top-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/6 blur-3xl"></div>
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-[2px] backdrop-blur-xl shadow-2xl shadow-primary/30 transition-all duration-700 hover:border-primary/80 hover:shadow-[0_12px_48px_rgba(99,102,241,0.6),0_0_0_1px_rgba(99,102,241,0.5)]">
              
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/80 via-indigo-500/80 via-purple-500/80 to-secondary/80 opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
              
              
              <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-60"></div>
              
              
              <div className="relative z-0 flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface to-surface p-8 sm:p-10 lg:flex-row lg:items-center lg:gap-12">
                
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/12 to-secondary/20 opacity-70 transition-opacity duration-700 group-hover:opacity-100"></div>
                
                
                <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
                <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
                
                
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl opacity-60 transition-opacity duration-700 group-hover:opacity-90"></div>
                <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-secondary/15 blur-3xl opacity-50 transition-opacity duration-700 group-hover:opacity-80"></div>
                
                <div className="relative z-10 flex-1">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-primary backdrop-blur-sm">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Create Presale</span>
                  </div>
                  <h1 className="mb-4 bg-gradient-to-br from-text via-text to-text/80 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl lg:text-6xl">
                    Create a Permissionless Presale
                  </h1>
                  <p className="mb-8 max-w-2xl text-lg text-text-muted sm:text-xl">
                    Configure your auction parameters and deploy a dedicated PresaleManager clone via the public factory.
                    Launch your token sale with advanced Dutch auction mechanics and automated liquidity bootstrapping.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                    <div className="relative rounded-xl border border-primary/20 bg-primary/5 p-4 backdrop-blur-sm">
                      <div className="absolute -left-1 top-0 h-full w-1 rounded-full bg-gradient-to-b from-primary to-primary/50"></div>
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-text-muted">Smart contracts</p>
                      </div>
                      <p className="text-lg font-bold text-text">Automated deployment</p>
                    </div>
                    <div className="relative rounded-xl border border-secondary/20 bg-secondary/5 p-4 backdrop-blur-sm">
                      <div className="absolute -left-1 top-0 h-full w-1 rounded-full bg-gradient-to-b from-secondary to-secondary/50"></div>
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-text-muted">Liquidity bootstrap</p>
                      </div>
                      <p className="text-lg font-bold text-text">Built-in LBP</p>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 mt-8 flex flex-col items-start gap-6 lg:mt-0 lg:items-end">
                  {!connectedAccount ? (
                    <button 
                      onClick={onConnect} 
                      className="group/btn relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-indigo-500 to-primary px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-primary/30 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-primary/40"
                    >
                      <svg className="h-5 w-5 transition-transform duration-300 group-hover/btn:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Connect Wallet
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border-2 border-secondary/50 bg-gradient-to-br from-secondary/20 to-secondary/10 px-5 py-2.5 text-sm font-bold text-secondary shadow-xl shadow-secondary/20 backdrop-blur-sm">
                      <span className="relative flex h-2 w-2 items-center justify-center">
                        <span className="absolute h-2 w-2 animate-ping rounded-full bg-current opacity-75"></span>
                        <span className="relative h-1.5 w-1.5 rounded-full bg-current"></span>
                      </span>
                      Wallet Connected
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      
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
                <div className="absolute bottom-0 left-0 h-16 w-16 border-b-2 border-l-2 border-primary/40 rounded-bl-3xl"></div>
                <div className="absolute bottom-0 right-0 h-16 w-16 border-b-2 border-r-2 border-secondary/40 rounded-br-3xl"></div>
                
                
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl opacity-60 transition-opacity duration-700 group-hover:opacity-90"></div>
                <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-secondary/15 blur-3xl opacity-50 transition-opacity duration-700 group-hover:opacity-80"></div>
                
                <div className="relative z-10">
                  
                  {connectedAccount && formValues.saleToken && requiredAmount && (() => {
                    const balanceCardClass = hasSufficientBalance === false 
                      ? "group/balance mb-10 relative overflow-hidden rounded-2xl border-2 border-red-500/80 bg-gradient-to-br from-red-500/30 to-red-500/15 p-8 backdrop-blur-sm shadow-2xl transition-all duration-500"
                      : "group/balance mb-10 relative overflow-hidden rounded-2xl border-2 border-secondary/80 bg-gradient-to-br from-secondary/30 to-secondary/15 p-8 backdrop-blur-sm shadow-2xl transition-all duration-500";
                    const accentLineClass = hasSufficientBalance === false
                      ? "absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 via-red-400 to-red-500 opacity-80 transition-opacity duration-500 group-hover/balance:opacity-100"
                      : "absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-secondary via-teal-500 to-secondary opacity-80 transition-opacity duration-500 group-hover/balance:opacity-100";
                    const iconClass = hasSufficientBalance === false
                      ? "relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl bg-gradient-to-br from-red-500/40 to-red-500/25 text-red-200"
                      : "relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl bg-gradient-to-br from-secondary/40 to-secondary/25 text-secondary";
                    
                    return (
                    <div className={balanceCardClass}>
                      
                      <div className={accentLineClass}></div>
                      
                      
                      {hasSufficientBalance === false ? (
                        <>
                          <div className="absolute top-0 left-0 h-12 w-12 border-t-2 border-l-2 border-red-500/60 rounded-tl-2xl"></div>
                          <div className="absolute top-0 right-0 h-12 w-12 border-t-2 border-r-2 border-red-500/60 rounded-tr-2xl"></div>
                        </>
                      ) : (
                        <>
                          <div className="absolute top-0 left-0 h-12 w-12 border-t-2 border-l-2 border-secondary/60 rounded-tl-2xl"></div>
                          <div className="absolute top-0 right-0 h-12 w-12 border-t-2 border-r-2 border-secondary/60 rounded-tr-2xl"></div>
                        </>
                      )}
                      
                      
                      {hasSufficientBalance === false ? (
                        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-red-500/20 blur-2xl opacity-60 transition-opacity duration-500 group-hover/balance:opacity-80"></div>
                      ) : (
                        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-secondary/20 blur-2xl opacity-60 transition-opacity duration-500 group-hover/balance:opacity-80"></div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-br from-current/20 via-transparent to-transparent opacity-80"></div>
                      <div className="relative">
                        <div className="mb-6 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={iconClass}>
                              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/30 to-transparent"></div>
                              {balanceLoading ? (
                                <svg className="relative z-10 h-7 w-7 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ) : hasSufficientBalance === false ? (
                                <svg className="relative z-10 h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                              ) : (
                                <svg className="relative z-10 h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>
                            <span className="text-2xl font-bold text-text">Token Balance Check</span>
                          </div>
                        </div>
                        {balanceError ? (
                          <div className="rounded-xl border-2 border-red-500/60 bg-red-500/20 p-4">
                            <div className="text-base font-bold text-red-300">{balanceError}</div>
                          </div>
                        ) : tokenBalance !== null ? (
                          <div className="space-y-4">
                            <div className="group/info flex items-center justify-between rounded-xl border-2 border-border/60 bg-gradient-to-br from-surface/90 to-surface/80 p-5 shadow-lg transition-all duration-300 hover:border-primary/60 hover:shadow-xl">
                              <span className="text-base font-bold text-text-muted">Required:</span>
                              <span className="font-mono text-lg font-bold text-text">{ethers.formatEther(requiredAmount)} tokens</span>
                            </div>
                            <div className="group/info flex items-center justify-between rounded-xl border-2 border-border/60 bg-gradient-to-br from-surface/90 to-surface/80 p-5 shadow-lg transition-all duration-300 hover:border-primary/60 hover:shadow-xl">
                              <span className="text-base font-bold text-text-muted">Available:</span>
                              <span className="font-mono text-lg font-bold text-text">{ethers.formatEther(tokenBalance)} tokens</span>
                            </div>
                            {hasSufficientBalance === false && (
                              <div className="mt-4 rounded-xl border-2 border-red-500/70 bg-red-500/20 p-5 shadow-lg">
                                <div className="flex items-center gap-3 text-base font-bold text-red-300">
                                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  Insufficient balance! You need {ethers.formatEther(requiredAmount - tokenBalance)} more tokens to create this auction.
                                </div>
                              </div>
                            )}
                            {hasSufficientBalance === true && (
                              <div className="mt-4 rounded-xl border-2 border-secondary/70 bg-secondary/20 p-5 shadow-lg">
                                <div className="flex items-center gap-3 text-base font-bold text-secondary">
                                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Sufficient balance
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    );
                  })()}
                  
                  <CreatePresaleForm 
                    values={formValues} 
                    onChange={handleChange} 
                    onSubmit={handleSubmit} 
                    submitting={submitting}
                    disabled={hasSufficientBalance === false}
                    userAccount={connectedAccount}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CreatePresale;
