/**
 * VestingView - Complete Vesting Page
 * Displays vesting information and allows users to claim vested tokens.
 * 
 * Route: /vesting/:escrowAddress
 */
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAccount as useWagmiAccount } from "wagmi";
import { useTransaction } from "../hooks/useTransaction";
import { useVestingData } from "../hooks/useVestingData";
import { useTime } from "../time";
import { calculateVestingCurveData, formatToken } from "../components/vesting/vesting.utils";
import { useEscrowCheck } from "../components/vesting/useEscrowCheck";
import { useClaimHandler } from "../components/vesting/useClaimHandler";
import { useVestingProgress } from "../components/vesting/useVestingProgress";
import VestingLoading from "../components/vesting/VestingLoading";
import VestingError from "../components/vesting/VestingError";
import VestingEmpty from "../components/vesting/VestingEmpty";
import VestingContent from "../components/vesting/VestingContent";

const VestingView = () => {
  const { escrowAddress } = useParams();
  const [searchParams] = useSearchParams();
  const expectedLBPAddress = searchParams.get("lbp");
  const lbpAddressParam = searchParams.get("lbpAddress");
  const { address: account } = useWagmiAccount();
  const tx = useTransaction();
  const { currentTime, refreshTime } = useTime();
  
  const lbpAddressToCheck = lbpAddressParam || expectedLBPAddress;

  const {
    data: vestingData,
    loading,
    error,
    refetch: refetchVestingData,
  } = useVestingData(escrowAddress, account, lbpAddressToCheck || undefined, currentTime);

  const [vestingCurveData, setVestingCurveData] = useState([]);

  const { correctEscrowAddress, checkingEscrow, lbpFinalized } = useEscrowCheck(
    lbpAddressToCheck,
    escrowAddress
  );

  const handleClaim = useClaimHandler(
    vestingData,
    account,
    escrowAddress,
    tx,
    refetchVestingData
  );

  const { progressPercent, cliffProgress, finalProgress } = useVestingProgress(vestingData);

  /**
   * Calculate vesting curve data for graph
   */
  useEffect(() => {
    if (!vestingData || !vestingData.vestingConfigured) {
      setVestingCurveData([]);
      return;
    }

    const curveData = calculateVestingCurveData(vestingData, currentTime, formatToken);
    setVestingCurveData(curveData);
  }, [vestingData, currentTime]);

  if (loading) {
    return <VestingLoading />;
  }

  if (error) {
    return <VestingError error={error} onRetry={refetchVestingData} />;
  }

  if (!vestingData) {
    return <VestingEmpty />;
  }
  
  const canClaim = (vestingData.userClaimable && vestingData.userClaimable > 0n) || 
                  (vestingData.userVested && vestingData.userClaimed !== undefined && vestingData.userVested > vestingData.userClaimed);

  return (
    <VestingContent
      account={account}
      vestingData={vestingData}
      lbpAddressToCheck={lbpAddressToCheck}
      secureLBPAddress={vestingData.secureLBPAddress}
      escrowAddress={escrowAddress}
      correctEscrowAddress={correctEscrowAddress}
      checkingEscrow={checkingEscrow}
      lbpFinalized={lbpFinalized}
      progressPercent={progressPercent}
      cliffProgress={cliffProgress}
      finalProgress={finalProgress}
      currentTime={currentTime}
      vestingCurveData={vestingCurveData}
      canClaim={canClaim}
      isPending={tx.isPending}
      onClaim={handleClaim}
      onTimeAdvanced={async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshTime();
        await new Promise(resolve => setTimeout(resolve, 500));
        await refetchVestingData();
      }}
    />
  );
};

export default VestingView;
