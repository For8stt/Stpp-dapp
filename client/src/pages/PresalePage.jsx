import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ethers } from "ethers";

import AuctionControls from "../components/presale/AuctionControls";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import "./css/presalePage.css";

const toDateInput = (secondsFromNow = 0) =>
  new Date((Math.floor(Date.now() / 1000) + secondsFromNow) * 1000).toISOString().slice(0, 16);

const defaultAuctionForm = {
  saleToken: "",
  treasury: "",
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  tokensForSale: "",
  bonusReserve: "",
  perAddressCap: "",
  softCap: "",
  merkleRoot: ethers.ZeroHash,
  priceTicks: "1,0.9,0.8",
};

const defaultLbpConfig = {
  startTime: toDateInput(10800), // +3 година від зараз
  endTime: toDateInput(21600), // +6 години від зараз (кінець через 1 годину після початку)
  poolStartWeightToken: "80",
  poolEndWeightToken: "20",
  poolSwapFee: "0.003",
  vestingCliffDuration: "0",
  vestingFinalDuration: "2592000",
  vestingCliffPercentBP: "0",
};

const parseTimestamp = (value) => {
  if (!value) return Math.floor(Date.now() / 1000) + 600;
  const result = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(result) ? result : Math.floor(Date.now() / 1000) + 600;
};
const parseEtherValue = (value) => (value ? ethers.parseUnits(value, 18).toString() : "0");
const parseBps = (value) => Number(value || 0);
const parseWeight = (value) => ethers.parseUnits(((Number(value || 0) / 100) || 0).toString(), 18).toString();

