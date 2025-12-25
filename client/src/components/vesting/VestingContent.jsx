import React from "react";
import DeveloperTimeControls from "../common/DeveloperTimeControls";
import VestingHeader from "./VestingHeader";
import VestingWarnings from "./VestingWarnings";
import VestingInfoCards from "./VestingInfoCards";
import VestingConfig from "./VestingConfig";
import VestingStats from "./VestingStats";
import VestingTimeline from "./VestingTimeline";
import VestingChart from "./VestingChart";
import ClaimPanel from "./ClaimPanel";
import VestingEmpty from "./VestingEmpty";

const VestingContent = ({
  account,
  vestingData,
  lbpAddressToCheck,
  secureLBPAddress,
  escrowAddress,
  correctEscrowAddress,
  checkingEscrow,
  lbpFinalized,
  progressPercent,
  cliffProgress,
  finalProgress,
  currentTime,
  vestingCurveData,
  canClaim,
  isPending,
  onClaim,
  onTimeAdvanced,
}) => {
  const {
    escrowAddress: dataEscrowAddress,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    finalized,
    vestingConfigured,
    vestingStart,
    vestingCliffDuration,
    vestingFinalDuration,
    vestingCliffPercentBP,
    userAllocation,
    userVested,
    userClaimed,
    userClaimable,
    timeUntilCliff,
    timeUntilFinal,
    cliffTime,
    finalTime,
  } = vestingData;

  const hasAllocation = userAllocation && userAllocation > 0n;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 relative z-10">
      <VestingHeader 
        lbpAddress={lbpAddressToCheck}
        secureLBPAddress={secureLBPAddress}
      />

      <VestingWarnings
        escrowAddress={escrowAddress}
        lbpAddressToCheck={lbpAddressToCheck}
        secureLBPAddress={secureLBPAddress}
        correctEscrowAddress={correctEscrowAddress}
        checkingEscrow={checkingEscrow}
        lbpFinalized={lbpFinalized}
        totalTokensAllocated={userAllocation}
        escrowMismatchWarning={vestingData.escrowMismatchWarning}
        timeUntilCliff={timeUntilCliff}
        isCliffPassed={vestingData.userVested > 0n || (timeUntilCliff !== undefined && timeUntilCliff <= 0)}
        userAllocationFromAuction={vestingData.userAllocationFromAuction}
      />

      <VestingInfoCards
        escrowAddress={dataEscrowAddress}
        secureLBPAddress={secureLBPAddress}
        tokenAddress={tokenAddress}
        tokenSymbol={tokenSymbol}
        finalized={finalized}
        lbpAddressToCheck={lbpAddressToCheck}
        correctEscrowAddress={correctEscrowAddress}
      />

      <VestingConfig
        vestingConfigured={vestingConfigured}
        vestingStart={vestingStart}
        vestingCliffDuration={vestingCliffDuration}
        vestingFinalDuration={vestingFinalDuration}
        vestingCliffPercentBP={vestingCliffPercentBP}
      />

      {account && (
        <>
          {hasAllocation ? (
            <>
              <VestingStats
                userAllocation={userAllocation}
                userVested={userVested}
                userClaimed={userClaimed}
                userClaimable={userClaimable}
                tokenSymbol={tokenSymbol}
                tokenDecimals={tokenDecimals}
                progressPercent={progressPercent}
              />

              <VestingTimeline
                vestingConfigured={vestingConfigured}
                progressPercent={progressPercent}
                userVested={userVested}
                userAllocation={userAllocation}
                tokenSymbol={tokenSymbol}
                tokenDecimals={tokenDecimals}
                cliffProgress={cliffProgress}
                timeUntilCliff={timeUntilCliff}
                cliffTime={cliffTime}
                currentTime={currentTime}
                finalProgress={finalProgress}
                timeUntilFinal={timeUntilFinal}
                finalTime={finalTime}
                vestingFinalDuration={vestingFinalDuration}
              />

              <VestingChart
                vestingCurveData={vestingCurveData}
                vestingStart={vestingStart}
                finalTime={finalTime}
                currentTime={currentTime}
                userVested={userVested}
                tokenSymbol={tokenSymbol}
                tokenDecimals={tokenDecimals}
              />

              <ClaimPanel
                userClaimable={userClaimable}
                tokenSymbol={tokenSymbol}
                tokenDecimals={tokenDecimals}
                canClaim={canClaim}
                isPending={isPending}
                onClaim={onClaim}
              />

            </>
          ) : (
            <VestingEmpty message="You don't have any tokens allocated in this vesting escrow." />
          )}
        </>
      )}

      {!account && (
        <VestingEmpty message="Please connect your wallet to view your vesting information." />
      )}

      {!vestingConfigured && finalized && (
        <VestingEmpty message="Vesting is not configured for this escrow. All tokens may be immediately claimable." />
      )}

      <DeveloperTimeControls onTimeAdvanced={onTimeAdvanced} useDays={true} />
    </div>
  );
};

export default VestingContent;




