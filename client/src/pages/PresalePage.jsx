import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";

import PresaleHero from "../components/PresalePage/PresaleHero";
import TransactionStatus from "../components/PresalePage/TransactionStatus";
import PostLbpSettlement from "../components/PresalePage/PostLbpSettlement";
import DeployedAuctionsList from "../components/PresalePage/DeployedAuctionsList";
import LoadingErrorState from "../components/PresalePage/LoadingErrorState";
import BonusMerkleManagerWrapper from "../components/PresalePage/BonusMerkleManagerWrapper";
import AuctionControlsWrapper from "../components/PresalePage/AuctionControlsWrapper";
import { useAuctionData } from "../hooks/useAuctionData";
import { usePresaleInfo } from "../hooks/usePresaleInfo";
import { useLbpState } from "../hooks/useLbpState";
import { useAuctionContract } from "../hooks/useAuctionContract";
import { useAuctionHandlers } from "../hooks/useAuctionHandlers";
import { useSettlementHandlers } from "../hooks/useSettlementHandlers";
import { useLbpHandlers } from "../hooks/useLbpHandlers";
import { useTime } from "../time";
import { defaultAuctionForm, defaultLbpConfig } from "../components/PresalePage/utils";

const PresalePage = ({ account }) => {
  const { address } = useParams();
  const [txStatus, setTxStatus] = useState(null);
  const [auctionForm, setAuctionForm] = useState(defaultAuctionForm);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [lbpConfig, setLbpConfig] = useState(defaultLbpConfig);
  const [unwindingLiquidity, setUnwindingLiquidity] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    ethToUniswap: "",
    tokensToUniswap: "",
    feeTier: "3000",
    sqrtPriceX96: "79228162514264337593543950336",
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

  const {
    managerContract,
    info,
    auctions,
    loading,
    error,
    isOwner,
    refreshInfo,
  } = usePresaleInfo(address, account);

  const { currentTime } = useTime();
  const { lbpState, setLbpState } = useLbpState(info, isOwner, currentTime);
  const auctionContract = useAuctionContract(info?.auction, managerContract);
  
  const {
    data: auctionData,
    refetch: refetchAuctionData,
  } = useAuctionData(auctionContract, managerContract, info?.auction);

  const {
    submitAuction: handleSubmitAuction,
    handleFinalizeAuction,
    handleAccelerateAuction,
    handleWithdrawTreasury,
  } = useAuctionHandlers({
    managerContract,
    info,
    address,
    auctionForm,
    lbpConfig,
    auctionData,
    currentTime,
    auctionContract,
    setTxStatus,
    setCreatingAuction,
    setAuctionForm,
    refreshInfo,
  });

  const {
    handleSettlementFormChange,
    handleSetMax,
    handleSetPercentage,
    handleUnwindLiquidity,
    handleConfigureUniswapV3,
    handleExecuteSettlement,
  } = useSettlementHandlers({
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
  });

  const {
    handleLaunchLbp,
    handleFinalizeLbp,
    handleUnwind,
    launchLbpConfig,
  } = useLbpHandlers({
    managerContract,
    info,
    address,
    lbpConfig,
    auctionContract,
    auctionData,
    currentTime,
    setTxStatus,
    setLbpState,
    refreshInfo,
    refetchAuctionData,
  });

  const handleAuctionFormChange = (name, value) => {
    setAuctionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLbpConfigChange = (name, value) => {
    setLbpConfig((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (settlementResults) {
      console.log("=== Settlement Results Updated ===", settlementResults);
    }
  }, [settlementResults]);

  useEffect(() => {
    if (info?.auction && auctionContract) {
      refetchAuctionData();
    }
  }, [info?.auction, auctionContract, refetchAuctionData]);

  useEffect(() => {
    const loadSettlementAddresses = async () => {
      if (!info?.lbp || info.lbp === ethers.ZeroAddress || !isOwner) {
        return;
      }

      try {
        const allAbis = await import("../abi/allAbis.json");
        const { ensureProvider } = await import("../services/web3/provider");
        const provider = ensureProvider();
        const lbpAbi = allAbis.SecureLBP || [];
        
        if (lbpAbi.length === 0) {
          return;
        }

        const { Contract } = await import("ethers");
        const lbpContract = new Contract(info.lbp, lbpAbi, provider);
        const [uniswapFactory, uniswapPositionManager, weth] = await Promise.all([
          lbpContract.uniswapFactory().catch(() => ethers.ZeroAddress),
          lbpContract.uniswapPositionManager().catch(() => ethers.ZeroAddress),
          lbpContract.weth().catch(() => ethers.ZeroAddress),
        ]);

        let fallbackFactory = uniswapFactory;
        let fallbackPositionManager = uniswapPositionManager;
        let fallbackWeth = weth;

        if (uniswapFactory === ethers.ZeroAddress || uniswapPositionManager === ethers.ZeroAddress || weth === ethers.ZeroAddress) {
          try {
            const deployments = await import("../abi/data/stppDeployments.json");
            const latestEntry = deployments?.default?.entries?.[deployments.default.entries.length - 1];
            
            if (latestEntry) {
              if (fallbackFactory === ethers.ZeroAddress && latestEntry.uniswapV3Factory) {
                fallbackFactory = latestEntry.uniswapV3Factory;
              }
              if (fallbackPositionManager === ethers.ZeroAddress && latestEntry.uniswapV3PositionManager) {
                fallbackPositionManager = latestEntry.uniswapV3PositionManager;
              }
              if (fallbackWeth === ethers.ZeroAddress && latestEntry.uniswapV3WETH) {
                fallbackWeth = latestEntry.uniswapV3WETH;
              }
            }
          } catch (deployErr) {
            try {
              const uniswapAddresses = await import("../abi/uniswapV3Addresses.json");
              const network = await provider.getNetwork();
              const chainId = network.chainId.toString();
              const addresses = uniswapAddresses?.default?.[chainId] || uniswapAddresses?.default?.["31337"];
              
              if (addresses) {
                if (fallbackFactory === ethers.ZeroAddress && addresses.factory) {
                  fallbackFactory = addresses.factory;
                }
                if (fallbackPositionManager === ethers.ZeroAddress && addresses.positionManager) {
                  fallbackPositionManager = addresses.positionManager;
                }
                if (fallbackWeth === ethers.ZeroAddress && addresses.weth) {
                  fallbackWeth = addresses.weth;
                }
              }
            } catch (uniswapErr) {
              console.warn("Could not load Uniswap V3 addresses from files:", uniswapErr);
            }
          }
        }

        setSettlementForm((prev) => {
          const updates = {};
          
          if (!prev.uniswapFactory && fallbackFactory !== ethers.ZeroAddress) {
            updates.uniswapFactory = fallbackFactory;
          }
          
          if (!prev.uniswapPositionManager && fallbackPositionManager !== ethers.ZeroAddress) {
            updates.uniswapPositionManager = fallbackPositionManager;
          }
          
          if (!prev.weth && fallbackWeth !== ethers.ZeroAddress) {
            updates.weth = fallbackWeth;
          }
          if (!prev.lpRecipient && auctionData?.treasury && auctionData.treasury !== ethers.ZeroAddress) {
            updates.lpRecipient = auctionData.treasury;
          }
          
          return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
        });
      } catch (err) {
        console.warn("Failed to load settlement addresses:", err);
      }
    };

    loadSettlementAddresses();
  }, [info?.lbp, isOwner, auctionData?.treasury]);
  
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-8">
      <PresaleHero address={address} info={info} />
      <TransactionStatus txStatus={txStatus} />

      <LoadingErrorState loading={loading} error={error} />
      
      {!loading && !error && (
        <>
          <AuctionControlsWrapper
            isOwner={isOwner}
            auctionAddress={info?.auction}
            onFinalizeAuction={handleFinalizeAuction}
            onLaunchLbp={handleLaunchLbp}
            onFinalizeLbp={handleFinalizeLbp}
            onUnwind={handleUnwind}
            onAccelerateAuction={handleAccelerateAuction}
            onWithdrawTreasury={handleWithdrawTreasury}
            lbpConfig={lbpConfig}
            onLbpConfigChange={handleLbpConfigChange}
            disabled={!info?.auction}
            auctionData={auctionData}
            currentTime={currentTime}
          />

          {/* Post-LBP Settlement Panel (Owner Only, After Finalization) */}
          {isOwner && info?.lbp && info.lbp !== ethers.ZeroAddress && lbpState.finalized && (
            <PostLbpSettlement
              lbpState={lbpState}
              currentTime={currentTime}
              settlementForm={settlementForm}
              onSettlementFormChange={handleSettlementFormChange}
              onSetMax={handleSetMax}
              onSetPercentage={handleSetPercentage}
              onUnwindLiquidity={handleUnwindLiquidity}
              onConfigureUniswapV3={handleConfigureUniswapV3}
              onExecuteSettlement={handleExecuteSettlement}
              unwindingLiquidity={unwindingLiquidity}
              uniswapConfiguring={uniswapConfiguring}
              settlementExecuting={settlementExecuting}
              settlementStep={settlementStep}
              settlementResults={settlementResults}
              onCloseResults={() => setSettlementResults(null)}
            />
          )}

          <BonusMerkleManagerWrapper
            isOwner={isOwner}
            auctionContract={auctionContract}
            auctionAddress={info?.auction}
            auctionData={auctionData}
            onUpdate={async () => {
              await refetchAuctionData();
              await refreshInfo();
            }}
          />

          <DeployedAuctionsList auctions={auctions} />
        </>
      )}
    </section>
  );
};

export default PresalePage;
