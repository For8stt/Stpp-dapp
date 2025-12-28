import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ethers } from "ethers";

import AuctionControls from "../components/presale/AuctionControls";
import BonusMerkleManager from "../components/presale/BonusMerkleManager";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { useAuctionData } from "../hooks/useAuctionData";
import { useTime } from "../time";

// Tooltip component for explanations
const Tooltip = ({ children, text }) => {
  const [show, setShow] = useState(false);
  
  if (!text) return children;
  
  return (
    <div className="relative inline-block">
      <div
        className="inline-flex items-center gap-1.5 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
        <svg
          className="w-4 h-4 text-white/50 hover:text-white/70 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      {show && (
        <div className="absolute z-50 w-80 p-3 text-xs leading-relaxed text-white bg-gradient-to-br from-slate-900 to-slate-800 border border-white/20 rounded-lg shadow-xl mt-2 left-0 top-full pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
};

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
  initialFeePreset: "1", // Default: 10% (enum value 1 = TEN_PERCENT)
  feeDecayDurationPreset: "1", // Default: 15 minutes (enum value 1 = FIFTEEN_MINUTES)
  vestingCliffDuration: "259200", // 3 days (3 * 24 * 60 * 60 = 259200 seconds)
  vestingFinalDuration: "2592000", // 30 days for LBP (30 * 24 * 60 * 60 = 2592000 seconds)
  vestingCliffPercentBP: "1500", // 15% (15 * 100 = 1500 BPS)
  maxContributionPerAddress: "5", // Default: 5 ETH
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

  const [auctionContract, setAuctionContract] = useState(null);
  
  // Post-LBP Settlement state
  const [lbpState, setLbpState] = useState({
    finalized: false,
    endTime: null,
    ethBalance: 0n,
    tokenBalance: 0n,
    uniswapLiquidityCreated: false,
    lpBalance: 0n,
    poolAddress: null,
    loading: false
  });
  const [unwindingLiquidity, setUnwindingLiquidity] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    ethToUniswap: "",
    tokensToUniswap: "",
    feeTier: "3000",
    sqrtPriceX96: "79228162514264337593543950336", // Default: sqrt(1) * 2^96 (1:1 price ratio)
    tickLower: "",
    tickUpper: "",
    useFullRange: true,
    lpRecipient: "",
    uniswapFactory: "",
    uniswapPositionManager: "",
    weth: ""
  });
  const [uniswapConfiguring, setUniswapConfiguring] = useState(false);
  const [settlementExecuting, setSettlementExecuting] = useState(false);
  const [settlementStep, setSettlementStep] = useState("");
  const [settlementResults, setSettlementResults] = useState(null);
  const [isSettlementPanelExpanded, setIsSettlementPanelExpanded] = useState(false);

  useEffect(() => {
    const loadAuctionContract = async () => {
      if (!info?.auction || !managerContract) {
        setAuctionContract(null);
        return;
      }
      try {
        const allAbis = await import("../abi/allAbis.json");
        const { ensureProvider } = await import("../services/web3/provider");
        const provider = ensureProvider();
        const auctionAbi = allAbis.DutchAuction || [];
        if (auctionAbi.length > 0) {
          const { Contract } = await import("ethers");
          const contract = new Contract(info.auction, auctionAbi, provider);
          setAuctionContract(contract);
        }
      } catch (err) {
        console.warn("Failed to load auction contract:", err);
        setAuctionContract(null);
      }
    };
    loadAuctionContract();
  }, [info?.auction, managerContract]);
  
  const {
    data: auctionData,
    refetch: refetchAuctionData,
  } = useAuctionData(auctionContract, managerContract, info?.auction);

  const { currentTime } = useTime();

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
      } catch {}
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

  // Load LBP state for Post-LBP Settlement panel
  useEffect(() => {
    const loadLbpState = async () => {
      if (!info?.lbp || info.lbp === ethers.ZeroAddress || !isOwner) {
        setLbpState({
          finalized: false,
          endTime: null,
          ethBalance: 0n,
          tokenBalance: 0n,
          uniswapLiquidityCreated: false,
          lpBalance: 0n,
          poolAddress: null,
          loading: false
        });
        return;
      }

      try {
        setLbpState(prev => ({ ...prev, loading: true }));
        const allAbis = await import("../abi/allAbis.json");
        const { ensureProvider } = await import("../services/web3/provider");
        const provider = ensureProvider();
        const lbpAbi = allAbis.SecureLBP || [];
        
        if (lbpAbi.length === 0) {
          setLbpState(prev => ({ ...prev, loading: false }));
          return;
        }

        const { Contract } = await import("ethers");
        const lbpContract = new Contract(info.lbp, lbpAbi, provider);
        
        const [finalized, endTime, ethBalance, tokenAddress, uniswapLiquidityCreated] = await Promise.all([
          lbpContract.finalized().catch(() => false),
          lbpContract.endTime().catch(() => null),
          provider.getBalance(info.lbp).catch(() => 0n),
          lbpContract.token().catch(() => ethers.ZeroAddress),
          lbpContract.uniswapLiquidityCreated().catch(() => false)
        ]);

        let tokenBalance = 0n;
        if (tokenAddress !== ethers.ZeroAddress) {
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new Contract(tokenAddress, tokenAbi, provider);
            tokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
          }
        }

        // Check LP balance in pool
        let lpBalance = 0n;
        let poolAddress = null;
        try {
          const poolInit = await lbpContract.poolInitialized().catch(() => false);
          if (poolInit) {
            poolAddress = await lbpContract.pool().catch(() => ethers.ZeroAddress);
            if (poolAddress !== ethers.ZeroAddress) {
              const poolAbi = allAbis.LBPWeightedAMM || [];
              if (poolAbi.length > 0) {
                const poolContract = new Contract(poolAddress, poolAbi, provider);
                lpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
              }
            }
          }
        } catch (lpErr) {
          console.warn("Failed to check LP balance:", lpErr);
        }

        console.log("=== LBP State Loaded ===", {
          finalized,
          endTime: endTime ? Number(endTime) : null,
          currentTime,
          hasEnded: endTime ? currentTime > Number(endTime) : null,
          ethBalance: ethers.formatEther(ethBalance ?? 0n),
          tokenBalance: ethers.formatEther(tokenBalance ?? 0n),
          lpBalance: ethers.formatEther(lpBalance ?? 0n),
          poolAddress,
          uniswapLiquidityCreated
        });

        setLbpState({
          finalized,
          endTime: endTime ? Number(endTime) : null,
          ethBalance,
          tokenBalance,
          uniswapLiquidityCreated,
          lpBalance,
          poolAddress,
          loading: false
        });

        // Set default LP recipient to treasury if available (only once)
        if (!settlementForm.lpRecipient || settlementForm.lpRecipient === "") {
          try {
            const treasury = await lbpContract.treasury().catch(() => ethers.ZeroAddress);
            if (treasury !== ethers.ZeroAddress) {
              setSettlementForm(prev => {
                if (!prev.lpRecipient || prev.lpRecipient === "") {
                  return { ...prev, lpRecipient: treasury };
                }
                return prev;
              });
            }
          } catch {}
        }

        // Load Uniswap V3 addresses from file if available (for localhost)
        if ((!settlementForm.uniswapFactory || !settlementForm.uniswapPositionManager || !settlementForm.weth)) {
          try {
            const uniswapAddresses = await import("../abi/uniswapV3Addresses.json").catch(() => null);
            if (uniswapAddresses?.default) {
              // Try to get chainId from window.ethereum
              let chainId = "31337"; // Default to localhost
              try {
                if (window.ethereum) {
                  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
                  chainId = parseInt(chainIdHex, 16).toString();
                }
              } catch {
                // Keep default chainId
              }
              
              const addresses = uniswapAddresses.default[chainId] || uniswapAddresses.default["31337"] || uniswapAddresses.default["localhost"];
              if (addresses) {
                console.log("Loading Uniswap V3 addresses from file:", addresses);
                setSettlementForm(prev => ({
                  ...prev,
                  // Force update if addresses are empty or different
                  uniswapFactory: (!prev.uniswapFactory || prev.uniswapFactory === "") ? (addresses.factory || "") : prev.uniswapFactory,
                  uniswapPositionManager: (!prev.uniswapPositionManager || prev.uniswapPositionManager === "") ? (addresses.positionManager || "") : prev.uniswapPositionManager,
                  weth: (!prev.weth || prev.weth === "") ? (addresses.weth || "") : prev.weth
                }));
              }
            }
          } catch (err) {
            // File doesn't exist or can't be loaded - that's okay
            console.log("Uniswap V3 addresses file not found, user will need to enter addresses manually");
          }
        }
      } catch (err) {
        console.warn("Failed to load LBP state:", err);
        setLbpState(prev => ({ ...prev, loading: false }));
      }
    };

    loadLbpState();
  }, [info?.lbp, isOwner, info?.lbpFinalized, currentTime]);

  // Debug: Log settlement results when they change
  useEffect(() => {
    if (settlementResults) {
      console.log("=== Settlement Results Updated ===", settlementResults);
    }
  }, [settlementResults]);

  const handleAuctionFormChange = (name, value) => {
    setAuctionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLbpConfigChange = (name, value) => {
    setLbpConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleSettlementFormChange = (name, value) => {
    setSettlementForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSetMax = (type) => {
    if (type === "eth") {
      const balance = lbpState.ethBalance ?? 0n;
      if (balance === 0n) return;
      const maxEth = ethers.formatEther(balance);
      handleSettlementFormChange("ethToUniswap", maxEth);
    } else if (type === "tokens") {
      const balance = lbpState.tokenBalance ?? 0n;
      if (balance === 0n) return;
      const maxTokens = ethers.formatEther(balance);
      handleSettlementFormChange("tokensToUniswap", maxTokens);
    }
  };

  const handleSetPercentage = (type, percentage) => {
    if (type === "eth") {
      const balance = lbpState.ethBalance ?? 0n;
      if (balance === 0n) return;
      const amount = (balance * BigInt(Math.floor(percentage * 100))) / 10000n;
      handleSettlementFormChange("ethToUniswap", ethers.formatEther(amount));
    } else if (type === "tokens") {
      const balance = lbpState.tokenBalance ?? 0n;
      if (balance === 0n) return;
      const amount = (balance * BigInt(Math.floor(percentage * 100))) / 10000n;
      handleSettlementFormChange("tokensToUniswap", ethers.formatEther(amount));
    }
  };

  const handleUnwindLiquidity = useCallback(async () => {
    if (!managerContract || !info?.auction || !isOwner) {
      handleTxError(new Error("Invalid state for unwinding liquidity."));
      return;
    }

    if ((lbpState.lpBalance ?? 0n) === 0n) {
      handleTxError(new Error("No liquidity to unwind. LP balance is zero."));
      return;
    }

    try {
      setUnwindingLiquidity(true);
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const allAbis = await import("../abi/allAbis.json");
      const managerAbi = allAbis.PresaleManager || [];
      const managerContractWithSigner = new ethers.Contract(address, managerAbi, signer);

      showTxInfo("Please confirm liquidity unwinding in your wallet", { autoClose: false });
      const unwindTx = await managerContractWithSigner.unwindLbpAll(info.auction, { gasLimit: 500000 });
      showTxInfo("Unwind submitted to the network", { autoClose: 3000 });
      setTxStatus({ status: "pending", message: "Unwinding liquidity…", hash: unwindTx.hash });
      await unwindTx.wait();
      showTxSuccess("Liquidity unwound successfully! Refreshing balances...", { autoClose: 2000 });

      // Refresh LBP state after unwinding
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for block confirmation
      const lbpAbi = allAbis.SecureLBP || [];
      const { Contract } = await import("ethers");
      const lbpContract = new Contract(info.lbp, lbpAbi, provider);
      
      const [finalized, endTime, newEthBalance, tokenAddress, uniswapLiquidityCreated] = await Promise.all([
        lbpContract.finalized().catch(() => false),
        lbpContract.endTime().catch(() => null),
        provider.getBalance(info.lbp).catch(() => 0n),
        lbpContract.token().catch(() => ethers.ZeroAddress),
        lbpContract.uniswapLiquidityCreated().catch(() => false)
      ]);

      let newTokenBalance = 0n;
      if (tokenAddress !== ethers.ZeroAddress) {
        const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
        if (tokenAbi.length > 0) {
          const tokenContract = new Contract(tokenAddress, tokenAbi, provider);
          newTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
        }
      }

      // Check LP balance after unwinding
      let newLpBalance = 0n;
      let newPoolAddress = null;
      try {
        const poolInit = await lbpContract.poolInitialized().catch(() => false);
        if (poolInit) {
          newPoolAddress = await lbpContract.pool().catch(() => ethers.ZeroAddress);
          if (newPoolAddress !== ethers.ZeroAddress) {
            const poolAbi = allAbis.LBPWeightedAMM || [];
            if (poolAbi.length > 0) {
              const poolContract = new Contract(newPoolAddress, poolAbi, provider);
              newLpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
            }
          }
        }
      } catch (lpErr) {
        console.warn("Failed to check LP balance after unwind:", lpErr);
      }

      setLbpState({
        finalized,
        endTime: endTime ? Number(endTime) : null,
        ethBalance: newEthBalance,
        tokenBalance: newTokenBalance,
        uniswapLiquidityCreated,
        lpBalance: newLpBalance,
        poolAddress: newPoolAddress,
        loading: false
      });

      setTxStatus({ status: "success", message: "Liquidity unwound successfully!" });
      showTxSuccess(`Unwound liquidity! New balances: ${ethers.formatEther(newEthBalance)} ETH, ${ethers.formatEther(newTokenBalance)} tokens`, { autoClose: 5000 });
    } catch (err) {
      console.error("Error in handleUnwindLiquidity:", err);
      if (err?.code === "ACTION_REJECTED" || err?.reason === "rejected" || err?.message?.includes("user rejected") || err?.message?.includes("user cancel") || err?.message?.includes("Transaction cancelled")) {
        setTxStatus({ status: "error", message: "Transaction cancelled by user" });
        showTxInfo("Transaction cancelled by user", { autoClose: 3000 });
        return;
      }
      let errorMessage = err?.message || "Failed to unwind liquidity";
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      handleTxError(err, errorMessage);
      setTxStatus({ status: "error", message: errorMessage });
    } finally {
      setUnwindingLiquidity(false);
    }
  }, [managerContract, info?.auction, info?.lbp, isOwner, lbpState.lpBalance, address]);

  const handleConfigureUniswapV3 = useCallback(async () => {
    if (!managerContract || !info?.auction || !isOwner) {
      handleTxError(new Error("Invalid state for configuring Uniswap V3."));
      return;
    }

    if (!settlementForm.uniswapFactory || !settlementForm.uniswapPositionManager || !settlementForm.weth) {
      handleTxError(new Error("All Uniswap V3 addresses are required: Factory, Position Manager, and WETH."));
      return;
    }

    try {
      setUniswapConfiguring(true);
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const allAbis = await import("../abi/allAbis.json");
      const managerAbi = allAbis.PresaleManager || [];
      const managerContractWithSigner = new ethers.Contract(address, managerAbi, signer);

      showTxInfo("Please confirm Uniswap V3 configuration in your wallet", { autoClose: false });
      const configTx = await managerContractWithSigner.setLbpUniswapV3Config(
        info.auction,
        settlementForm.uniswapFactory,
        settlementForm.uniswapPositionManager,
        settlementForm.weth,
        parseInt(settlementForm.feeTier)
      );
      setTxStatus({ status: "pending", message: "Configuring Uniswap V3…", hash: configTx.hash });
      showTxInfo("Configuration submitted to the network", { autoClose: 3000 });
      await configTx.wait();
      showTxSuccess("Uniswap V3 configured successfully!", { autoClose: 3000 });
      setTxStatus({ status: "success", message: "Uniswap V3 configured!" });
    } catch (err) {
      console.error("Error in handleConfigureUniswapV3:", err);
      if (err?.code === "ACTION_REJECTED" || err?.reason === "rejected" || err?.message?.includes("user rejected") || err?.message?.includes("user cancel") || err?.message?.includes("Transaction cancelled")) {
        setTxStatus({ status: "error", message: "Transaction cancelled by user" });
        showTxInfo("Transaction cancelled by user", { autoClose: 3000 });
        return;
      }
      let errorMessage = err?.message || "Failed to configure Uniswap V3";
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      handleTxError(err, errorMessage);
      setTxStatus({ status: "error", message: errorMessage });
    } finally {
      setUniswapConfiguring(false);
    }
  }, [managerContract, info?.auction, isOwner, settlementForm.uniswapFactory, settlementForm.uniswapPositionManager, settlementForm.weth, settlementForm.feeTier, address]);

  const handleExecuteSettlement = async () => {
    if (!info?.lbp || !isOwner || !managerContract) {
      handleTxError(new Error("Missing required data"));
      return;
    }

    // Validation
    if (!lbpState.finalized) {
      handleTxError(new Error("LBP must be finalized first"));
      return;
    }

    if (currentTime <= (lbpState.endTime || 0)) {
      handleTxError(new Error("LBP must have ended first"));
      return;
    }

    const ethToUniswap = settlementForm.ethToUniswap ? ethers.parseEther(settlementForm.ethToUniswap) : 0n;
    const tokensToUniswap = settlementForm.tokensToUniswap ? ethers.parseEther(settlementForm.tokensToUniswap) : 0n;

    const ethBalance = lbpState.ethBalance ?? 0n;
    const tokenBalance = lbpState.tokenBalance ?? 0n;

    if (ethToUniswap > ethBalance) {
      handleTxError(new Error(`ETH amount (${ethers.formatEther(ethToUniswap)}) exceeds available balance (${ethers.formatEther(ethBalance)})`));
      return;
    }

    if (tokensToUniswap > tokenBalance) {
      handleTxError(new Error(`Token amount (${ethers.formatEther(tokensToUniswap)}) exceeds available balance (${ethers.formatEther(tokenBalance)})`));
      return;
    }

    if (lbpState.uniswapLiquidityCreated && (ethToUniswap > 0n || tokensToUniswap > 0n)) {
      handleTxError(new Error("Uniswap liquidity migration has already been completed. Cannot migrate again."));
      return;
    }

    const ethToTreasury = ethBalance - ethToUniswap;
    const tokensToTreasury = tokenBalance - tokensToUniswap;

    // Initialize settlement results
    const results = {
      timestamp: new Date().toISOString(),
      unwind: null,
      migrate: null,
      withdrawEth: null,
      withdrawTokens: null,
      finalBalances: {
        eth: null,
        tokens: null,
        lp: null
      }
    };

    try {
      setSettlementExecuting(true);
      setSettlementResults(null); // Clear previous results
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const allAbis = await import("../abi/allAbis.json");
      const lbpAbi = allAbis.SecureLBP || [];
      const managerAbi = allAbis.PresaleManager || [];
      const lbpContract = new ethers.Contract(info.lbp, lbpAbi, signer);
      const managerContractWithSigner = new ethers.Contract(address, managerAbi, signer);

      // Step 1: Check if liquidity needs to be unwound
      setSettlementStep("Checking liquidity state…");
      const poolInitialized = await lbpContract.poolInitialized().catch(() => false);
      let needsUnwind = false;
      
      if (poolInitialized) {
        const poolAddress = await lbpContract.pool().catch(() => ethers.ZeroAddress);
        if (poolAddress !== ethers.ZeroAddress) {
          const poolAbi = allAbis.LBPWeightedAMM || [];
          if (poolAbi.length > 0) {
            const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);
            const lpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
            needsUnwind = lpBalance > 0n;
          }
        }
      }

      if (needsUnwind) {
        setSettlementStep("Unwinding liquidity…");
        showTxInfo("Unwinding LBP liquidity…", { autoClose: false });
        const unwindTx = await managerContractWithSigner.unwindLbpAll(info.auction, { gasLimit: 500000 });
        setTxStatus({ status: "pending", message: "Unwinding liquidity…", hash: unwindTx.hash });
        showTxInfo("Unwind submitted to the network", { autoClose: 3000 });
        const unwindReceipt = await unwindTx.wait();
        showTxSuccess("Liquidity unwound successfully!", { autoClose: 2000 });
        
        results.unwind = {
          hash: unwindTx.hash,
          blockNumber: unwindReceipt.blockNumber,
          status: "success"
        };
        
        // Refresh balances after unwinding
        const newEthBalance = await provider.getBalance(info.lbp);
        setLbpState(prev => ({ ...prev, ethBalance: newEthBalance }));
      }

      // Step 2: Migrate to Uniswap V3 (if amounts specified)
      if (ethToUniswap > 0n && tokensToUniswap > 0n) {
        // Check if Uniswap V3 is configured
        setSettlementStep("Checking Uniswap V3 configuration…");
        try {
          const uniswapFactory = await lbpContract.uniswapFactory().catch(() => ethers.ZeroAddress);
          const uniswapPositionManager = await lbpContract.uniswapPositionManager().catch(() => ethers.ZeroAddress);
          const weth = await lbpContract.weth().catch(() => ethers.ZeroAddress);
          
          if (uniswapFactory === ethers.ZeroAddress || uniswapPositionManager === ethers.ZeroAddress || weth === ethers.ZeroAddress) {
            throw new Error("Uniswap V3 is not configured. Please configure Uniswap V3 addresses first using setLbpUniswapV3Config function. For localhost, you may need to deploy Uniswap V3 contracts or use mock addresses.");
          }
        } catch (configErr) {
          if (configErr.message.includes("not configured")) {
            throw configErr;
          }
          console.warn("Could not check Uniswap V3 config, proceeding anyway:", configErr);
        }

        if (!settlementForm.lpRecipient || settlementForm.lpRecipient === ethers.ZeroAddress) {
          throw new Error("LP recipient address is required for Uniswap migration");
        }

        if (!settlementForm.sqrtPriceX96) {
          throw new Error("Initial price (sqrtPriceX96) is required for Uniswap migration");
        }

        const sqrtPriceX96 = BigInt(settlementForm.sqrtPriceX96);
        let tickLower = -887272; // Full range default
        let tickUpper = 887272;  // Full range default

        if (!settlementForm.useFullRange) {
          if (!settlementForm.tickLower || !settlementForm.tickUpper) {
            throw new Error("Tick range is required when not using full range");
          }
          tickLower = parseInt(settlementForm.tickLower);
          tickUpper = parseInt(settlementForm.tickUpper);
          if (tickLower >= tickUpper) {
            throw new Error("tickLower must be less than tickUpper");
          }
        }

        const feeTier = parseInt(settlementForm.feeTier);

        setSettlementStep("Migrating to Uniswap V3…");
        showTxInfo("Please confirm Uniswap V3 migration in your wallet", { autoClose: false });
        const migrateTx = await managerContractWithSigner.migrateLiquidityToUniswapV3(
          info.auction,
          ethToUniswap,
          tokensToUniswap,
          feeTier,
          sqrtPriceX96,
          tickLower,
          tickUpper,
          settlementForm.lpRecipient,
          { gasLimit: 1000000 }
        );
        setTxStatus({ status: "pending", message: "Migrating to Uniswap V3…", hash: migrateTx.hash });
        showTxInfo("Migration submitted to the network", { autoClose: 3000 });
        const migrateReceipt = await migrateTx.wait();
        showTxSuccess(`Migrated ${ethers.formatEther(ethToUniswap)} ETH and ${ethers.formatEther(tokensToUniswap)} tokens to Uniswap V3!`, { autoClose: 3000 });
        
        results.migrate = {
          hash: migrateTx.hash,
          blockNumber: migrateReceipt.blockNumber,
          status: "success",
          ethAmount: ethers.formatEther(ethToUniswap),
          tokenAmount: ethers.formatEther(tokensToUniswap),
          lpRecipient: settlementForm.lpRecipient,
          feeTier: settlementForm.feeTier
        };
        
        // Refresh balances after migration
        const newEthBalance = await provider.getBalance(info.lbp);
        const tokenAddress = await lbpContract.token().catch(() => ethers.ZeroAddress);
        let newTokenBalance = 0n;
        if (tokenAddress !== ethers.ZeroAddress) {
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
            newTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
          }
        }
        setLbpState(prev => ({ 
          ...prev, 
          ethBalance: newEthBalance, 
          tokenBalance: newTokenBalance,
          uniswapLiquidityCreated: true
        }));
      }

      // Step 3: Withdraw remaining ETH to treasury
      if (ethToTreasury > 0n) {
        setSettlementStep("Withdrawing ETH to treasury…");
        showTxInfo("Please confirm ETH withdrawal in your wallet", { autoClose: false });
        const withdrawEthTx = await managerContractWithSigner.withdrawLbpEth(info.auction, ethToTreasury);
        setTxStatus({ status: "pending", message: "Withdrawing ETH…", hash: withdrawEthTx.hash });
        showTxInfo("ETH withdrawal submitted to the network", { autoClose: 3000 });
        const withdrawEthReceipt = await withdrawEthTx.wait();
        showTxSuccess(`Withdrew ${ethers.formatEther(ethToTreasury)} ETH to treasury!`, { autoClose: 2000 });
        
        results.withdrawEth = {
          hash: withdrawEthTx.hash,
          blockNumber: withdrawEthReceipt.blockNumber,
          status: "success",
          amount: ethers.formatEther(ethToTreasury)
        };
      }

      // Step 4: Withdraw remaining tokens to treasury
      // Only withdraw if we didn't migrate (or if there are tokens left after migration)
      if (tokensToTreasury > 0n) {
        // Check current token balance after migration (if migration happened)
        const tokenAddressForWithdraw = await lbpContract.token().catch(() => ethers.ZeroAddress);
        let currentTokenBalance = 0n;
        if (tokenAddressForWithdraw !== ethers.ZeroAddress) {
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new ethers.Contract(tokenAddressForWithdraw, tokenAbi, provider);
            currentTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
          }
        }
        
        // Only withdraw if there are actually tokens remaining
        // If migration happened, tokens should have been used, so only withdraw what's left
        if (currentTokenBalance > 0n) {
          setSettlementStep("Withdrawing tokens to treasury…");
          showTxInfo("Please confirm token withdrawal in your wallet", { autoClose: false });
          // Use withdrawLbpAllTokens to withdraw all remaining tokens (should match tokensToTreasury)
          const withdrawTokensTx = await managerContractWithSigner.withdrawLbpAllTokens(info.auction);
          setTxStatus({ status: "pending", message: "Withdrawing tokens…", hash: withdrawTokensTx.hash });
          showTxInfo("Token withdrawal submitted to the network", { autoClose: 3000 });
          const withdrawTokensReceipt = await withdrawTokensTx.wait();
          showTxSuccess(`Withdrew ${ethers.formatEther(currentTokenBalance)} tokens to treasury!`, { autoClose: 2000 });
          
          results.withdrawTokens = {
            hash: withdrawTokensTx.hash,
            blockNumber: withdrawTokensReceipt.blockNumber,
            status: "success",
            amount: ethers.formatEther(currentTokenBalance)
          };
        }
      }

      setSettlementStep("");
      setTxStatus({ status: "success", message: "Post-LBP Settlement completed!" });
      showTxSuccess("All settlement actions completed successfully!", { autoClose: 5000 });
      
      // Refresh LBP state
      const [finalized, endTime, newEthBalance, tokenAddress, uniswapLiquidityCreated] = await Promise.all([
        lbpContract.finalized().catch(() => false),
        lbpContract.endTime().catch(() => null),
        provider.getBalance(info.lbp).catch(() => 0n),
        lbpContract.token().catch(() => ethers.ZeroAddress),
        lbpContract.uniswapLiquidityCreated().catch(() => false)
      ]);

      let newTokenBalance = 0n;
      if (tokenAddress !== ethers.ZeroAddress) {
        const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
        if (tokenAbi.length > 0) {
          const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
          newTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
        }
      }

      // Check LP balance after settlement
      let newLpBalance = 0n;
      let newPoolAddress = null;
      try {
        const poolInit = await lbpContract.poolInitialized().catch(() => false);
        if (poolInit) {
          newPoolAddress = await lbpContract.pool().catch(() => ethers.ZeroAddress);
          if (newPoolAddress !== ethers.ZeroAddress) {
            const poolAbi = allAbis.LBPWeightedAMM || [];
            if (poolAbi.length > 0) {
              const poolContract = new ethers.Contract(newPoolAddress, poolAbi, provider);
              newLpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
            }
          }
        }
      } catch (lpErr) {
        console.warn("Failed to check LP balance after settlement:", lpErr);
      }

      setLbpState(prev => ({
        ...prev,
        finalized,
        endTime: endTime ? Number(endTime) : null,
        ethBalance: newEthBalance,
        tokenBalance: newTokenBalance,
        uniswapLiquidityCreated,
        lpBalance: newLpBalance,
        poolAddress: newPoolAddress,
        loading: false
      }));

      // Store final balances in results
      results.finalBalances = {
        eth: ethers.formatEther(newEthBalance),
        tokens: ethers.formatEther(newTokenBalance),
        lp: ethers.formatEther(newLpBalance)
      };

      // Save results
      console.log("=== Settlement Results ===", results);
      setSettlementResults(results);
      console.log("Settlement results saved to state");

    } catch (err) {
      console.error("Error in settlement execution:", err);
      setSettlementStep("");
      handleTxError(err, "Failed to execute settlement");
    } finally {
      setSettlementExecuting(false);
    }
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
      initialFeePreset: Number(lbpConfig.initialFeePreset ?? "1"),
      feeDecayDurationPreset: Number(lbpConfig.feeDecayDurationPreset ?? "1"),
      maxContributionPerAddress: (lbpConfig.maxContributionPerAddress && lbpConfig.maxContributionPerAddress.trim() !== "")
        ? ethers.parseEther(lbpConfig.maxContributionPerAddress).toString()
        : "0",
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
        earlyBonusWindow: Number(auctionForm.earlyBonusWindow || 0),
        earlyBonusPct: parseBps(auctionForm.earlyBonusPct),
        nonRevealPenaltyBps: 0,
        lbpStableShareBps: 4000,
        thresholdLow: 0,
        maxDecayMultiplier: ethers.parseUnits("1", 18).toString(),
        minCommitDuration: 600,
        demandCheckTime: startTime + 900,
        vestingStart: startTime + 86400,
        vestingDuration: 10800, // 3 hours (3 * 60 * 60 = 10800 seconds)
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

  const runAction = async (label, action, preCheckAction = null, isAccelerateAuction = false) => {
    if (!managerContract || !info?.auction) return;
    try {
      if (preCheckAction) {
        try {
          await preCheckAction();
        } catch (preCheckErr) {
          if (preCheckErr?.message?.includes("missing revert data")) {
            console.warn("Pre-check failed with 'missing revert data', but will attempt transaction anyway");
          } else {
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

      let errorMessage = err?.message || `Failed to ${label.toLowerCase()}`;

      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }

      if (err?.receipt) {
        console.log("Transaction receipt:", err.receipt);
      }

      if (err?.transaction?.hash) {
        console.log("Transaction hash:", err.transaction.hash);
      }

      if (isAccelerateAuction) {
        if (errorMessage.includes("CommitPhaseComplete") || errorMessage.includes("commit phase")) {
          errorMessage = "Commit phase has already ended. Cannot accelerate auction.";
        } else if (errorMessage.includes("dynamicAdjustmentCount") || errorMessage.includes("already adjusted") || errorMessage.includes("CommitPhaseComplete")) {
          errorMessage = "Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once.";
        } else if (errorMessage.includes("AuctionNotInitialized") || errorMessage.includes("not initialized")) {
          errorMessage = "Auction is not initialized yet.";
        } else if (errorMessage.includes("ConditionsNotMet") || errorMessage.includes("conditions not met")) {
          errorMessage = "Conditions for acceleration are not met. Check that demand check time has passed and demand is below threshold.";
        } else if (errorMessage.includes("totalDepositCommitted") || errorMessage.includes("thresholdLow")) {
          errorMessage = "Demand is above the threshold. Auction will not shorten if participation is sufficient.";
        } else if (errorMessage.includes("missing revert data")) {
          errorMessage = "Transaction failed. Possible reasons: 1) Demand is above threshold, 2) Auction already adjusted, 3) Commit phase ended, or 4) RPC issue. Check console for details.";
        }
      } else {
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
      }
      
      handleTxError(err, errorMessage);
      setTxStatus({ status: "error", message: errorMessage });
    }
  };

  const handleFinalizeAuction = async () => {
    if (!managerContract || !info?.auction) return;

    if (info.finalized) {
      handleTxError(new Error("Auction is already finalized"));
      return;
    }
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
    }

    const preCheck = async () => {
      try {
        await managerContract.finalizeAuction.staticCall(info.auction);
      } catch (staticErr) {
        throw staticErr;
      }
    };

    runAction("Finalize auction", () => managerContract.finalizeAuction(info.auction), preCheck);
  };

  const handleAccelerateAuction = async () => {
    if (!managerContract || !info?.auction) return;

    if (info.finalized) {
      handleTxError(new Error("Auction is already finalized"));
      return;
    }

    if (!auctionData) {
      handleTxError(new Error("Auction data not loaded. Please wait..."));
      return;
    }

    const demandCheckTime = auctionData.demandCheckTime || 0;
    const commitEndTime = auctionData.commitEndTime || 0;

    if (currentTime < demandCheckTime) {
      const timeUntilCheck = demandCheckTime - currentTime;
      const hours = Math.floor(timeUntilCheck / 3600);
      const minutes = Math.floor((timeUntilCheck % 3600) / 60);
      handleTxError(new Error(`Demand check time has not been reached yet. Time remaining: ${hours}h ${minutes}m`));
      return;
    }

    if (currentTime >= commitEndTime) {
      handleTxError(new Error("Commit phase has already ended. Cannot accelerate auction."));
      return;
    }

    const totalDepositCommitted = auctionData.totalDepositCommitted || 0n;
    const thresholdLow = auctionData.thresholdLow || 0n;
    const isLowDemand = thresholdLow > 0n ? totalDepositCommitted < thresholdLow : false;
    const dynamicAdjustmentCount = auctionData.dynamicAdjustmentCount || 0;

    if (dynamicAdjustmentCount > 0) {
      handleTxError(new Error("Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once."));
      return;
    }

    if (!isLowDemand && thresholdLow > 0n) {
      const confirmMessage = `Current deposits (${ethers.formatEther(totalDepositCommitted)} ETH) are above the threshold (${ethers.formatEther(thresholdLow)} ETH). The auction will NOT shorten if demand is sufficient. Continue anyway?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    } else if (thresholdLow === 0n) {
      handleTxError(new Error("Threshold low is set to 0. Cannot determine if demand is low. Please configure thresholdLow in auction parameters."));
      return;
    }

    const preCheck = async () => {
      try {
        if (auctionContract) {
          const currentCommitEnd = Number(await auctionContract.commitEndTime());
          const initialCommitEnd = Number(await auctionContract.initialCommitEndTime());
          const dynamicAdjustmentCount = Number(await auctionContract.dynamicAdjustmentCount());
          const totalDeposit = await auctionContract.totalDepositCommitted();
          const threshold = await auctionContract.thresholdLow();
          
          console.log('[Accelerate Auction] Pre-check state:', {
            currentCommitEnd: new Date(currentCommitEnd * 1000).toLocaleString(),
            initialCommitEnd: new Date(initialCommitEnd * 1000).toLocaleString(),
            dynamicAdjustmentCount,
            totalDeposit: ethers.formatEther(totalDeposit),
            threshold: ethers.formatEther(threshold),
            isLowDemand: totalDeposit < threshold,
            canShorten: currentCommitEnd < initialCommitEnd
          });
          
          if (dynamicAdjustmentCount > 0) {
            throw new Error("Auction has already been adjusted. Dynamic reserve adjustment can only be triggered once.");
          }
          if (totalDeposit >= threshold && threshold > 0n) {
            throw new Error(`Demand is above threshold (${ethers.formatEther(totalDeposit)} ETH >= ${ethers.formatEther(threshold)} ETH). Auction will not shorten.`);
          }
        }
        await managerContract.checkAndAdjustAuction.staticCall(info.auction);
      } catch (staticErr) {
        if (staticErr?.message?.includes("already adjusted") || 
            staticErr?.message?.includes("Demand is above threshold")) {
          throw staticErr;
        }
        console.warn("Pre-check failed, but will attempt transaction:", staticErr);
      }
    };

    runAction(
      "Accelerate auction",
      () => managerContract.checkAndAdjustAuction(info.auction),
      preCheck,
      true // isAccelerateAuction flag
    ).then(async () => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await refetchAuctionData();
      await refreshInfo();
      if (auctionData) {
        const oldCommitEndTime = auctionData.commitEndTime;
        const oldInitialCommitEndTime = auctionData.initialCommitEndTime;
        if (auctionContract) {
          try {
            const newCommitEndTime = Number(await auctionContract.commitEndTime());
            const newInitialCommitEndTime = Number(await auctionContract.initialCommitEndTime());
            const dynamicAdjustmentCount = Number(await auctionContract.dynamicAdjustmentCount());
            
            console.log('[Accelerate Auction] Status check:', {
              oldCommitEndTime: new Date(oldCommitEndTime * 1000).toLocaleString(),
              newCommitEndTime: new Date(newCommitEndTime * 1000).toLocaleString(),
              oldInitialCommitEndTime: new Date(oldInitialCommitEndTime * 1000).toLocaleString(),
              newInitialCommitEndTime: new Date(newInitialCommitEndTime * 1000).toLocaleString(),
              dynamicAdjustmentCount,
              wasShortened: newCommitEndTime < newInitialCommitEndTime,
              timeDifference: newInitialCommitEndTime - newCommitEndTime
            });
            
            if (dynamicAdjustmentCount > 0 && newCommitEndTime < newInitialCommitEndTime) {
              showTxSuccess("Auction timeline successfully shortened due to low demand.", { autoClose: 5000 });
            } else if (dynamicAdjustmentCount > 0) {
              const timeDiff = newInitialCommitEndTime - newCommitEndTime;
              if (timeDiff === 0) {
                showTxInfo("Dynamic adjustment executed, but commit end time could not be shortened further (minimum duration reached or insufficient reduction).", { autoClose: 8000 });
              } else {
                showTxInfo("Dynamic adjustment executed. Check auction view for updated timeline.", { autoClose: 5000 });
              }
            }
          } catch (err) {
            console.warn("Could not verify auction shortening:", err);
            showTxSuccess("Accelerate auction transaction completed. Refreshing data...", { autoClose: 3000 });
          }
        }
      }
    }).catch((err) => {
      console.error("Accelerate auction error:", err);
    });
  };

  const handleLaunchLbp = async () => {
    if (!managerContract || !info?.auction) return;

    if (!info.finalized) {
      handleTxError(new Error("Auction must be finalized before launching LBP"));
      return;
    }

    if (info.lbpInitialized) {
      handleTxError(new Error("LBP has already been launched"));
      return;
    }

    if (launchLbpConfig.startTime >= launchLbpConfig.endTime) {
      handleTxError(new Error("LBP start time must be before end time"));
      return;
    }

    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const allAbis = await import("../abi/allAbis.json");
      const auctionAbi = allAbis.DutchAuction || [];
      const auctionContract = new ethers.Contract(info.auction, auctionAbi, provider);

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
      const lbpStableShareBps = await auctionContract.lbpStableShareBps();
      const BPS_DENOMINATOR = 10000n;
      let stableForLBP = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR;

      if (stableForLBP > ethForTreasury) {
        stableForLBP = ethForTreasury;
      }
      
      const actualStableForLBP = stableForLBP;

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
        console.error("PROBLEM: actualStableForLBP is 0! This will cause 'NoEthReceived' error in PresaleManager.launchLBP()");
      }
      console.log("=============================");

      try {
        console.log("Testing auction.launchLbp() directly...");
        const signer = await provider.getSigner();
        const auctionContractWithSigner = auctionContract.connect(signer);
        try {
          await auctionContractWithSigner.launchLbp.staticCall();
          console.log("auction.launchLbp() would succeed (but we're not the manager)");
        } catch (auctionErr) {
          console.error("auction.launchLbp() would fail:", auctionErr?.reason || auctionErr?.message || auctionErr);
        }
      } catch (testErr) {
        console.warn("Could not test auction.launchLbp() directly:", testErr);
      }

      if (!finalized) {
        handleTxError(new Error("Auction is not finalized. Please finalize the auction first."));
        return;
      }

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

      if (lbpTokenRecipient === ethers.ZeroAddress) {
        handleTxError(new Error("LBP token recipient is not set in auction. This must be set to PresaleManager address during auction initialization."));
        return;
      }

      if (lbpTokenRecipient.toLowerCase() !== address.toLowerCase()) {
        handleTxError(new Error(`LBP token recipient (${lbpTokenRecipient}) is not set to PresaleManager (${address}). Tokens must be sent to PresaleManager.`));
        return;
      }

      if (actualStableForLBP === 0n) {
        const errorMsg = `Cannot launch LBP: stableForLBP is 0, but PresaleManager.launchLBP() requires ETH to be received. ` +
          `This will cause 'NoEthReceived' error. ` +
          `Please ensure lbpStableShareBps > 0 (current: ${lbpStableShareBps.toString()}) and totalRaised > 0 (current: ${ethers.formatEther(totalRaised)} ETH).`;
        console.error("", errorMsg);
        handleTxError(new Error(errorMsg));
        return;
      }

      if (lbpStableRecipient === ethers.ZeroAddress) {
        handleTxError(new Error(`LBP stable recipient is not set but ETH share is required (${ethers.formatEther(actualStableForLBP)} ETH). Please check auction configuration.`));
        return;
      }
      if (lbpStableRecipient.toLowerCase() !== address.toLowerCase()) {
        handleTxError(new Error(`LBP stable recipient (${lbpStableRecipient}) is not set to PresaleManager (${address}). ETH must be sent to PresaleManager.`));
        return;
      }

      if (ethForTreasury === 0n && stableForLBP > 0n) {
        handleTxError(new Error(`No ETH available in treasury for LBP. Required: ${ethers.formatEther(stableForLBP)} ETH, Available: 0 ETH`));
        return;
      }

      try {
        const record = await managerContract.getAuctionRecord(info.auction);
        const recordSaleToken = record.saleToken;

        const saleTokenAddress = await auctionContract.saleToken();
        
        console.log("=== Token Address Check ===");
        console.log("Sale Token Address (from auction):", saleTokenAddress);
        console.log("Sale Token Address (from record):", recordSaleToken);
        console.log("Addresses match:", saleTokenAddress.toLowerCase() === recordSaleToken.toLowerCase());
        console.log("===========================");

        if (saleTokenAddress.toLowerCase() !== recordSaleToken.toLowerCase()) {
          const errorMsg = `Token address mismatch! ` +
            `Auction has: ${saleTokenAddress}, but AuctionRecord has: ${recordSaleToken}. ` +
            `This indicates a configuration error.`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }

        const code = await provider.getCode(saleTokenAddress);
        if (code === "0x" || code === "0x0") {
          const errorMsg = `Token contract does not exist at address ${saleTokenAddress}! ` +
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

        const saleTokenAbi = [
          { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
          { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
          { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
        ];
        const saleTokenContract = new ethers.Contract(saleTokenAddress, saleTokenAbi, provider);

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

        if (auctionTokenBalance < unsoldTokens) {
          const missing = unsoldTokens - auctionTokenBalance;
          const errorMsg = `Auction does not have enough tokens! ` +
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
        
        console.log("Token contract exists and is valid");
        console.log("Token addresses match");
        console.log("Auction has sufficient tokens to transfer unsold tokens");
        console.log("PresaleManager will receive tokens and ETH when auction.launchLbp() is called.");
      } catch (balanceErr) {
        console.error("Error checking token balances:", balanceErr);
        if (balanceErr?.message?.includes("missing revert data") || balanceErr?.code === "CALL_EXCEPTION") {
          try {
            const record = await managerContract.getAuctionRecord(info.auction);
            const recordSaleToken = record.saleToken;
            const code = await provider.getCode(recordSaleToken);
            if (code === "0x" || code === "0x0") {
              const errorMsg = `Token contract does not exist at address ${recordSaleToken}! ` +
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
          
          const errorMsg = `Cannot read token balance. This might mean: ` +
            `1) Token address is invalid or doesn't exist, ` +
            `2) Token contract is not deployed, or ` +
            `3) Token address in AuctionRecord is wrong. ` +
            `\n\nPlease verify the saleToken address is correct. ` +
            `\nFrom your deployment, TestToken should be at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`;
          console.error(errorMsg);
          handleTxError(new Error(errorMsg));
          return;
        }
      }

      console.log("Validating LBP config parameters...");
      console.log("LBP Config:", {
        startTime: launchLbpConfig.startTime,
        endTime: launchLbpConfig.endTime,
        poolStartWeightToken: launchLbpConfig.poolStartWeightToken,
        poolEndWeightToken: launchLbpConfig.poolEndWeightToken,
        poolSwapFee: launchLbpConfig.poolSwapFee,
        vestingStartTime: launchLbpConfig.vestingStartTime,
        vestingCliffDuration: launchLbpConfig.vestingCliffDuration,
        maxContributionPerAddress: launchLbpConfig.maxContributionPerAddress,
        vestingFinalDuration: launchLbpConfig.vestingFinalDuration,
        vestingCliffPercentBP: launchLbpConfig.vestingCliffPercentBP,
      });

      if (info.lbp === ethers.ZeroAddress || !info.lbp) {
        console.log("LBP will be deployed (record.lbp is zero)");
        if (launchLbpConfig.startTime >= launchLbpConfig.endTime) {
          handleTxError(new Error("LBP start time must be before end time"));
          return;
        }
        if (Number(launchLbpConfig.poolStartWeightToken) === 0 || Number(launchLbpConfig.poolEndWeightToken) === 0) {
          handleTxError(new Error("Pool weights must be greater than 0"));
          return;
        }
        if (launchLbpConfig.vestingCliffPercentBP > 10000) {
          handleTxError(new Error("vestingCliffPercentBP must be <= 10000 (100%)"));
          return;
        }
        if (launchLbpConfig.vestingFinalDuration < launchLbpConfig.vestingCliffDuration) {
          handleTxError(new Error("vestingFinalDuration must be >= vestingCliffDuration"));
          return;
        }
        console.log("All LBP deployment parameters are valid");
      } else {
        console.log("LBP already exists:", info.lbp);
      }

      console.log("All pre-checks passed. Ready to launch LBP.");

    } catch (err) {
      console.warn("Could not check auction state:", err);
    }

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

    console.log("Attempting transaction without preCheck to see real error...");
    
    const launchAction = async () => {
      const tx = await managerContract.launchLBP(info.auction, launchLbpConfig);
      await tx.wait();
      if (lbpConfig.maxContributionPerAddress && Number(lbpConfig.maxContributionPerAddress) > 0) {
        try {
          const record = await managerContract.getAuctionRecord(info.auction);
          if (record.lbp && record.lbp !== ethers.ZeroAddress) {
            const allAbis = await import("../abi/allAbis.json");
            const lbpAbi = allAbis.SecureLBP || [];
            const { BrowserProvider } = await import("ethers");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const lbpContract = new ethers.Contract(record.lbp, lbpAbi, signer);
            const maxContributionWei = ethers.parseEther(lbpConfig.maxContributionPerAddress);
            const setMaxTx = await lbpContract.setMaxContributionPerAddress(maxContributionWei);
            await setMaxTx.wait();
            console.log("Max contribution per address set to", lbpConfig.maxContributionPerAddress, "ETH");
          }
        } catch (err) {
          console.warn("Failed to set max contribution per address:", err);
        }
      }
      
      return tx;
    };
    
    runAction("Launch LBP", launchAction, null);
  };

  const handleFinalizeLbp = async () => {
    if (!managerContract || !info?.auction) return;
    
    try {
      const provider = await import("ethers").then(m => m.BrowserProvider ? new m.BrowserProvider(window.ethereum) : null);
      if (!provider) throw new Error("No provider");
      
      const allAbis = await import("../abi/allAbis.json");
      const managerAbi = allAbis.PresaleManager || [];
      const lbpAbi = allAbis.SecureLBP || [];
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      const record = await managerContract.getAuctionRecord(info.auction);
      const recordVestingEscrow = record.vestingEscrow;
      const recordLbp = record.lbp;
      
      console.log("=== Finalize LBP - Pre-check ===");
      console.log("Auction Address:", info.auction);
      console.log("LBP Address (from record):", recordLbp);
      console.log("Vesting Escrow (from record):", recordVestingEscrow);
      console.log("Vesting Escrow (from info):", info.vesting);
      console.log("Record LBP Initialized:", record.lbpInitialized);
      console.log("Record LBP Finalized:", record.lbpFinalized);
      let lbpVestingEscrow = ethers.ZeroAddress;
      let lbpTotalTokensAllocated = 0n;
      let lbpTokenBalance = 0n;
      let lbpFinalized = false;
      
      if (recordLbp && recordLbp !== ethers.ZeroAddress) {
        const lbpContract = new ethers.Contract(recordLbp, lbpAbi, provider);
        [lbpVestingEscrow, lbpTotalTokensAllocated, lbpFinalized] = await Promise.all([
          lbpContract.vestingEscrow().catch(() => ethers.ZeroAddress),
          lbpContract.totalTokensAllocated().catch(() => 0n),
          lbpContract.finalized().catch(() => false),
        ]);
        const tokenAddress = await lbpContract.token().catch(() => ethers.ZeroAddress);
        if (tokenAddress !== ethers.ZeroAddress) {
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
            lbpTokenBalance = await tokenContract.balanceOf(recordLbp).catch(() => 0n);
          }
        }
      }
      
      console.log("LBP State:", {
        lbpAddress: recordLbp,
        lbpVestingEscrow,
        lbpTotalTokensAllocated: lbpTotalTokensAllocated.toString(),
        lbpTokenBalance: lbpTokenBalance.toString(),
        lbpFinalized,
        hasEnoughTokens: lbpTokenBalance >= lbpTotalTokensAllocated,
      });
      let vestingEscrowToUse = recordVestingEscrow;
      if (vestingEscrowToUse === ethers.ZeroAddress || !vestingEscrowToUse) {
        vestingEscrowToUse = info.vesting || ethers.ZeroAddress;
      }
      if (vestingEscrowToUse === ethers.ZeroAddress && lbpVestingEscrow !== ethers.ZeroAddress) {
        vestingEscrowToUse = lbpVestingEscrow;
        console.log("⚠️ Using vesting escrow from LBP:", vestingEscrowToUse);
      }
      if (vestingEscrowToUse === ethers.ZeroAddress) {
        console.log("⚠️ No vesting escrow found. A new one will be created automatically.");
      } else {
        try {
          const escrowContract = new ethers.Contract(vestingEscrowToUse, escrowAbi, provider);
          const [escrowToken, escrowLBP] = await Promise.all([
            escrowContract.token().catch(() => ethers.ZeroAddress),
            escrowContract.secureLBP().catch(() => ethers.ZeroAddress),
          ]);
          
          console.log("Vesting Escrow Verification:", {
            escrowAddress: vestingEscrowToUse,
            escrowToken,
            escrowLBP,
            matchesRecordLBP: escrowLBP.toLowerCase() === recordLbp.toLowerCase(),
          });
          
          if (escrowLBP.toLowerCase() !== recordLbp.toLowerCase()) {
            console.warn("⚠️ WARNING: Vesting escrow is linked to a different LBP!", {
              escrowLBP,
              recordLbp,
            });
          }
        } catch (err) {
          console.warn("Could not verify vesting escrow:", err);
        }
      }
      
      console.log("=== Final Vesting Escrow Selection ===");
      console.log("Vesting Escrow to use:", vestingEscrowToUse);
      console.log("=====================================");
      await runAction(
        "Finalize LBP",
        () => managerContract.finalizeLbp(info.auction, vestingEscrowToUse !== ethers.ZeroAddress ? vestingEscrowToUse : ethers.ZeroAddress),
        null
      );
      
      // Refresh info and LBP state after successful finalize
      await refreshInfo();
      
      // Refresh LBP state after successful finalize
      if (info.lbp && info.lbp !== ethers.ZeroAddress) {
        try {
          const allAbis = await import("../abi/allAbis.json");
          const { ensureProvider } = await import("../services/web3/provider");
          const provider = ensureProvider();
          const lbpAbi = allAbis.SecureLBP || [];
          if (lbpAbi.length > 0) {
            const { Contract } = await import("ethers");
            const lbpContract = new Contract(info.lbp, lbpAbi, provider);
            const [finalized, endTime, ethBalance, tokenAddress, uniswapLiquidityCreated] = await Promise.all([
              lbpContract.finalized().catch(() => false),
              lbpContract.endTime().catch(() => null),
              provider.getBalance(info.lbp).catch(() => 0n),
              lbpContract.token().catch(() => ethers.ZeroAddress),
              lbpContract.uniswapLiquidityCreated().catch(() => false)
            ]);

            let tokenBalance = 0n;
            if (tokenAddress !== ethers.ZeroAddress) {
              const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
              if (tokenAbi.length > 0) {
                const tokenContract = new Contract(tokenAddress, tokenAbi, provider);
                tokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
              }
            }

            // Check LP balance in pool
            let lpBalance = 0n;
            let poolAddress = null;
            try {
              const poolInit = await lbpContract.poolInitialized().catch(() => false);
              if (poolInit) {
                poolAddress = await lbpContract.pool().catch(() => ethers.ZeroAddress);
                if (poolAddress !== ethers.ZeroAddress) {
                  const poolAbi = allAbis.LBPWeightedAMM || [];
                  if (poolAbi.length > 0) {
                    const poolContract = new Contract(poolAddress, poolAbi, provider);
                    lpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
                  }
                }
              }
            } catch (lpErr) {
              console.warn("Failed to check LP balance after finalize:", lpErr);
            }

            setLbpState({
              finalized,
              endTime: endTime ? Number(endTime) : null,
              ethBalance,
              tokenBalance,
              uniswapLiquidityCreated,
              lpBalance,
              poolAddress,
              loading: false
            });
          }
        } catch (refreshErr) {
          console.warn("Failed to refresh LBP state after finalize:", refreshErr);
        }
      }
      
      if (vestingEscrowToUse && vestingEscrowToUse !== ethers.ZeroAddress) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for block confirmation
          const escrowContract = new ethers.Contract(vestingEscrowToUse, escrowAbi, provider);
          const tokenAddress = await escrowContract.token().catch(() => ethers.ZeroAddress);
          if (tokenAddress !== ethers.ZeroAddress) {
            const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
            if (tokenAbi.length > 0) {
              const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
              const escrowBalance = await tokenContract.balanceOf(vestingEscrowToUse).catch(() => 0n);
              console.log("=== Post-Finalize Verification ===");
              console.log("Vesting Escrow Balance:", ethers.formatEther(escrowBalance));
              console.log("Expected Tokens:", ethers.formatEther(lbpTotalTokensAllocated));
              console.log("Tokens transferred:", escrowBalance >= lbpTotalTokensAllocated ? "✓ Yes" : "✗ No");
              console.log("==================================");
              
              if (escrowBalance < lbpTotalTokensAllocated) {
                console.warn("⚠️ WARNING: Not all tokens were transferred to vesting escrow!");
                const shortfall = lbpTotalTokensAllocated - escrowBalance;
                console.warn("Missing tokens:", ethers.formatEther(shortfall));
              } else {
                console.log("✓ Tokens successfully transferred to vesting escrow!");
              }
            }
          }
        } catch (verifyErr) {
          console.warn("Could not verify token transfer:", verifyErr);
        }
      }
    } catch (err) {
      console.error("Error in handleFinalizeLbp:", err);
      handleTxError(err, "Failed to finalize LBP");
    }
  };

  const handleUnwind = async () => {
    if (!managerContract || !info?.auction || !info?.lbp) {
      handleTxError(new Error("LBP not initialized. Please launch LBP first."));
      return;
    }

    try {
      const { BrowserProvider } = await import("ethers");
      if (!window.ethereum) {
        throw new Error("No wallet provider");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const allAbis = await import("../abi/allAbis.json");
      const lbpAbi = allAbis.SecureLBP || [];
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      const auctionAbi = allAbis.DutchAuction || [];
      const lbpCode = await provider.getCode(info.lbp);
      if (!lbpCode || lbpCode === "0x" || lbpCode === "0x0") {
        throw new Error(`LBP contract does not exist at address ${info.lbp}. Please verify the LBP address is correct.`);
      }
      const lbpContract = new ethers.Contract(info.lbp, lbpAbi, provider); // Read-only for checks
      const managerAbi = allAbis.PresaleManager || [];
      const managerContractWithSigner = new ethers.Contract(address, managerAbi, signer);
      const userAddress = await signer.getAddress();
      const managerOwner = await managerContract.owner().catch(() => ethers.ZeroAddress);
      
      if (userAddress.toLowerCase() !== managerOwner.toLowerCase()) {
        throw new Error(`You are not the owner of this presale. Presale owner: ${managerOwner}, Your address: ${userAddress}. Please connect the wallet that created this presale.`);
      }
      const endTime = await lbpContract.endTime().catch(() => null);
      if (endTime) {
        const currentBlock = await provider.getBlock("latest");
        const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
        if (currentTime <= endTime) {
          const timeRemaining = Number(endTime) - currentTime;
          const hours = Math.floor(timeRemaining / 3600);
          const minutes = Math.floor((timeRemaining % 3600) / 60);
          throw new Error(`LBP has not ended yet. Time remaining: ${hours}h ${minutes}m. Unwind can only be performed after LBP ends.`);
        }
      }
      const record = await managerContract.getAuctionRecord(info.auction);
      const recordLbp = record.lbp;
      
      if (recordLbp !== info.lbp) {
        throw new Error(`LBP address mismatch: record has ${recordLbp}, but info has ${info.lbp}`);
      }

      setTxStatus({ status: "pending", message: "Checking LBP state..." });
      const poolInitialized = await lbpContract.poolInitialized().catch(() => false);
      if (!poolInitialized) {
        throw new Error("LBP pool is not initialized. Please launch LBP first.");
      }
      
      const finalized = await lbpContract.finalized().catch(() => false);
      
      if (!finalized) {
        setTxStatus({ status: "pending", message: "Finalizing LBP…" });
        let vestingEscrowToUse = record.vestingEscrow;
        if (!vestingEscrowToUse || vestingEscrowToUse === ethers.ZeroAddress) {
          vestingEscrowToUse = info.vesting || ethers.ZeroAddress;
        }
        if (!vestingEscrowToUse || vestingEscrowToUse === ethers.ZeroAddress) {
          const lbpVestingEscrow = await lbpContract.vestingEscrow().catch(() => ethers.ZeroAddress);
          if (lbpVestingEscrow !== ethers.ZeroAddress) {
            vestingEscrowToUse = lbpVestingEscrow;
          }
        }
        
        if (!vestingEscrowToUse || vestingEscrowToUse === ethers.ZeroAddress) {
          throw new Error("Vesting escrow is required for finalization. Please finalize LBP first using 'Finalize LBP' button.");
        }
        try {
          await managerContractWithSigner.finalizeLbp.staticCall(info.auction, vestingEscrowToUse);
        } catch (preCheckErr) {
          if (!preCheckErr?.message?.includes("missing revert data") && !preCheckErr?.code?.includes("CALL_EXCEPTION")) {
            let preCheckMsg = "Cannot finalize LBP. ";
            if (preCheckErr?.message?.includes("NotEnded") || preCheckErr?.message?.includes("AuctionActive")) {
              preCheckMsg += "LBP has not ended yet.";
            } else if (preCheckErr?.message?.includes("AlreadyFinalized")) {
              preCheckMsg += "LBP is already finalized.";
            } else if (preCheckErr?.message?.includes("InsufficientTokens")) {
              preCheckMsg += "Insufficient tokens in pool.";
            } else {
              preCheckMsg += `Reason: ${preCheckErr?.message || "Unknown error"}`;
            }
            throw new Error(preCheckMsg);
          }
        }
        
        showTxInfo("Please confirm finalization in your wallet", { autoClose: false });
        const finalizeTx = await managerContractWithSigner.finalizeLbp(info.auction, vestingEscrowToUse);
        showTxInfo("Finalization submitted to the network", { autoClose: 3000 });
        setTxStatus({ status: "pending", message: "Finalizing LBP…", hash: finalizeTx.hash });
        await finalizeTx.wait();
        showTxSuccess("LBP finalized successfully!", { autoClose: 2000 });
      } else {
        showTxInfo("LBP already finalized, proceeding to unwind...", { autoClose: 2000 });
      }

      setTxStatus({ status: "pending", message: "Checking liquidity state…" });
      
      const [finalizedState, endTimeState, poolInitializedState, poolAddressState] = await Promise.all([
        lbpContract.finalized().catch(() => false),
        lbpContract.endTime().catch(() => null),
        lbpContract.poolInitialized().catch(() => false),
        lbpContract.pool().catch(() => ethers.ZeroAddress)
      ]);
      
      const currentBlock = await provider.getBlock("latest");
      const currentTime = currentBlock?.timestamp || Math.floor(Date.now() / 1000);
      let lpBalanceState = 0n;
      if (poolAddressState !== ethers.ZeroAddress) {
        try {
          const poolAbi = allAbis.LBPWeightedAMM || [];
          if (poolAbi.length > 0) {
            const poolContract = new ethers.Contract(poolAddressState, poolAbi, provider);
            lpBalanceState = await poolContract.balanceLP(info.lbp).catch(() => 0n);
          }
        } catch (err) {
        }
      }
      if (!finalizedState) {
        throw new Error("LBP is not finalized. Please use 'Finalize LBP' button first.");
      }
      
      if (endTimeState && currentTime <= Number(endTimeState)) {
        const timeRemaining = Number(endTimeState) - currentTime;
        const hours = Math.floor(timeRemaining / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);
        throw new Error(`LBP has not ended yet. Time remaining: ${hours}h ${minutes}m. Unwind can only be performed after LBP ends.`);
      }
      
      if (!poolInitializedState) {
        throw new Error("LBP pool is not initialized. Cannot unwind liquidity.");
      }
      if (lpBalanceState === 0n && poolAddressState !== ethers.ZeroAddress) {
        showTxInfo("No liquidity to unwind, proceeding to withdrawals...", { autoClose: 2000 });
      } else {
        try {
          const poolAddress = poolAddressState;
          if (poolAddress !== ethers.ZeroAddress) {
          const poolAbi = allAbis.LBPWeightedAMM || [];
          if (poolAbi.length > 0) {
            const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);
            const lpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
            
            if (lpBalance === 0n) {
              showTxInfo("No liquidity to unwind, proceeding...", { autoClose: 2000 });
            } else {
              setTxStatus({ status: "pending", message: "Unwinding liquidity…" });
              showTxInfo("Please confirm liquidity unwinding in your wallet", { autoClose: false });
              
              try {
                const unwindTx = await managerContractWithSigner.unwindLbpAll(info.auction, {
                  gasLimit: 500000 // Set explicit gas limit
                });
                showTxInfo("Unwind submitted to the network", { autoClose: 3000 });
                setTxStatus({ status: "pending", message: "Unwinding liquidity…", hash: unwindTx.hash });
                await unwindTx.wait();
                showTxSuccess("Liquidity unwound successfully!", { autoClose: 2000 });
              } catch (unwindTxErr) {
                if (unwindTxErr?.code === "ACTION_REJECTED" ||
                    unwindTxErr?.reason === "rejected" ||
                    unwindTxErr?.message?.includes("user rejected") ||
                    unwindTxErr?.message?.includes("user cancel")) {
                  showTxInfo("Transaction cancelled by user", { autoClose: 3000 });
                  setTxStatus({ status: "error", message: "Transaction cancelled" });
                  return; // Stop execution if user cancelled
                }
                const isNoLPTokens = unwindTxErr?.message?.includes("NoLPTokens") ||
                    unwindTxErr?.message?.includes("No LP tokens") ||
                    unwindTxErr?.reason?.includes("NoLPTokens");
                
                const isEstimateGasError = unwindTxErr?.code === "CALL_EXCEPTION" && 
                    (unwindTxErr?.action === "estimateGas" || unwindTxErr?.message?.includes("estimateGas"));
                
                if (isNoLPTokens || isEstimateGasError) {
                  const recheckLpBalance = await poolContract.balanceLP(info.lbp).catch(() => 0n);
                  
                  if (recheckLpBalance === 0n) {
                    showTxInfo("Liquidity already unwound, proceeding...", { autoClose: 2000 });
                  } else {
                    throw new Error(`Failed to unwind liquidity. LP balance: ${ethers.formatEther(recheckLpBalance)}. Error: ${unwindTxErr?.message || unwindTxErr?.reason || "Unknown"}`);
                  }
                } else {
                  let unwindMsg = "Failed to unwind liquidity. ";
                  if (unwindTxErr?.message?.includes("NotFinalized") || unwindTxErr?.reason?.includes("NotFinalized")) {
                    unwindMsg += "LBP must be finalized first. Please use 'Finalize LBP' button first.";
                  } else if (unwindTxErr?.message?.includes("AuctionActive") || 
                            unwindTxErr?.message?.includes("NotEnded") ||
                            unwindTxErr?.reason?.includes("AuctionActive")) {
                    unwindMsg += "LBP must have ended first. Wait for LBP end time.";
                  } else if (unwindTxErr?.message?.includes("Ownable: caller is not the owner") ||
                            unwindTxErr?.message?.includes("not the owner")) {
                    unwindMsg += "You are not the owner of this LBP contract. Please connect the owner wallet.";
                  } else {
                    unwindMsg += `Reason: ${unwindTxErr?.message || unwindTxErr?.reason || "Unknown error"}`;
                  }
                  throw new Error(unwindMsg);
                }
              }
            }
          } else {
            setTxStatus({ status: "pending", message: "Unwinding liquidity…" });
            showTxInfo("Please confirm liquidity unwinding in your wallet", { autoClose: false });
            
            try {
              const unwindTx = await managerContractWithSigner.unwindLbpAll(info.auction);
              showTxInfo("Unwind submitted to the network", { autoClose: 3000 });
              setTxStatus({ status: "pending", message: "Unwinding liquidity…", hash: unwindTx.hash });
              await unwindTx.wait();
              showTxSuccess("Liquidity unwound successfully!", { autoClose: 2000 });
            } catch (unwindTxErr) {
              if (unwindTxErr?.message?.includes("NoLPTokens") ||
                  unwindTxErr?.message?.includes("No LP tokens") ||
                  unwindTxErr?.reason?.includes("NoLPTokens")) {
                showTxInfo("Liquidity already unwound, proceeding...", { autoClose: 2000 });
              } else {
                throw unwindTxErr;
              }
            }
          }
        } else {
          showTxInfo("No pool found, liquidity may already be unwound, proceeding...", { autoClose: 2000 });
        }
        } catch (unwindErr) {
          if (unwindErr?.message?.includes("NoLPTokens") ||
              unwindErr?.message?.includes("No LP tokens") ||
              unwindErr?.reason?.includes("NoLPTokens")) {
            showTxInfo("Liquidity already unwound, proceeding...", { autoClose: 2000 });
          } else {
            throw unwindErr;
          }
        }
      }

      setTxStatus({ status: "pending", message: "Withdrawing ETH…" });
      const ethBalance = await provider.getBalance(info.lbp);
      
      if (ethBalance > 0n) {
        showTxInfo("Please confirm ETH withdrawal in your wallet", { autoClose: false });
        const withdrawEthTx = await managerContractWithSigner.withdrawLbpEth(info.auction, ethBalance);
        showTxInfo("ETH withdrawal submitted to the network", { autoClose: 3000 });
        setTxStatus({ status: "pending", message: "Withdrawing ETH…", hash: withdrawEthTx.hash });
        await withdrawEthTx.wait();
        showTxSuccess(`Withdrew ${ethers.formatEther(ethBalance)} ETH successfully!`, { autoClose: 2000 });
      } else {
        showTxInfo("No ETH to withdraw, proceeding...", { autoClose: 2000 });
      }

      setTxStatus({ status: "pending", message: "Withdrawing tokens…" });
      const tokenAddress = await lbpContract.token().catch(() => ethers.ZeroAddress);
      
      if (tokenAddress !== ethers.ZeroAddress) {
        const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
        if (tokenAbi.length > 0) {
          const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
          const tokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
          
          if (tokenBalance > 0n) {
            showTxInfo("Please confirm token withdrawal in your wallet", { autoClose: false });
            const withdrawTokensTx = await managerContractWithSigner.withdrawLbpAllTokens(info.auction);
            showTxInfo("Token withdrawal submitted to the network", { autoClose: 3000 });
            setTxStatus({ status: "pending", message: "Withdrawing tokens…", hash: withdrawTokensTx.hash });
            await withdrawTokensTx.wait();
            showTxSuccess(`Withdrew ${ethers.formatEther(tokenBalance)} tokens successfully!`, { autoClose: 2000 });
          } else {
            showTxInfo("No tokens to withdraw, proceeding...", { autoClose: 2000 });
          }
        }
      }

      setTxStatus({ status: "success", message: "Unwind & Withdraw All completed!" });
      showTxSuccess("All funds withdrawn to treasury successfully!", { autoClose: 5000 });
      await refreshInfo();
      
    } catch (err) {
      console.error("Error in handleUnwind:", err);
      if (err?.code === "ACTION_REJECTED" ||
          err?.reason === "rejected" ||
          err?.message?.includes("user rejected") ||
          err?.message?.includes("user cancel") ||
          err?.message?.includes("Transaction cancelled")) {
        return;
      }
      
      let errorMessage = err?.message || "Failed to unwind LBP and withdraw funds";
      
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      if (errorMessage.includes("missing revert data") || errorMessage.includes("CALL_EXCEPTION")) {
        if (err?.transaction?.to?.toLowerCase() === info.lbp?.toLowerCase()) {
          errorMessage = "Transaction failed on LBP contract. Possible reasons:\n" +
            "1. LBP has not ended yet (check endTime)\n" +
            "2. LBP is not finalized (use 'Finalize LBP' first)\n" +
            "3. Pool is not initialized\n" +
            "4. Insufficient tokens/ETH in contract\n" +
            "Please check the LBP state and try again.";
        } else {
          errorMessage = "Transaction failed. The contract may have reverted. Check:\n" +
            "1. All prerequisites are met (LBP ended, finalized, etc.)\n" +
            "2. Contract state is correct\n" +
            "3. You have sufficient gas";
        }
      } else if (errorMessage.includes("NotFinalized")) {
        errorMessage = "LBP must be finalized before unwinding. Please finalize LBP first.";
      } else if (errorMessage.includes("AuctionActive") || errorMessage.includes("NotEnded")) {
        errorMessage = "LBP must have ended (block.timestamp > endTime) before unwinding.";
      } else if (errorMessage.includes("NoLPTokens") || errorMessage.includes("No LP tokens")) {
        errorMessage = "No liquidity to unwind. Liquidity may have already been unwound.";
      } else if (errorMessage.includes("InsufficientBalance") || errorMessage.includes("InsufficientTokens")) {
        errorMessage = "Insufficient balance to withdraw. Funds may have already been withdrawn.";
      } else if (errorMessage.includes("PoolNotInitialized") || errorMessage.includes("pool is not initialized")) {
        errorMessage = "LBP pool is not initialized. Please launch LBP first.";
      }
      
      handleTxError(err, errorMessage);
      setTxStatus({ status: "error", message: errorMessage });
    }
  };

  const heroStats = info
    ? [
        { label: "Owner", value: info.owner || "—" },
        { label: "Auction", value: info.auction || "Pending" },
        { label: "LBP", value: info.lbp || "Not initialized" },
        { label: "Vesting escrow", value: info.vesting || "Not created" },
      ]
    : [];

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[radial-gradient(circle_at_15%_-5%,rgba(99,102,241,0.3),transparent_45%),radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.25),transparent_50%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.2),transparent_60%),linear-gradient(135deg,rgba(2,6,23,0.95),rgba(15,23,42,0.9))] p-10 shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset,0_1px_0_rgba(255,255,255,0.1)_inset] backdrop-blur-[20px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_70px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_0_rgba(255,255,255,0.15)_inset] before:absolute before:inset-0 before:pointer-events-none before:bg-[linear-gradient(135deg,rgba(99,102,241,0.1),transparent_60%),linear-gradient(225deg,rgba(16,185,129,0.08),transparent_70%)] before:opacity-60 after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.03),transparent_50%)] md:p-8 sm:p-6">
        <div className="relative z-10 mb-2 flex flex-col gap-6">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-white/65 before:content-['⚡'] before:text-base before:opacity-80">Presale manager</p>
            <h1 className="m-0 bg-gradient-to-br from-white to-white/85 bg-clip-text text-4xl font-bold leading-tight tracking-[-0.02em] text-transparent break-all sm:text-3xl sm:text-2xl">{address}</h1>
          </div>
          {info?.auction && (
            <Link 
              to={`/presale/${address}/auction`} 
              className="inline-flex w-1/5 items-center gap-2 whitespace-nowrap rounded-2xl border-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-green-400 px-7 py-3 text-sm font-semibold text-white no-underline shadow-[0_8px_20px_rgba(99,102,241,0.3),0_0_0_1px_rgba(255,255,255,0.1)_inset] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_12px_30px_rgba(99,102,241,0.4),0_0_0_1px_rgba(255,255,255,0.15)_inset] active:translate-y-0 active:scale-100 after:content-['→'] after:text-lg after:transition-transform after:duration-300 hover:after:translate-x-1"
            >
              Open auction view
            </Link>
          )}
        </div>
        {info && (
          <div className="relative z-10 mt-8 grid grid-cols-1 gap-5 border-t border-white/8 pt-8 sm:mt-6 sm:gap-4 sm:pt-6 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {heroStats.map((stat) => (
              <div 
                key={stat.label} 
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/70 to-slate-800/50 p-5 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[10px] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-gradient-to-br hover:from-slate-900/85 hover:to-slate-800/65 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-indigo-500/60 before:via-green-500/60 before:to-indigo-500/60 before:bg-[length:200%_100%] before:animate-shimmer sm:p-4"
              >
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/65">{stat.label}</span>
                <strong className="mt-1 block font-mono text-[0.95rem] font-medium leading-snug text-white break-all">{stat.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {txStatus && (
        <div className={`flex items-center justify-between gap-4 rounded-2xl border px-6 py-4 text-base font-medium backdrop-blur-[10px] shadow-[0_4px_12px] animate-slideIn sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-4 ${
          txStatus.status === "success" 
            ? "border-green-500/50 bg-green-500/15 text-green-100 shadow-green-500/20" 
            : txStatus.status === "error"
            ? "border-red-500/50 bg-red-500/12 text-red-100 shadow-red-500/15"
            : "border-blue-500/40 bg-blue-500/12 text-blue-100 shadow-blue-500/15"
        }`}>
          <span>{txStatus.message}</span>
          {txStatus.hash && (
            <span className={`font-mono text-sm rounded-lg border px-3 py-1.5 ${
              txStatus.status === "success"
                ? "border-green-500/30 bg-green-500/15 text-green-500/95"
                : txStatus.status === "error"
                ? "border-red-500/30 bg-red-500/15 text-red-500/95"
                : "border-yellow-500/20 bg-yellow-500/10 text-yellow-500/95"
            }`}>
              {shortenHash(txStatus.hash)}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 text-center text-lg text-white/70 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">Loading…</div>
      ) : error ? (
        <div className="rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-900/20 to-red-800/15 p-8 text-red-100 shadow-[0_20px_50px_rgba(239,68,68,0.15),0_0_0_1px_rgba(239,68,68,0.2)_inset] sm:p-6 sm:p-5">{error}</div>
      ) : (
        <>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
            <AuctionControls
              isOwner={isOwner}
              auctionAddress={info?.auction}
              onFinalizeAuction={handleFinalizeAuction}
              onLaunchLbp={handleLaunchLbp}
              onFinalizeLbp={handleFinalizeLbp}
              onUnwind={handleUnwind}
              onAccelerateAuction={handleAccelerateAuction}
              lbpConfig={lbpConfig}
              onLbpConfigChange={handleLbpConfigChange}
              disabled={!info?.auction}
              auctionData={auctionData}
              currentTime={currentTime}
            />
          </div>

          {/* Post-LBP Settlement Panel (Owner Only, After Finalization) */}
          {isOwner && info?.lbp && info.lbp !== ethers.ZeroAddress && lbpState.finalized && (
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Post-LBP Settlement</h2>
                <button
                  onClick={() => setIsSettlementPanelExpanded(!isSettlementPanelExpanded)}
                  className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10 transition-colors flex items-center gap-2"
                  title={isSettlementPanelExpanded ? "Collapse panel" : "Expand panel"}
                >
                  <span className="text-lg">{isSettlementPanelExpanded ? "▼" : "▶"}</span>
                  <span>{isSettlementPanelExpanded ? "Collapse" : "Expand"}</span>
                </button>
              </div>
              
              {isSettlementPanelExpanded && (
              <>
              {(() => {
                const isFinalized = lbpState.finalized;
                const hasEnded = lbpState.endTime ? currentTime > lbpState.endTime : true;
                // Panel is only shown if finalized, so content should always be visible
                const shouldShowContent = true;
                
                if (!shouldShowContent) {
                  console.log("Post-LBP Settlement panel conditions:", {
                    isOwner,
                    hasLbp: !!info?.lbp,
                    lbpAddress: info?.lbp,
                    finalized: isFinalized,
                    endTime: lbpState.endTime,
                    currentTime,
                    hasEnded,
                    shouldShowContent
                  });
                }
                
                return !shouldShowContent ? (
                <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-yellow-100">
                  <p className="m-0 text-base font-medium">
                    {!lbpState.finalized 
                      ? "Finalize LBP to unlock post-sale actions"
                      : `LBP has not ended yet. End time: ${lbpState.endTime ? new Date(lbpState.endTime * 1000).toLocaleString() : "N/A"}, Current time: ${new Date(currentTime * 1000).toLocaleString()}`
                    }
                  </p>
                  {lbpState.loading && (
                    <p className="mt-2 text-sm text-yellow-200/70">Loading LBP state...</p>
                  )}
                </div>
                ) : (
                <>
                  {/* 1. Read-Only Status Section */}
                  <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
                    <h3 className="mb-4 text-lg font-semibold text-white">Status</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <span className="text-sm text-white/70">SecureLBP ETH Balance:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {ethers.formatEther(lbpState.ethBalance ?? 0n)} ETH
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">SecureLBP Token Balance:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {ethers.formatEther(lbpState.tokenBalance ?? 0n)} tokens
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Finalized:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {lbpState.finalized ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">End Time:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {lbpState.endTime ? new Date(lbpState.endTime * 1000).toLocaleString() : "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Current Time:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {new Date(currentTime * 1000).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Uniswap Migration:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {lbpState.uniswapLiquidityCreated ? "Completed" : "Not started"}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">LP Balance in Pool:</span>
                        <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                          {ethers.formatEther(lbpState.lpBalance ?? 0n)} LP tokens
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Unwind Liquidity Section */}
                  {(lbpState.lpBalance ?? 0n) > 0n && (
                    <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-6">
                      <h3 className="mb-3 text-lg font-semibold text-white">Unwind Liquidity</h3>
                      <p className="mb-4 text-sm text-white/70">
                        You have {ethers.formatEther(lbpState.lpBalance ?? 0n)} LP tokens in the LBP pool. 
                        Unwind them first to retrieve ETH and tokens before migration or withdrawal.
                      </p>
                      <button
                        onClick={handleUnwindLiquidity}
                        disabled={unwindingLiquidity || settlementExecuting}
                        className="w-full rounded-xl border-0 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100"
                      >
                        {unwindingLiquidity ? "Unwinding Liquidity…" : "Unwind Liquidity from Pool"}
                      </button>
                    </div>
                  )}

                  {/* 2. Split Configuration Section */}
                  <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
                    <h3 className="mb-4 text-lg font-semibold text-white">Asset Split</h3>
                    
                    {/* ETH Split */}
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-white/90">
                        ETH to Uniswap
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={settlementForm.ethToUniswap}
                          onChange={(e) => handleSettlementFormChange("ethToUniswap", e.target.value)}
                          placeholder="0.0"
                          disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                          className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 pr-24 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetPercentage("eth", 25)}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            25%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage("eth", 50)}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            50%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage("eth", 75)}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            75%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetMax("eth")}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-semibold text-white hover:text-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 rounded border border-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-white/60">
                        ETH to Treasury: {ethers.formatEther(
                          (lbpState.ethBalance ?? 0n) - (settlementForm.ethToUniswap ? ethers.parseEther(settlementForm.ethToUniswap) : 0n)
                        )} ETH
                      </p>
                    </div>

                    {/* Token Split */}
                    <div>
                      <label className="mb-2 block text-sm font-medium text-white/90">
                        Tokens to Uniswap
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={settlementForm.tokensToUniswap}
                          onChange={(e) => handleSettlementFormChange("tokensToUniswap", e.target.value)}
                          placeholder="0.0"
                          disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                          className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 pr-24 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetPercentage("tokens", 25)}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            25%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage("tokens", 50)}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            50%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage("tokens", 75)}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            75%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetMax("tokens")}
                            disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                            className="px-2 py-1 text-xs font-semibold text-white hover:text-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 rounded border border-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-white/60">
                        Tokens to Treasury: {ethers.formatEther(
                          (lbpState.tokenBalance ?? 0n) - (settlementForm.tokensToUniswap ? ethers.parseEther(settlementForm.tokensToUniswap) : 0n)
                        )} tokens
                      </p>
                      {((settlementForm.ethToUniswap && parseFloat(settlementForm.ethToUniswap) > 0 && (!settlementForm.tokensToUniswap || parseFloat(settlementForm.tokensToUniswap) === 0)) ||
                        (settlementForm.tokensToUniswap && parseFloat(settlementForm.tokensToUniswap) > 0 && (!settlementForm.ethToUniswap || parseFloat(settlementForm.ethToUniswap) === 0))) && (
                        <p className="mt-2 text-sm text-yellow-400">
                          ⚠️ Uniswap V3 migration requires both ETH and tokens. Enter both amounts to migrate, or leave both empty to withdraw everything to treasury.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Uniswap V3 Configuration Section */}
                  {(() => {
                    // Check if Uniswap V3 needs to be configured
                    const needsUniswapConfig = settlementForm.ethToUniswap && settlementForm.tokensToUniswap &&
                      parseFloat(settlementForm.ethToUniswap) > 0 && parseFloat(settlementForm.tokensToUniswap) > 0 &&
                      !lbpState.uniswapLiquidityCreated;
                    
                    if (!needsUniswapConfig) return null;

                    return (
                      <div className="mb-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
                        <h3 className="mb-4 text-lg font-semibold text-white">Uniswap V3 Configuration</h3>
                        <p className="mb-4 text-sm text-white/70">
                          Before migrating to Uniswap V3, you need to configure the Uniswap V3 contract addresses. 
                          For localhost, you may need to deploy Uniswap V3 contracts or use mock addresses.
                        </p>
                        
                        <div className="mb-4">
                          <label className="mb-2 block text-sm font-medium text-white/90">
                            Uniswap V3 Factory Address
                          </label>
                          <input
                            type="text"
                            value={settlementForm.uniswapFactory}
                            onChange={(e) => handleSettlementFormChange("uniswapFactory", e.target.value)}
                            placeholder="0x..."
                            disabled={uniswapConfiguring || settlementExecuting}
                            className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                          />
                        </div>

                        <div className="mb-4">
                          <label className="mb-2 block text-sm font-medium text-white/90">
                            Uniswap V3 Position Manager Address
                          </label>
                          <input
                            type="text"
                            value={settlementForm.uniswapPositionManager}
                            onChange={(e) => handleSettlementFormChange("uniswapPositionManager", e.target.value)}
                            placeholder="0x..."
                            disabled={uniswapConfiguring || settlementExecuting}
                            className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                          />
                        </div>

                        <div className="mb-4">
                          <label className="mb-2 block text-sm font-medium text-white/90">
                            WETH9 Address
                          </label>
                          <input
                            type="text"
                            value={settlementForm.weth}
                            onChange={(e) => handleSettlementFormChange("weth", e.target.value)}
                            placeholder="0x..."
                            disabled={uniswapConfiguring || settlementExecuting}
                            className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                          />
                        </div>

                        <button
                          onClick={handleConfigureUniswapV3}
                          disabled={uniswapConfiguring || settlementExecuting || !settlementForm.uniswapFactory || !settlementForm.uniswapPositionManager || !settlementForm.weth}
                          className="w-full rounded-xl border-0 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100"
                        >
                          {uniswapConfiguring ? "Configuring…" : "Configure Uniswap V3"}
                        </button>
                      </div>
                    );
                  })()}

                  {/* 3. Uniswap Parameters Section */}
                  {settlementForm.ethToUniswap && settlementForm.tokensToUniswap &&
                   parseFloat(settlementForm.ethToUniswap) > 0 && parseFloat(settlementForm.tokensToUniswap) > 0 &&
                   !lbpState.uniswapLiquidityCreated && (
                    <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
                      <h3 className="mb-4 text-lg font-semibold text-white">Uniswap V3 Parameters</h3>
                      
                      <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium text-white/90">
                          <Tooltip text="Fee Tier: The trading fee percentage for this Uniswap V3 pool. Lower fees (0.05%) are better for stable pairs, higher fees (1%) for volatile pairs. 0.3% is the most common choice for most tokens.">
                            Fee Tier
                          </Tooltip>
                        </label>
                        <select
                          value={settlementForm.feeTier}
                          onChange={(e) => handleSettlementFormChange("feeTier", e.target.value)}
                          disabled={settlementExecuting}
                          className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        >
                          <option value="500">0.05% (500) - Best for stable pairs</option>
                          <option value="3000">0.3% (3000) - Recommended for most tokens</option>
                          <option value="10000">1% (10000) - Best for volatile pairs</option>
                        </select>
                      </div>

                      <div className="mb-4">
                        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-white/90">
                          <input
                            type="checkbox"
                            checked={settlementForm.useFullRange}
                            onChange={(e) => handleSettlementFormChange("useFullRange", e.target.checked)}
                            disabled={settlementExecuting}
                            className="rounded"
                          />
                          <Tooltip text="Use Full Range: When checked, liquidity covers the entire price range (-887272 to 887272 ticks). This is recommended for most cases as it ensures your liquidity is always active regardless of price movement. Uncheck only if you want to concentrate liquidity in a specific price range.">
                            Use Full Range (Recommended)
                          </Tooltip>
                        </label>
                      </div>

                      {!settlementForm.useFullRange && (
                        <div className="mb-4 grid grid-cols-2 gap-4">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-white/90">
                              <Tooltip text="Tick Lower: The lower bound of the price range for your liquidity position. Ticks are discrete price points in Uniswap V3. Lower tick = lower price bound. Must be less than Tick Upper. Full range is -887272.">
                                Tick Lower
                              </Tooltip>
                            </label>
                            <input
                              type="number"
                              value={settlementForm.tickLower}
                              onChange={(e) => handleSettlementFormChange("tickLower", e.target.value)}
                              placeholder="-887272"
                              disabled={settlementExecuting}
                              className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-white/90">
                              <Tooltip text="Tick Upper: The upper bound of the price range for your liquidity position. Ticks are discrete price points in Uniswap V3. Upper tick = upper price bound. Must be greater than Tick Lower. Full range is 887272.">
                                Tick Upper
                              </Tooltip>
                            </label>
                            <input
                              type="number"
                              value={settlementForm.tickUpper}
                              onChange={(e) => handleSettlementFormChange("tickUpper", e.target.value)}
                              placeholder="887272"
                              disabled={settlementExecuting}
                              className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                            />
                          </div>
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium text-white/90">
                          <Tooltip text="Initial Price (sqrtPriceX96): The square root of the initial price ratio (token1/token0) multiplied by 2^96, in Q64.96 fixed-point format. This is used ONLY when creating a new pool that doesn't exist yet. If the pool already exists, this value is ignored. Calculate: sqrt(price) * 2^96, where price = amount of token1 per token0. Example: For 1 ETH = 1000 tokens, price = 1000, sqrt(1000) ≈ 31.62, sqrtPriceX96 ≈ 79228162514264337593543950336.">
                            Initial Price (sqrtPriceX96)
                          </Tooltip>
                        </label>
                        <input
                          type="text"
                          value={settlementForm.sqrtPriceX96}
                          onChange={(e) => handleSettlementFormChange("sqrtPriceX96", e.target.value)}
                          placeholder="79228162514264337593543950336"
                          disabled={settlementExecuting}
                          className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        />
                        <p className="mt-1 text-xs text-white/60">
                          Used only if pool does not exist. Format: Q64.96 fixed-point. Leave empty if pool already exists.
                        </p>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-white/90">
                          <Tooltip text="LP Recipient Address: The Ethereum address that will receive the Uniswap V3 LP position NFT (Non-Fungible Token). This NFT represents your liquidity position and can be used to manage, collect fees, or remove liquidity later. Typically, this should be your treasury address or a wallet you control. The NFT will be minted to this address after successful migration.">
                            LP Recipient Address
                          </Tooltip>
                        </label>
                        <input
                          type="text"
                          value={settlementForm.lpRecipient}
                          onChange={(e) => handleSettlementFormChange("lpRecipient", e.target.value)}
                          placeholder="0x..."
                          disabled={settlementExecuting}
                          className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        />
                      </div>
                    </div>
                  )}

                  {/* 4. Action Button */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleExecuteSettlement}
                      disabled={
                        settlementExecuting ||
                        !lbpState.finalized ||
                        (lbpState.endTime && currentTime <= lbpState.endTime) ||
                        (() => {
                          const ethToUniswap = settlementForm.ethToUniswap ? parseFloat(settlementForm.ethToUniswap) : 0;
                          const tokensToUniswap = settlementForm.tokensToUniswap ? parseFloat(settlementForm.tokensToUniswap) : 0;
                          const wantsMigration = ethToUniswap > 0 && tokensToUniswap > 0; // Both must be > 0 for migration
                          
                          if (wantsMigration) {
                            // If migration is wanted, check all required fields
                            return !settlementForm.sqrtPriceX96 || !settlementForm.lpRecipient || lbpState.uniswapLiquidityCreated;
                          }
                          // If no migration, just check if there's something to withdraw
                          const ethToTreasury = parseFloat(ethers.formatEther(lbpState.ethBalance ?? 0n)) - ethToUniswap;
                          const tokensToTreasury = parseFloat(ethers.formatEther(lbpState.tokenBalance ?? 0n)) - tokensToUniswap;
                          return ethToTreasury <= 0 && tokensToTreasury <= 0;
                        })()
                      }
                      className="flex-1 rounded-xl border-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-green-400 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100"
                    >
                      {settlementExecuting 
                        ? (settlementStep || "Executing…")
                        : "Execute Post-LBP Settlement"
                      }
                    </button>
                  </div>

                  {settlementStep && (
                    <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-100">
                      <p className="m-0 text-sm font-medium">{settlementStep}</p>
                    </div>
                  )}

                  {/* Settlement Results */}
                  {settlementResults && (
                    <div className="mt-6 rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 to-green-800/10 p-6 shadow-lg">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-green-400">
                          ✅ Settlement Completed Successfully
                        </h3>
                        <button
                          onClick={() => setSettlementResults(null)}
                          className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
                        >
                          Close
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                            Execution Time
                          </p>
                          <p className="font-mono text-sm text-white">
                            {new Date(settlementResults.timestamp).toLocaleString()}
                          </p>
                        </div>

                        {settlementResults.unwind && (
                          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-lg">🔄</span>
                              <p className="text-sm font-semibold text-blue-300">Liquidity Unwound</p>
                            </div>
                            <div className="space-y-1 text-xs text-blue-100">
                              <p className="font-mono">Tx: {settlementResults.unwind.hash.slice(0, 10)}...{settlementResults.unwind.hash.slice(-8)}</p>
                              <p>Block: {settlementResults.unwind.blockNumber?.toString()}</p>
                            </div>
                          </div>
                        )}

                        {settlementResults.migrate && (
                          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-lg">🚀</span>
                              <p className="text-sm font-semibold text-purple-300">Migrated to Uniswap V3</p>
                            </div>
                            <div className="space-y-2 text-xs text-purple-100">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-white/60">ETH Amount:</p>
                                  <p className="font-mono font-semibold">{settlementResults.migrate.ethAmount} ETH</p>
                                </div>
                                <div>
                                  <p className="text-white/60">Token Amount:</p>
                                  <p className="font-mono font-semibold">{settlementResults.migrate.tokenAmount} tokens</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-white/60">LP Recipient:</p>
                                <p className="font-mono break-all">{settlementResults.migrate.lpRecipient}</p>
                              </div>
                              <div>
                                <p className="text-white/60">Fee Tier:</p>
                                <p className="font-mono">{settlementResults.migrate.feeTier} ({Number(settlementResults.migrate.feeTier) / 10000}%)</p>
                              </div>
                              <p className="font-mono text-white/80">Tx: {settlementResults.migrate.hash.slice(0, 10)}...{settlementResults.migrate.hash.slice(-8)}</p>
                              <p className="text-white/80">Block: {settlementResults.migrate.blockNumber?.toString()}</p>
                            </div>
                          </div>
                        )}

                        {settlementResults.withdrawEth && (
                          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-lg">💰</span>
                              <p className="text-sm font-semibold text-cyan-300">ETH Withdrawn to Treasury</p>
                            </div>
                            <div className="space-y-1 text-xs text-cyan-100">
                              <p className="font-mono font-semibold text-base">{settlementResults.withdrawEth.amount} ETH</p>
                              <p className="font-mono">Tx: {settlementResults.withdrawEth.hash.slice(0, 10)}...{settlementResults.withdrawEth.hash.slice(-8)}</p>
                              <p>Block: {settlementResults.withdrawEth.blockNumber?.toString()}</p>
                            </div>
                          </div>
                        )}

                        {settlementResults.withdrawTokens && (
                          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-lg">🪙</span>
                              <p className="text-sm font-semibold text-yellow-300">Tokens Withdrawn to Treasury</p>
                            </div>
                            <div className="space-y-1 text-xs text-yellow-100">
                              <p className="font-mono font-semibold text-base">{settlementResults.withdrawTokens.amount} tokens</p>
                              <p className="font-mono">Tx: {settlementResults.withdrawTokens.hash.slice(0, 10)}...{settlementResults.withdrawTokens.hash.slice(-8)}</p>
                              <p>Block: {settlementResults.withdrawTokens.blockNumber?.toString()}</p>
                            </div>
                          </div>
                        )}

                        <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
                            Final Balances (SecureLBP)
                          </p>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-white/60">ETH:</p>
                              <p className="font-mono font-semibold text-white">{settlementResults.finalBalances.eth} ETH</p>
                            </div>
                            <div>
                              <p className="text-white/60">Tokens:</p>
                              <p className="font-mono font-semibold text-white">{settlementResults.finalBalances.tokens} tokens</p>
                            </div>
                            <div>
                              <p className="text-white/60">LP:</p>
                              <p className="font-mono font-semibold text-white">{settlementResults.finalBalances.lp} LP</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
                );
              })()}
              </>
              )}
            </div>
          )}

          {/* Early Incentives Management (Owner Only) */}
          {isOwner && auctionContract && info?.auction && (
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
              <BonusMerkleManager
                auctionContract={auctionContract}
                auctionAddress={info.auction}
                auctionData={auctionData}
                onUpdate={async () => {
                  await refetchAuctionData();
                  await refreshInfo();
                }}
              />
            </div>
          )}

          {auctions.length > 0 && (
            <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
              <p className="mb-5 flex items-center gap-2 text-lg font-semibold text-white before:content-['📋'] before:text-xl">Deployed auctions</p>
              <ul className="m-0 flex flex-col gap-3.5 p-0 list-none">
                {auctions.map((auctionAddress) => (
                  <li 
                    key={auctionAddress}
                    className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-4 font-mono text-sm text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:translate-x-1 hover:border-white/12 hover:bg-gradient-to-br hover:from-slate-900/95 hover:to-slate-800/75 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-gradient-to-b before:from-indigo-500/80 before:to-green-500/80 before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100"
                  >
                    {auctionAddress}
                  </li>
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
