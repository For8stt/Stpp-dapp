import { useState, useEffect } from "react";
import { ethers } from "ethers";

export const useLbpState = (info, isOwner, currentTime) => {
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
      } catch (err) {
        console.warn("Failed to load LBP state:", err);
        setLbpState(prev => ({ ...prev, loading: false }));
      }
    };

    loadLbpState();
  }, [info?.lbp, isOwner, info?.lbpFinalized, currentTime, info]);

  return { lbpState, setLbpState };
};

