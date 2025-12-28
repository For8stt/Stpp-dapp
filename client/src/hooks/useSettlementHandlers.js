import { useCallback } from "react";
import { ethers } from "ethers";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";
import { handleTransactionError, executeTransaction } from "../utils/transactionUtils";

export const useSettlementHandlers = ({
  managerContract,
  info,
  address,
  isOwner,
  lbpState,
  setLbpState,
  settlementForm,
  setSettlementForm,
  setUnwindingLiquidity,
  setUniswapConfiguring,
  setSettlementExecuting,
  setSettlementStep,
  setSettlementResults,
  setTxStatus,
  currentTime,
}) => {
  const handleSettlementFormChange = useCallback((name, value) => {
    setSettlementForm((prev) => ({ ...prev, [name]: value }));
  }, [setSettlementForm]);

  const handleSetMax = useCallback((type) => {
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
  }, [lbpState, handleSettlementFormChange]);

  const handleSetPercentage = useCallback((type, percentage) => {
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
  }, [lbpState, handleSettlementFormChange]);

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

      await executeTransaction({
        txPromise: managerContractWithSigner.unwindLbpAll(info.auction, { gasLimit: 500000 }),
        pendingMessage: "Unwinding liquidity…",
        successMessage: "Liquidity unwound successfully!",
        setTxStatus,
        onSuccess: async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
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

          showTxSuccess(`Unwound liquidity! New balances: ${ethers.formatEther(newEthBalance)} ETH, ${ethers.formatEther(newTokenBalance)} tokens`, { autoClose: 5000 });
        },
      });
    } catch (err) {
      handleTransactionError(err, "Failed to unwind liquidity", setTxStatus);
    } finally {
      setUnwindingLiquidity(false);
    }
  }, [managerContract, info?.auction, info?.lbp, isOwner, lbpState.lpBalance, address, setUnwindingLiquidity, setLbpState, setTxStatus]);

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

      await executeTransaction({
        txPromise: managerContractWithSigner.setLbpUniswapV3Config(
          info.auction,
          settlementForm.uniswapFactory,
          settlementForm.uniswapPositionManager,
          settlementForm.weth,
          parseInt(settlementForm.feeTier)
        ),
        pendingMessage: "Configuring Uniswap V3…",
        successMessage: "Uniswap V3 configured successfully!",
        setTxStatus,
      });
    } catch (err) {
      handleTransactionError(err, "Failed to configure Uniswap V3", setTxStatus);
    } finally {
      setUniswapConfiguring(false);
    }
  }, [managerContract, info?.auction, isOwner, settlementForm, address, setUniswapConfiguring, setTxStatus]);

  const handleExecuteSettlement = useCallback(async () => {
    if (!info?.lbp || !isOwner || !managerContract) {
      handleTxError(new Error("Missing required data"));
      return;
    }

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
      setSettlementResults(null);
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
        
        const newEthBalance = await provider.getBalance(info.lbp);
        setLbpState(prev => ({ ...prev, ethBalance: newEthBalance }));
      }

      if (ethToUniswap > 0n && tokensToUniswap > 0n) {
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
        let tickLower = -887272;
        let tickUpper = 887272;

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

      if (tokensToTreasury > 0n) {
        const tokenAddressForWithdraw = await lbpContract.token().catch(() => ethers.ZeroAddress);
        let currentTokenBalance = 0n;
        if (tokenAddressForWithdraw !== ethers.ZeroAddress) {
          const tokenAbi = allAbis.ERC20 || allAbis.TestToken || [];
          if (tokenAbi.length > 0) {
            const tokenContract = new ethers.Contract(tokenAddressForWithdraw, tokenAbi, provider);
            currentTokenBalance = await tokenContract.balanceOf(info.lbp).catch(() => 0n);
          }
        }
        
        if (currentTokenBalance > 0n) {
          setSettlementStep("Withdrawing tokens to treasury…");
          showTxInfo("Please confirm token withdrawal in your wallet", { autoClose: false });
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

      results.finalBalances = {
        eth: ethers.formatEther(newEthBalance),
        tokens: ethers.formatEther(newTokenBalance),
        lp: ethers.formatEther(newLpBalance)
      };

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
  }, [
    info?.lbp,
    isOwner,
    managerContract,
    lbpState,
    currentTime,
    settlementForm,
    address,
    setSettlementExecuting,
    setSettlementStep,
    setSettlementResults,
    setLbpState,
    setTxStatus,
  ]);

  return {
    handleSettlementFormChange,
    handleSetMax,
    handleSetPercentage,
    handleUnwindLiquidity,
    handleConfigureUniswapV3,
    handleExecuteSettlement,
  };
};

