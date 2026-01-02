import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAccount as useWagmiAccount } from "wagmi";
import { useRealtimeLbpData } from "../hooks/useRealtimeLbpData";
import { useLbpData } from "../hooks/useLbpData";
import { useLbpActions } from "../hooks/useLbpActions";
import { useTime } from "../time";
import DeveloperTimeControls from "../components/common/DeveloperTimeControls";
import LBPHeader from "../components/lbp/LBPHeader";
import PoolStateOverview from "../components/lbp/PoolStateOverview";
import PriceChart from "../components/lbp/PriceChart";
import WeightScheduleChart from "../components/lbp/WeightScheduleChart";
import BidForm from "../components/lbp/BidForm";
import FinalizedPanel from "../components/lbp/FinalizedPanel";

const REFRESH_RATE_MS = 2000;

const LbpView = () => {
  const { lbpAddress } = useParams();
  const { address: account } = useWagmiAccount();
  const { currentTime, refreshTime } = useTime();
  
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

  const timeUntilPauseEnd = useMemo(() => {
    if (!lbpData?.oraclePausedUntil) return null;
    if (currentTime >= lbpData.oraclePausedUntil) return null;
    const remaining = lbpData.oraclePausedUntil - currentTime;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return { hours, minutes, seconds, total: remaining };
  }, [lbpData, currentTime]); // Use lbpData instead of lbpData?.oraclePausedUntil to ensure updates

  const isActive = status === "Active";
  const canBid = isActive && !lbpData?.paused && !lbpData?.oraclePaused;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-transparent border-t-[rgb(74,222,128)] border-r-[rgba(74,222,128,0.3)] shadow-[0_0_20px_rgba(74,222,128,0.3)]"></div>
          <p className="text-lg font-medium text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">Loading LBP data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[rgb(15,23,42)] via-[rgb(30,41,59)] to-[rgb(15,23,42)]">
        <div className="relative max-w-md overflow-hidden rounded-2xl border border-[rgba(239,68,68,0.5)] bg-gradient-to-br from-[rgba(239,68,68,0.15)] to-[rgba(220,38,38,0.1)] p-8 backdrop-blur-[8px] shadow-[0_20px_25px_-5px_rgba(239,68,68,0.2),0_10px_10px_-5px_rgba(0,0,0,0.2)] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(239,68,68,0.8)] before:via-[rgba(248,113,113,0.8)] before:to-[rgba(239,68,68,0.8)] before:bg-[length:200%_100%] before:animate-[shimmer_3s_ease-in-out_infinite]">
          <h2 className="relative z-10 mb-3 text-2xl font-extrabold text-[rgb(248,113,113)]">Error</h2>
          <p className="relative z-10 leading-relaxed text-[rgb(252,165,165)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!lbpData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">LBP not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="relative z-10 mx-auto flex max-w-[80rem] flex-col gap-8">
        <LBPHeader
          lbpAddress={lbpAddress}
          lbpData={lbpData}
          status={status}
          timeUntilEnd={timeUntilEnd}
          timeUntilPauseEnd={timeUntilPauseEnd}
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
            timeUntilPauseEnd={timeUntilPauseEnd}
            spotPrice={spotPrice}
            adaptiveFee={adaptiveFee}
          />
        )}

        <FinalizedPanel
          lbpAddress={lbpAddress}
          lbpData={lbpData}
        />

        <DeveloperTimeControls 
          onTimeAdvanced={async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await refreshTime();
            await new Promise(resolve => setTimeout(resolve, 500));
            await refetchLbpData();
          }} 
        />
      </div>
    </div>
  );
};

export default LbpView;
