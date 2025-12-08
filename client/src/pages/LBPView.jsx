import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useChainId } from "wagmi";
import { useAccount } from "../hooks/useAccount";
import { useRealtimeLbpData } from "../hooks/useRealtimeLbpData";
import { useLbpData } from "../hooks/useLbpData";
import { useLbpActions } from "../hooks/useLbpActions";
import DeveloperTimeControls from "../components/presale/DeveloperTimeControls";
import LBPHeader from "../components/lbp/LBPHeader";
import PoolStateOverview from "../components/lbp/PoolStateOverview";
import PriceChart from "../components/lbp/PriceChart";
import WeightScheduleChart from "../components/lbp/WeightScheduleChart";
import BidForm from "../components/lbp/BidForm";
import FinalizedPanel from "../components/lbp/FinalizedPanel";
import { ensureProvider } from "../services/web3/provider";
import styles from "./css/LBPView.module.css";

const REFRESH_RATE_MS = 2000;

const LbpView = () => {
  const { lbpAddress } = useParams();
  const { account } = useAccount();
  const chainId = useChainId();
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [error, setError] = useState("");

  const {
    lbpData,
    poolData,
    priceChartData,
    chartData,
    weights,
    spotPrice,
    reserves,
    adaptiveFee,
    totalTokensAllocated,
    totalEthRaised,
    loading,
    error: lbpError,
    refetch: refetchLbpData,
  } = useRealtimeLbpData(lbpAddress, REFRESH_RATE_MS);
  
  const activeChartData = chartData && chartData.length > 0 ? chartData : priceChartData;

  const {
    userData,
    weightScheduleData,
    refetchUserData,
  } = useLbpData(lbpAddress, lbpData, account);

  const {
    bidForm,
    handleBidFormChange,
    handlePlaceBid,
    isPending,
  } = useLbpActions(
    lbpAddress,
    lbpData,
    poolData,
    account,
    weights,
    reserves,
    adaptiveFee,
    refetchLbpData,
    refetchUserData
  );

  useEffect(() => {
    const updateTime = async () => {
      try {
        const provider = ensureProvider();
        if (provider) {
          try {
            const block = await provider.getBlock("latest");
            if (block?.timestamp) {
              setCurrentTime(Number(block.timestamp));
              return;
            }
          } catch (blockErr) {
            console.warn("Could not fetch blockchain time:", blockErr);
          }
        }
      } catch (err) {
        console.warn("Could not get provider for time update:", err);
      }
      
      setCurrentTime(Math.floor(Date.now() / 1000));
    };

    updateTime();
    
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [chainId]);

  useEffect(() => {
    if (lbpError) {
      setError(lbpError);
    }
  }, [lbpError]);

  const status = useMemo(() => {
    if (!lbpData) return "Loading...";
    if (lbpData.paused || lbpData.oraclePaused) return "Paused";
    if (!lbpData.poolInitialized) return "Not Initialized";
    if (lbpData.finalized) return "Finalized";
    if (currentTime < lbpData.startTime) return "Upcoming";
    if (currentTime >= lbpData.startTime && currentTime <= lbpData.endTime)
      return "Active";
    return "Ended";
  }, [lbpData, currentTime]);

  const timeUntilEnd = useMemo(() => {
    if (!lbpData || currentTime >= lbpData.endTime) return null;
    const remaining = lbpData.endTime - currentTime;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return { hours, minutes, seconds, total: remaining };
  }, [lbpData, currentTime]);

  const isActive = status === "Active";
  const canBid = isActive && !lbpData?.paused && !lbpData?.oraclePaused && account;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading LBP data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>Error</h2>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (!lbpData) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyContent}>
          <p className={styles.emptyText}>LBP not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <LBPHeader
          lbpAddress={lbpAddress}
          lbpData={lbpData}
          status={status}
          timeUntilEnd={timeUntilEnd}
        />

        <PoolStateOverview
          lbpData={lbpData}
          poolData={poolData}
          reserves={reserves}
          weights={weights}
          spotPrice={spotPrice}
          adaptiveFee={adaptiveFee}
          totalTokensAllocated={totalTokensAllocated}
          totalEthRaised={totalEthRaised}
          userData={userData}
        />

        <PriceChart
          chartData={activeChartData}
          lbpData={lbpData}
          poolData={poolData}
          spotPrice={spotPrice}
          currentTime={currentTime}
        />

        <WeightScheduleChart
          weightScheduleData={weightScheduleData}
          lbpData={lbpData}
          poolData={poolData}
          weights={weights}
          currentTime={currentTime}
        />

        {canBid && (
          <BidForm
            lbpData={lbpData}
            bidForm={bidForm}
            handleBidFormChange={handleBidFormChange}
            handlePlaceBid={handlePlaceBid}
            isPending={isPending}
            account={account}
          />
        )}

        <FinalizedPanel
          lbpAddress={lbpAddress}
          lbpData={lbpData}
        />

        <DeveloperTimeControls onTimeAdvanced={refetchLbpData} />
      </div>
    </div>
  );
};

export default LbpView;