const shortenHash = (hash) => {
  if (!hash) return "";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

const PresalePage = ({ account }) => {
  const { address } = useParams();
  const [managerContract, setManagerContract] = useState(null);
  const [info, setInfo] = useState(null);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [auctionForm, setAuctionForm] = useState(defaultAuctionForm);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [lbpConfig, setLbpConfig] = useState(defaultLbpConfig);

  const refreshInfo = useCallback(async () => {
    if (!address) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const normalizedAddress = address.toLowerCase();
      let factoryContract = null;
      try {
        factoryContract = await loadContract("PublicPresaleFactory");
      } catch {
        // ignore missing factory configuration
      }
      if (factoryContract) {
        const factoryAddress = (factoryContract.target || factoryContract.address || "").toString().toLowerCase();
        if (factoryAddress === normalizedAddress) {
          setError(
            "This address is the public factory. Open one of the PresaleManager clones emitted by the factory (see All presales)."
          );
          setManagerContract(null);
          setAuctions([]);
          setInfo(null);
          return;
        }
      }
      const contract = await loadContract("PresaleManager", address);
      setManagerContract(contract);
      const ownerAddress = await contract.owner();
      const auctionsList = await contract.getAllAuctions();
      setAuctions(auctionsList);

      let latestInfo = null;
      if (auctionsList.length > 0) {
        const targetAuction = auctionsList[auctionsList.length - 1];
        let details = null;

        if (typeof contract.getPresaleInfo === "function") {
          details = await contract.getPresaleInfo(targetAuction);
        } else if (typeof contract.getLatestPresaleInfo === "function") {
          details = await contract.getLatestPresaleInfo();
        } else if (typeof contract.getAuctionRecord === "function") {
          const record = await contract.getAuctionRecord(targetAuction);
          details = [
            ownerAddress,
            targetAuction,
            record.lbp,
            record.vestingEscrow,
            record.finalized,
            record.lbpInitialized,
            record.lbpFinalized,
            record.tokensForSale,
            record.bonusReserve,
            record.totalRaised,
            record.clearingPrice,
          ];
        }

        if (details) {
          latestInfo = {
            owner: details[0],
            auction: details[1],
            lbp: details[2],
            vesting: details[3],
            finalized: details[4],
            lbpInitialized: details[5],
            lbpFinalized: details[6],
            tokensForSale: details[7],
            bonusReserve: details[8],
            totalRaised: details[9],
            clearingPrice: details[10],
          };
        }
      }

      setInfo(latestInfo);
      setIsOwner(ownerAddress?.toLowerCase() === account?.toLowerCase());
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load presale");
    } finally {
      setLoading(false);
    }
  }, [address, account]);

  useEffect(() => {
    refreshInfo();
  }, [refreshInfo]);

  const handleAuctionFormChange = (name, value) => {
    setAuctionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLbpConfigChange = (name, value) => {
    setLbpConfig((prev) => ({ ...prev, [name]: value }));
  };

  const launchLbpConfig = useMemo(
    () => ({
      startTime: parseTimestamp(lbpConfig.startTime),
      endTime: parseTimestamp(lbpConfig.endTime),
      poolStartWeightToken: parseWeight(lbpConfig.poolStartWeightToken),
      poolEndWeightToken: parseWeight(lbpConfig.poolEndWeightToken),
      poolSwapFee: ethers.parseUnits(lbpConfig.poolSwapFee || "0.003", 18).toString(),
      vestingStartTime: info?.vesting ? parseTimestamp(lbpConfig.startTime) : parseTimestamp(lbpConfig.startTime),
      vestingCliffDuration: Number(lbpConfig.vestingCliffDuration || 0),
      vestingFinalDuration: Number(lbpConfig.vestingFinalDuration || 0),
      vestingCliffPercentBP: parseBps(lbpConfig.vestingCliffPercentBP),
    }),
    [lbpConfig, info]
  );

  const submitAuction = async () => {
    if (!managerContract) return;
    try {
      setCreatingAuction(true);
      const startTime = parseTimestamp(auctionForm.startTime);
      const payload = {
        saleToken: auctionForm.saleToken,
        treasury: auctionForm.treasury,
        startTime,
        commitDuration: Number(auctionForm.commitDuration || 0),
        revealDuration: Number(auctionForm.revealDuration || 0),
        perAddressCap: parseEtherValue(auctionForm.perAddressCap),
        softCap: parseEtherValue(auctionForm.softCap),
        tokensForSale: parseEtherValue(auctionForm.tokensForSale),
        bonusReserve: parseEtherValue(auctionForm.bonusReserve),
        earlyBonusWindow: 0,
        earlyBonusPct: 0,
        nonRevealPenaltyBps: 0,
        lbpStableShareBps: 4000,
        thresholdLow: 0,
        maxDecayMultiplier: ethers.parseUnits("1", 18).toString(),
        minCommitDuration: 600,
        demandCheckTime: startTime + 900,
        vestingStart: startTime + 86400,
        vestingDuration: 2_592_000,
        merkleRoot: auctionForm.merkleRoot || ethers.ZeroHash,
        priceTicks: auctionForm.priceTicks
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((tick) => ethers.parseEther(tick).toString()),
      };

      setTxStatus({ status: "pending", message: "Creating auction..." });
      showTxInfo("Please confirm the transaction in your wallet", { autoClose: false });
      const tx = await managerContract.createAuction(payload);
      showTxInfo("Transaction submitted to the network", { autoClose: 3000 });
      setTxStatus({ status: "pending", message: "Transaction submitted", hash: tx.hash });
      await tx.wait();
      showTxSuccess("Auction created successfully!", { autoClose: 3000 });
      setTxStatus({ status: "success", message: "Auction created", hash: tx.hash });
      await refreshInfo();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Unable to create auction");
      setTxStatus({ status: "error", message: err?.message || "Unable to create auction" });
    } finally {
      setCreatingAuction(false);
    }
  };

  const runAction = async (label, action, preCheckAction = null) => {
    if (!managerContract || !info?.auction) return;
    try {
      // Try to simulate the call first to get better error messages
      if (preCheckAction) {
        try {
          await preCheckAction();
        } catch (preCheckErr) {
          // If preCheck fails with "missing revert data", we'll still try the transaction
          // because sometimes it's a false negative from the RPC
          if (preCheckErr?.message?.includes("missing revert data")) {
            console.warn("⚠️ Pre-check failed with 'missing revert data', but will attempt transaction anyway");
          } else {
            // If staticCall fails with a specific error, show it before attempting the real transaction
            console.warn("Pre-check failed:", preCheckErr);
            throw preCheckErr;
          }
        }
      }

      setTxStatus({ status: "pending", message: `${label}…` });
      showTxInfo(`Please confirm ${label.toLowerCase()} in your wallet`, { autoClose: false });
      const tx = await action();
      showTxInfo(`${label} submitted to the network`, { autoClose: 3000 });
      setTxStatus({ status: "pending", message: `${label} submitted`, hash: tx.hash });
      await tx.wait();
      showTxSuccess(`${label} completed successfully!`, { autoClose: 3000 });
      setTxStatus({ status: "success", message: `${label} confirmed`, hash: tx.hash });
      await refreshInfo();
    } catch (err) {
      console.error("Transaction error:", err);
      
      // Try to extract more detailed error message
      let errorMessage = err?.message || `Failed to ${label.toLowerCase()}`;
      
      // Check for common revert reasons
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      
      // Check for transaction receipt to get revert reason
      if (err?.receipt) {
        console.log("Transaction receipt:", err.receipt);
      }
      
      // Check for transaction hash to get more info
      if (err?.transaction?.hash) {
        console.log("Transaction hash:", err.transaction.hash);
      }
      
      // Provide more helpful error messages
      if (errorMessage.includes("RevealPhaseClosed") || errorMessage.includes("reveal")) {
        errorMessage = "Reveal phase has not ended yet. Wait for the reveal phase to complete before finalizing.";
      } else if (errorMessage.includes("AuctionNotFinalized") || errorMessage.includes("not finalized")) {
        errorMessage = "Auction must be finalized before launching LBP.";
      } else if (errorMessage.includes("LbpAlreadyLaunched") || errorMessage.includes("already launched")) {
        errorMessage = "LBP has already been launched for this auction.";
      } else if (errorMessage.includes("InvalidLbpTimes") || errorMessage.includes("startTime") || errorMessage.includes("endTime")) {
        errorMessage = "Invalid LBP time configuration. Start time must be before end time.";
      } else if (errorMessage.includes("InvalidVestingDurations") || errorMessage.includes("vesting")) {
        errorMessage = "Invalid vesting configuration. Check vestingCliffDuration and vestingFinalDuration.";
      } else if (errorMessage.includes("CliffPercentTooHigh")) {
        errorMessage = "vestingCliffPercentBP must be <= 10000 (100%).";
      } else if (errorMessage.includes("missing revert data")) {
        errorMessage = `Transaction failed. This might be due to: 1) _deploySecureLBP() failing, 2) auction.launchLbp() failing, 3) Invalid LBP config parameters, or 4) RPC issue. Check Hardhat console for more details.`;
      }
      
      handleTxError(err, errorMessage);
      setTxStatus({ status: "error", message: errorMessage });
    }
  };

  const handleFinalizeAuction = async () => {
    if (!managerContract || !info?.auction) return;
    
    // Check if auction is already finalized
    if (info.finalized) {
      handleTxError(new Error("Auction is already finalized"));
      return;
    }

    // Try to get auction contract to check revealEndTime
    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const allAbis = await import("../abi/allAbis.json");
      const auctionAbi = allAbis.DutchAuction || [];
      const auctionContract = new ethers.Contract(info.auction, auctionAbi, provider);
      
      const revealEndTime = await auctionContract.revealEndTime();
      const currentBlock = await provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
      
      if (Number(revealEndTime) > currentTime) {
        const timeRemaining = Number(revealEndTime) - currentTime;
        const hours = Math.floor(timeRemaining / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);
        handleTxError(new Error(`Reveal phase has not ended yet. Time remaining: ${hours}h ${minutes}m`));
        return;
      }
    } catch (err) {
      console.warn("Could not check reveal end time:", err);
      // Continue anyway - let the contract handle the error
    }

    // Try staticCall first to get better error message
    const preCheck = async () => {
      try {
        await managerContract.finalizeAuction.staticCall(info.auction);
      } catch (staticErr) {
        throw staticErr;
      }
    };

    runAction("Finalize auction", () => managerContract.finalizeAuction(info.auction), preCheck);
  };

  const handleLaunchLbp = async () => {
    if (!managerContract || !info?.auction) return;
    
    // Check if auction is finalized
    if (!info.finalized) {
      handleTxError(new Error("Auction must be finalized before launching LBP"));
      return;
    }

    // Check if LBP is already launched
    if (info.lbpInitialized) {
      handleTxError(new Error("LBP has already been launched"));
      return;
    }

    // Validate LBP config
    if (launchLbpConfig.startTime >= launchLbpConfig.endTime) {
      handleTxError(new Error("LBP start time must be before end time"));
      return;
    }

    // Detailed diagnostics: Check auction state directly
    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const allAbis = await import("../abi/allAbis.json");
      const auctionAbi = allAbis.DutchAuction || [];
      const auctionContract = new ethers.Contract(info.auction, auctionAbi, provider);
      
      // Check auction state
      const [finalized, successful, tokensForSale, tokensSold, lbpLaunched, lbpTokenRecipient, lbpStableRecipient, ethForTreasury, totalRaised] = await Promise.all([
        auctionContract.finalized(),
        auctionContract.successful(),
        auctionContract.tokensForSale(),
        auctionContract.tokensSold(),
        auctionContract.lbpLaunched ? auctionContract.lbpLaunched() : Promise.resolve(false),
        auctionContract.lbpTokenRecipient ? auctionContract.lbpTokenRecipient() : Promise.resolve(ethers.ZeroAddress),
        auctionContract.lbpStableRecipient ? auctionContract.lbpStableRecipient() : Promise.resolve(ethers.ZeroAddress),
        auctionContract.ethForTreasury(),
        auctionContract.totalRaised(),
      ]);

      const unsoldTokens = tokensForSale - tokensSold;
      // lbpStableShareBps is a public variable (typically 4000 = 40%)
      const lbpStableShareBps = await auctionContract.lbpStableShareBps();
      const BPS_DENOMINATOR = 10000n;
      let stableForLBP = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR;
      
      // Cap stableForLBP at ethForTreasury (as done in contract)
      if (stableForLBP > ethForTreasury) {
        stableForLBP = ethForTreasury;
      }
      
      const actualStableForLBP = stableForLBP; // This is what will be sent

      console.log("=== LBP Launch Diagnostics ===");
      console.log("Auction state:", {
        finalized,
        successful,
        tokensForSale: tokensForSale.toString(),
        tokensSold: tokensSold.toString(),
        unsoldTokens: unsoldTokens.toString(),
        lbpLaunched,
        lbpTokenRecipient: lbpTokenRecipient || "NOT SET",
        lbpStableRecipient: lbpStableRecipient || "NOT SET",
        ethForTreasury: ethers.formatEther(ethForTreasury) + " ETH",
        totalRaised: ethers.formatEther(totalRaised) + " ETH",
        stableForLBP: ethers.formatEther(stableForLBP) + " ETH",
        actualStableForLBP: ethers.formatEther(actualStableForLBP) + " ETH",
        lbpStableShareBps: lbpStableShareBps.toString() + " (=" + (Number(lbpStableShareBps) / 100) + "%)",
      });
      console.log("PresaleManager address:", address);
      console.log("lbpTokenRecipient matches PresaleManager:", lbpTokenRecipient?.toLowerCase() === address.toLowerCase());
      console.log("lbpStableRecipient matches PresaleManager:", lbpStableRecipient?.toLowerCase() === address.toLowerCase());
      console.log("actualStableForLBP > 0:", actualStableForLBP > 0n);
      console.log("CRITICAL: PresaleManager.launchLBP() requires ethReceived > 0 (line 255), but auction.launchLbp() only sends ETH if stableForLBP > 0");
      if (actualStableForLBP === 0n) {
        console.error("❌ PROBLEM: actualStableForLBP is 0! This will cause 'NoEthReceived' error in PresaleManager.launchLBP()");
      }
      console.log("=============================");
      
      // Try to call auction.launchLbp() directly to see if it works
      try {
        console.log("Testing auction.launchLbp() directly...");
        // This will fail because we're not the manager, but it will show us the error
        const signer = await provider.getSigner();
        const auctionContractWithSigner = auctionContract.connect(signer);
        try {
          await auctionContractWithSigner.launchLbp.staticCall();
          console.log("✅ auction.launchLbp() would succeed (but we're not the manager)");
        } catch (auctionErr) {
          console.error("❌ auction.launchLbp() would fail:", auctionErr?.reason || auctionErr?.message || auctionErr);
        }
      } catch (testErr) {
        console.warn("Could not test auction.launchLbp() directly:", testErr);
      }

      // Check conditions (order matters - check most critical first)
      if (!finalized) {
        handleTxError(new Error("Auction is not finalized. Please finalize the auction first."));
        return;
      }

      // CRITICAL: Auction must be successful to launch LBP
      if (!successful) {
        handleTxError(new Error("Auction was not successful (did not reach soft cap or no tokens sold). LBP can only be launched for successful auctions."));
        return;
      }

      if (lbpLaunched) {
        handleTxError(new Error("LBP has already been launched for this auction."));
        return;
      }

      if (unsoldTokens === 0n) {
        handleTxError(new Error("No unsold tokens available for LBP. All tokens were sold."));
        return;
      }

      // CRITICAL: lbpTokenRecipient and lbpStableRecipient must be set to PresaleManager address
      // because PresaleManager.launchLBP() expects to receive tokens/ETH from auction.launchLbp()
      if (lbpTokenRecipient === ethers.ZeroAddress) {
        handleTxError(new Error("LBP token recipient is not set in auction. This must be set to PresaleManager address during auction initialization."));
        return;
      }

      // Verify that lbpTokenRecipient is the PresaleManager
      if (lbpTokenRecipient.toLowerCase() !== address.toLowerCase()) {
        handleTxError(new Error(`LBP token recipient (${lbpTokenRecipient}) is not set to PresaleManager (${address}). Tokens must be sent to PresaleManager.`));
        return;
      }

      // CRITICAL: PresaleManager.launchLBP() requires BOTH tokens AND ETH to be received
      // If actualStableForLBP is 0, auction.launchLbp() won't send ETH, causing NoEthReceived() error
      if (actualStableForLBP === 0n) {
        const errorMsg = `Cannot launch LBP: stableForLBP is 0, but PresaleManager.launchLBP() requires ETH to be received. ` +
          `This will cause 'NoEthReceived' error. ` +
          `Please ensure lbpStableShareBps > 0 (current: ${lbpStableShareBps.toString()}) and totalRaised > 0 (current: ${ethers.formatEther(totalRaised)} ETH).`;
        console.error("❌", errorMsg);
        handleTxError(new Error(errorMsg));
        return;
      }
      
      // Verify lbpStableRecipient is set correctly
      if (lbpStableRecipient === ethers.ZeroAddress) {
        handleTxError(new Error(`LBP stable recipient is not set but ETH share is required (${ethers.formatEther(actualStableForLBP)} ETH). Please check auction configuration.`));
        return;
      }
      
      // Verify that lbpStableRecipient is the PresaleManager
      if (lbpStableRecipient.toLowerCase() !== address.toLowerCase()) {
        handleTxError(new Error(`LBP stable recipient (${lbpStableRecipient}) is not set to PresaleManager (${address}). ETH must be sent to PresaleManager.`));
        return;
      }

      if (ethForTreasury === 0n && stableForLBP > 0n) {
        handleTxError(new Error(`No ETH available in treasury for LBP. Required: ${ethers.formatEther(stableForLBP)} ETH, Available: 0 ETH`));
        return;
      }

      // CRITICAL: Check if auction has enough tokens to transfer
      // Tokens must be transferred to auction BEFORE initialization
      try {
        // First get AuctionRecord to get the saleToken address
        const record = await managerContract.getAuctionRecord(info.auction);
        const recordSaleToken = record.saleToken;
        
        // Get saleToken from auction contract
        const saleTokenAddress = await auctionContract.saleToken();
        
        console.log("=== Token Address Check ===");
        console.log("Sale Token Address (from auction):", saleTokenAddress);
        console.log("Sale Token Address (from record):", recordSaleToken);
        console.log("Addresses match:", saleTokenAddress.toLowerCase() === recordSaleToken.toLowerCase());
        console.log("===========================");
        
        // Check if addresses match
        if (saleTokenAddress.toLowerCase() !== recordSaleToken.toLowerCase()) {
          const errorMsg = `❌ CRITICAL: Token address mismatch! ` +
            `Auction has: ${saleTokenAddress}, but AuctionRecord has: ${recordSaleToken}. ` +
            `This indicates a configuration error.`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
        
        // Check if contract exists at this address
        const code = await provider.getCode(saleTokenAddress);
        if (code === "0x" || code === "0x0") {
          const errorMsg = `❌ CRITICAL: Token contract does not exist at address ${saleTokenAddress}! ` +
            `\n\nThis means the token was never deployed or the address is wrong. ` +
            `\n\nFrom your deployment, TestToken is at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 ` +
            `\nBut your auction is using: ${saleTokenAddress} ` +
            `\n\nSOLUTION: ` +
            `\n1. Create a new auction with the correct token address (0xa513E6E4b8f2a923D98304ec87F64353C4D5C853), OR ` +
            `\n2. Deploy a token to address ${saleTokenAddress} if you want to use this address.`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
        
        // Now try to read token balance
        const saleTokenAbi = [
          { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
          { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
          { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
        ];
        const saleTokenContract = new ethers.Contract(saleTokenAddress, saleTokenAbi, provider);
        
        // Verify token contract exists and is valid
        let tokenSymbol = "UNKNOWN";
        try {
          tokenSymbol = await saleTokenContract.symbol();
        } catch (e) {
          console.warn("Could not get token symbol:", e);
        }
        
        const auctionTokenBalance = await saleTokenContract.balanceOf(info.auction);
        const managerTokenBalance = await saleTokenContract.balanceOf(address);
        const managerEthBalance = await provider.getBalance(address);
        
        console.log("=== Token Balance Check ===");
        console.log("Token Symbol:", tokenSymbol);
        console.log("Auction Token Balance:", ethers.formatEther(auctionTokenBalance) + " tokens");
        console.log("Unsold Tokens (need to transfer):", ethers.formatEther(unsoldTokens) + " tokens");
        console.log("PresaleManager Token Balance:", ethers.formatEther(managerTokenBalance) + " tokens");
        console.log("PresaleManager ETH Balance:", ethers.formatEther(managerEthBalance) + " ETH");
        console.log("Expected ETH from auction:", ethers.formatEther(actualStableForLBP) + " ETH");
        console.log("===========================");
        
        // CRITICAL: Auction must have enough tokens to transfer unsoldTokens
        if (auctionTokenBalance < unsoldTokens) {
          const missing = unsoldTokens - auctionTokenBalance;
          const errorMsg = `❌ CRITICAL: Auction does not have enough tokens! ` +
            `Required: ${ethers.formatEther(unsoldTokens)} tokens, ` +
            `Available: ${ethers.formatEther(auctionTokenBalance)} tokens, ` +
            `Missing: ${ethers.formatEther(missing)} tokens. ` +
            `\n\nSOLUTION: You need to transfer tokens to the auction address (${info.auction}) before calling launchLbp(). ` +
            `Transfer at least ${ethers.formatEther(unsoldTokens)} tokens (${unsoldTokens.toString()} wei) to the auction. ` +
            `This is likely why launchLbp() is failing with "missing revert data".`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
        
        console.log("✅ Token contract exists and is valid");
        console.log("✅ Token addresses match");
        console.log("✅ Auction has sufficient tokens to transfer unsold tokens");
        console.log("✅ PresaleManager will receive tokens and ETH when auction.launchLbp() is called.");
      } catch (balanceErr) {
        console.error("❌ Error checking token balances:", balanceErr);
        // If we can't check balances, it might be because the token address is invalid
        if (balanceErr?.message?.includes("missing revert data") || balanceErr?.code === "CALL_EXCEPTION") {
          // Try to get the token address from record first
          try {
            const record = await managerContract.getAuctionRecord(info.auction);
            const recordSaleToken = record.saleToken;
            const code = await provider.getCode(recordSaleToken);
            if (code === "0x" || code === "0x0") {
              const errorMsg = `❌ CRITICAL: Token contract does not exist at address ${recordSaleToken}! ` +
                `\n\nThis means the token was never deployed or the address is wrong. ` +
                `\n\nFrom your deployment, TestToken is at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 ` +
                `\nBut your auction is using: ${recordSaleToken} ` +
                `\n\nSOLUTION: ` +
                `\n1. Create a new auction with the correct token address (0xa513E6E4b8f2a923D98304ec87F64353C4D5C853), OR ` +
                `\n2. Deploy a token to address ${recordSaleToken} if you want to use this address.`;
              console.error(errorMsg);
              handleTxError(new Error(errorMsg));
              return;
            }
          } catch (recordErr) {
            console.warn("Could not check record:", recordErr);
          }
          
          const errorMsg = `❌ CRITICAL: Cannot read token balance. This might mean: ` +
            `1) Token address is invalid or doesn't exist, ` +
            `2) Token contract is not deployed, or ` +
            `3) Token address in AuctionRecord is wrong. ` +
            `\n\nPlease verify the saleToken address is correct. ` +
            `\nFrom your deployment, TestToken should be at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
        // Don't return for other errors - continue with other checks
      }

      // Validate LBP config parameters before calling
      console.log("Validating LBP config parameters...");
      console.log("LBP Config:", {
        startTime: launchLbpConfig.startTime,
        endTime: launchLbpConfig.endTime,
        poolStartWeightToken: launchLbpConfig.poolStartWeightToken,
        poolEndWeightToken: launchLbpConfig.poolEndWeightToken,
        poolSwapFee: launchLbpConfig.poolSwapFee,
        vestingStartTime: launchLbpConfig.vestingStartTime,
        vestingCliffDuration: launchLbpConfig.vestingCliffDuration,
        vestingFinalDuration: launchLbpConfig.vestingFinalDuration,
        vestingCliffPercentBP: launchLbpConfig.vestingCliffPercentBP,
      });
      
      // Check if LBP needs to be deployed (if record.lbp == address(0))
      // _deploySecureLBP() will be called, which requires valid parameters
      if (info.lbp === ethers.ZeroAddress || !info.lbp) {
        console.log("LBP will be deployed (record.lbp is zero)");
        // Validate parameters for deployment
        if (launchLbpConfig.startTime >= launchLbpConfig.endTime) {
          handleTxError(new Error("LBP start time must be before end time"));
          return;
        }
        if (Number(launchLbpConfig.poolStartWeightToken) === 0 || Number(launchLbpConfig.poolEndWeightToken) === 0) {
          handleTxError(new Error("Pool weights must be greater than 0"));
          return;
        }
        // Validate vesting parameters for configureVesting()
        if (launchLbpConfig.vestingCliffPercentBP > 10000) {
          handleTxError(new Error("vestingCliffPercentBP must be <= 10000 (100%)"));
          return;
        }
        if (launchLbpConfig.vestingFinalDuration < launchLbpConfig.vestingCliffDuration) {
          handleTxError(new Error("vestingFinalDuration must be >= vestingCliffDuration"));
          return;
        }
        console.log("✅ All LBP deployment parameters are valid");
      } else {
        console.log("LBP already exists:", info.lbp);
      }

      console.log("✅ All pre-checks passed. Ready to launch LBP.");

    } catch (err) {
      console.warn("Could not check auction state:", err);
      // Continue anyway - let the contract handle the error
    }

    // Check if AuctionRecord has saleToken and treasury set
    // These are required for _deploySecureLBP()
    try {
      const record = await managerContract.getAuctionRecord(info.auction);
      console.log("AuctionRecord:", {
        saleToken: record.saleToken || "NOT SET",
        treasury: record.treasury || "NOT SET",
        lbp: record.lbp || "NOT SET (will be deployed)",
      });
      
      if (!record.saleToken || record.saleToken === ethers.ZeroAddress) {
        handleTxError(new Error("AuctionRecord.saleToken is not set. This is required for LBP deployment."));
        return;
      }
      
      if (!record.treasury || record.treasury === ethers.ZeroAddress) {
        handleTxError(new Error("AuctionRecord.treasury is not set. This is required for LBP deployment."));
        return;
      }
    } catch (recordErr) {
      console.warn("Could not check AuctionRecord:", recordErr);
    }

    // Try estimateGas and staticCall to get better error messages
    // But if both fail with "missing revert data", we'll still try the transaction
    // because sometimes the actual transaction works even when estimateGas fails
    const preCheck = async () => {
      try {
        // First try estimateGas - it often gives better error messages
        try {
          const gasEstimate = await managerContract.launchLBP.estimateGas(info.auction, launchLbpConfig);
          console.log("✅ Gas estimation succeeded:", gasEstimate.toString());
        } catch (gasErr) {
          console.error("❌ Gas estimation failed:", gasErr);
          // If estimateGas fails, try staticCall
          try {
            await managerContract.launchLBP.staticCall(info.auction, launchLbpConfig);
            console.log("✅ Static call succeeded");
          } catch (staticErr) {
            console.error("❌ Static call also failed:", staticErr);
            // Try to extract error reason
            if (gasErr?.reason) {
              throw new Error(gasErr.reason);
            } else if (staticErr?.reason) {
              throw new Error(staticErr.reason);
            } else if (gasErr?.data?.message) {
              throw new Error(gasErr.data.message);
            } else if (staticErr?.data?.message) {
              throw new Error(staticErr.data.message);
            }
            // If we can't get a reason, but both failed, we'll still try the transaction
            // because sometimes "missing revert data" is a false negative
            console.warn("⚠️ Both estimateGas and staticCall failed with 'missing revert data'. This might be a false negative. Will attempt the transaction anyway.");
            // Don't throw - let the transaction proceed
          }
        }
      } catch (preCheckErr) {
        // Only throw if we got a specific error reason
        if (preCheckErr.message && !preCheckErr.message.includes("missing revert data")) {
          console.error("Pre-check failed with specific error:", preCheckErr);
          throw preCheckErr;
        }
        // Otherwise, log and continue
        console.warn("Pre-check failed but continuing:", preCheckErr);
      }
    };

    // Skip preCheck and try the transaction directly
    // This will show the real error if the transaction fails
    // Sometimes "missing revert data" from estimateGas/staticCall is a false negative
    console.log("⚠️ Attempting transaction without preCheck to see real error...");
    runAction("Launch LBP", () => managerContract.launchLBP(info.auction, launchLbpConfig), null);
  };

  const handleFinalizeLbp = () =>
    runAction("Finalize LBP", () => managerContract.finalizeLbp(info.auction, info.vesting));

  const handleUnwind = () =>
    runAction("Unwind LBP", () => managerContract.unwindLbpAll(info.auction));

  const heroStats = info
    ? [
        { label: "Owner", value: info.owner || "—" },
        { label: "Auction", value: info.auction || "Pending" },
        { label: "LBP", value: info.lbp || "Not initialized" },
        { label: "Vesting escrow", value: info.vesting || "Not created" },
      ]
    : [];

  return (
    <section className="page presale-page space-y-6">
      <div className="manager-hero">
        <div className="hero-top">
          <div>
            <p className="hero-subtitle">Presale manager</p>
            <h1 className="hero-title">{address}</h1>
          </div>
          {info?.auction && (
            <Link to={`/presale/${address}/auction`} className="open-auction-link">
              Open auction view
            </Link>
          )}
        </div>
        {info && (
          <div className="hero-meta">
            {heroStats.map((stat) => (
              <div key={stat.label} className="manager-stat">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {txStatus && (
        <div className={`transaction-banner transaction-banner--${txStatus.status || "pending"}`}>
          <span>{txStatus.message}</span>
          {txStatus.hash && <span className="transaction-banner__hash">{shortenHash(txStatus.hash)}</span>}
        </div>
      )}

      {loading ? (
        <div className="presale-panel placeholder">Loading…</div>
      ) : error ? (
        <div className="presale-panel error">{error}</div>
      ) : (
        <>
          <div className="presale-panel">
            <AuctionControls
              isOwner={isOwner}
              auctionAddress={info?.auction}
              onFinalizeAuction={handleFinalizeAuction}
              onLaunchLbp={handleLaunchLbp}
              onFinalizeLbp={handleFinalizeLbp}
              onUnwind={handleUnwind}
              lbpConfig={lbpConfig}
              onLbpConfigChange={handleLbpConfigChange}
              disabled={!info?.auction}
            />
          </div>

          {auctions.length > 0 && (
            <div className="presale-panel auction-panel">
              <p className="text-base font-semibold text-white">Deployed auctions</p>
              <ul>
                {auctions.map((auctionAddress) => (
                  <li key={auctionAddress}>{auctionAddress}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default PresalePage;
