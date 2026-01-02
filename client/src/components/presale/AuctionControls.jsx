import React, { useMemo } from "react";
import { ethers } from "ethers";
import { formatTokenUnits, formatEth } from "../../utils/auctionUtils";

const ControlButton = ({ label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="rounded-lg border border-slate-600/50 bg-slate-700/50 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:border-slate-500/70 hover:bg-slate-700/70 active:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-600/50 disabled:hover:bg-slate-700/50"
  >
    {label}
  </button>
);

const Input = ({ label, name, value, onChange, type = "text", placeholder }) => (
  <label className="flex flex-col gap-2">
    <span className="text-xs font-medium uppercase tracking-wider text-white/70">{label}</span>
    <input
      type={type}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(name, event.target.value)}
      className="w-full rounded-xl border border-white/12 bg-gradient-to-br from-slate-950/90 to-slate-900/80 px-4 py-3 text-sm text-white shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-all duration-300 placeholder:text-white/40 hover:border-white/18 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)] focus:border-indigo-500/60 focus:bg-gradient-to-br focus:from-slate-950/95 focus:to-slate-900/90 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15),0_4px_12px_rgba(99,102,241,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] [&[type='datetime-local']]:font-mono [&[type='datetime-local']]:text-white/90 [&[type='datetime-local']::-webkit-calendar-picker-indicator]:invert [&[type='datetime-local']::-webkit-calendar-picker-indicator]:opacity-70 [&[type='datetime-local']::-webkit-calendar-picker-indicator]:cursor-pointer [&[type='datetime-local']::-webkit-calendar-picker-indicator]:transition-opacity [&[type='datetime-local']::-webkit-calendar-picker-indicator]:duration-200 hover:[&[type='datetime-local']::-webkit-calendar-picker-indicator]:opacity-100"
    />
  </label>
);

const Select = ({ label, name, value, onChange, options, helper }) => (
  <label className="flex flex-col gap-2">
    <span className="text-xs font-medium uppercase tracking-wider text-white/70">{label}</span>
    {helper && <span className="text-xs text-white/50 italic">{helper}</span>}
    <select
      name={name}
      value={value}
      onChange={(event) => onChange(name, event.target.value)}
      className="w-full rounded-xl border border-white/12 bg-gradient-to-br from-slate-950/90 to-slate-900/80 px-4 py-3 text-sm text-white shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-all duration-300 hover:border-white/18 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)] focus:border-indigo-500/60 focus:bg-gradient-to-br focus:from-slate-950/95 focus:to-slate-900/90 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15),0_4px_12px_rgba(99,102,241,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] cursor-pointer"
    >
      <option value="">Select {label.toLowerCase()}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-slate-900 text-white">
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

const AuctionControls = ({
  isOwner,
  auctionAddress,
  onFinalizeAuction,
  onLaunchLbp,
  onFinalizeLbp,
  onUnwind,
  onAccelerateAuction,
  onWithdrawTreasury,
  lbpConfig,
  onLbpConfigChange,
  disabled,
  auctionData,
  currentTime,
}) => {
  // Check if all tokens were sold
  const allTokensSold = useMemo(() => {
    if (!auctionData) return false;
    const tokensSold = auctionData.tokensSold || 0n;
    const tokensForSale = auctionData.tokensForSale || 0n;
    return tokensForSale > 0n && tokensSold >= tokensForSale;
  }, [auctionData]);

  const accelerateButtonState = useMemo(() => {
    if (!auctionData || !currentTime || !auctionAddress) {
      return { enabled: false, tooltip: "Auction data not available", timeRemaining: null };
    }

    const DEMAND_CHECK_GRACE = 15 * 60; // 15 minutes in seconds
    const demandCheckTime = auctionData.demandCheckTime || 0;
    const commitEndTime = auctionData.commitEndTime || 0;
    const finalized = auctionData.finalized || false;
    const gracePeriodEnd = demandCheckTime + DEMAND_CHECK_GRACE;

    if (finalized) {
      return { enabled: false, tooltip: "Auction is already finalized", timeRemaining: null };
    }

    if (currentTime < demandCheckTime) {
      const timeUntilCheck = demandCheckTime - currentTime;
      const hours = Math.floor(timeUntilCheck / 3600);
      const minutes = Math.floor((timeUntilCheck % 3600) / 60);
      const seconds = timeUntilCheck % 60;
      return {
        enabled: false,
        tooltip: `Acceleration can only be triggered after the demand check time`,
        timeRemaining: { hours, minutes, seconds, total: timeUntilCheck },
      };
    }

    if (currentTime > gracePeriodEnd) {
      return { enabled: false, tooltip: "Demand check grace period (15 minutes) has expired. Cannot accelerate auction.", timeRemaining: null };
    }

    if (currentTime >= commitEndTime) {
      return { enabled: false, tooltip: "Commit phase has ended. Cannot accelerate auction.", timeRemaining: null };
    }

    // Calculate time remaining until grace period ends
    const timeUntilGraceEnd = gracePeriodEnd - currentTime;
    const hours = Math.floor(timeUntilGraceEnd / 3600);
    const minutes = Math.floor((timeUntilGraceEnd % 3600) / 60);
    const seconds = timeUntilGraceEnd % 60;

    return { 
      enabled: true, 
      tooltip: null,
      timeRemaining: { hours, minutes, seconds, total: timeUntilGraceEnd }
    };
  }, [auctionData, currentTime, auctionAddress]);

  const demandStatus = useMemo(() => {
    if (!auctionData) return null;
    const totalDepositCommitted = auctionData.totalDepositCommitted || 0n;
    const thresholdLow = auctionData.thresholdLow || 0n;
    const isLowDemand = thresholdLow > 0n ? totalDepositCommitted < thresholdLow : false;
    
    return {
      totalDepositCommitted,
      thresholdLow,
      isLowDemand,
      formattedDeposit: ethers.formatEther(totalDepositCommitted),
      formattedThreshold: ethers.formatEther(thresholdLow), // Format from wei to ETH
    };
  }, [auctionData]);

  if (!isOwner) {
    return (
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 to-slate-800/50 p-6 text-center text-sm text-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px]">
        Only the owner of this presale manager can run administrative actions. Connect the wallet used to deploy the
        presale to unlock controls.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="m-0 text-xl font-semibold text-white">Auction controls</p>
          <p className="mt-1 mb-0 text-sm text-white/65">Manage the Dutch auction and downstream LBP deployment.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {allTokensSold && auctionData?.finalized ? (
            // Show only withdraw button when all tokens are sold
            onWithdrawTreasury && (
              <ControlButton 
                label="Withdraw ETH" 
                onClick={onWithdrawTreasury} 
                disabled={disabled || !auctionAddress}
                title="Withdraw earned ETH from auction to treasury"
              />
            )
          ) : (
            // Show all normal buttons when tokens are not all sold
            <>
          <ControlButton label="Finalize auction" onClick={onFinalizeAuction} disabled={disabled || !auctionAddress} />
          <ControlButton label="Launch LBP" onClick={onLaunchLbp} disabled={disabled || !auctionAddress} />
          <ControlButton label="Finalize LBP" onClick={onFinalizeLbp} disabled={disabled} />
          <ControlButton label="Unwind LBP" onClick={onUnwind} disabled={disabled} />
            </>
          )}
        </div>
      </div>

      {/* Show info message when all tokens are sold */}
      {allTokensSold && auctionData?.finalized && (
        <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-900/20 to-green-800/10 p-4 shadow-[0_4px_12px_rgba(34,197,94,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px]">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-200">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All tokens sold
          </p>
          <div className="mb-3 space-y-2 text-xs text-white/70">
            <p className="leading-relaxed">
              All tokens from the auction have been sold. You can withdraw the earned ETH proceeds to the treasury address using the button above.
            </p>
            <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/60">Tokens Sold</p>
                  <p className="mt-1 font-mono text-base font-semibold text-green-200">
                    {formatTokenUnits(auctionData.tokensSold || 0n)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/60">ETH Available</p>
                  <p className="mt-1 font-mono text-base font-semibold text-green-200">
                    {formatEth(auctionData.ethForTreasury || 0n)} ETH
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    (Based on clearing price, excluding refunds)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accelerate Auction Section */}
      {isOwner && auctionAddress && auctionData && (
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-900/20 to-amber-800/10 p-6 shadow-[0_4px_12px_rgba(245,158,11,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px]">
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-200">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Accelerate Auction (Low Demand)
            </p>
            <p className="text-xs text-white/60 leading-relaxed">
              This manual action triggers the same dynamic reserve adjustment used by automated keepers. 
              The auction will only shorten if low participation is detected on-chain.
            </p>
          </div>

          {/* Demand Status Indicator */}
          {demandStatus && demandStatus.thresholdLow > 0n && (
            <div className="mb-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">Demand Status</p>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/80">Total Deposits:</span>
                  <span className="font-mono font-semibold text-white">{demandStatus.formattedDeposit} ETH</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/80">Threshold Low:</span>
                  <span className="font-mono font-semibold text-white">{demandStatus.formattedThreshold} ETH</span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg border px-3 py-2 border-white/10 bg-slate-800/50">
                  <span className="text-white/80">Status:</span>
                  <span className={`font-semibold ${
                    demandStatus.isLowDemand 
                      ? "text-amber-400" 
                      : "text-green-400"
                  }`}>
                    {demandStatus.isLowDemand ? "Low demand detected" : "Demand above threshold"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onAccelerateAuction}
              disabled={disabled || !accelerateButtonState.enabled}
              title={accelerateButtonState.tooltip || undefined}
              className="flex-1 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-600/30 to-amber-700/20 px-5 py-2.5 text-sm font-semibold text-amber-200 transition-all hover:border-amber-500/60 hover:from-amber-600/40 hover:to-amber-700/30 active:from-amber-600/25 active:to-amber-700/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-amber-500/40 disabled:hover:from-amber-600/30 disabled:hover:to-amber-700/20"
            >
              Accelerate Auction (Low Demand)
            </button>
          </div>
          {accelerateButtonState.timeRemaining && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-900/20 p-3">
              <p className="text-xs font-semibold text-amber-200 mb-1">
                {currentTime < (auctionData.demandCheckTime || 0) 
                  ? "Time until acceleration becomes available:" 
                  : "Time remaining to accelerate (15 min window):"}
              </p>
              <p className="text-lg font-bold text-amber-100 font-mono">
                {accelerateButtonState.timeRemaining.hours}h {accelerateButtonState.timeRemaining.minutes}m {accelerateButtonState.timeRemaining.seconds}s
              </p>
            </div>
          )}
          {accelerateButtonState.tooltip && !accelerateButtonState.timeRemaining && (
            <p className="mt-2 text-xs text-amber-300/70">{accelerateButtonState.tooltip}</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-6 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px]">
        <p className="mb-4 mt-0 flex items-center gap-2 text-sm font-semibold text-white">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          LBP config override
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Start time"
            type="datetime-local"
            name="startTime"
            value={lbpConfig.startTime}
            onChange={onLbpConfigChange}
          />
          <Input
            label="End time"
            type="datetime-local"
            name="endTime"
            value={lbpConfig.endTime}
            onChange={onLbpConfigChange}
          />
          <Input
            label="Start weight %"
            name="poolStartWeightToken"
            value={lbpConfig.poolStartWeightToken}
            onChange={onLbpConfigChange}
            placeholder="80"
          />
          <Input
            label="End weight %"
            name="poolEndWeightToken"
            value={lbpConfig.poolEndWeightToken}
            onChange={onLbpConfigChange}
            placeholder="20"
          />
          

          <div className="md:col-span-2">

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Initial fee"
                name="initialFeePreset"
                value={lbpConfig.initialFeePreset || ""}
                onChange={onLbpConfigChange}
                options={[
                  { value: "0", label: "5%" },
                  { value: "1", label: "10%" },
                  { value: "2", label: "15%" },
                ]}
              />
              <Select
                label="Fee decay duration"
                name="feeDecayDurationPreset"
                value={lbpConfig.feeDecayDurationPreset || ""}
                onChange={onLbpConfigChange}
                options={[
                  { value: "0", label: "10 minutes" },
                  { value: "1", label: "15 minutes" },
                  { value: "2", label: "30 minutes" },
                ]}
              />
            </div>
          </div>

          <Input
            label="Swap fee"
            name="poolSwapFee"
            value={lbpConfig.poolSwapFee}
            onChange={onLbpConfigChange}
            placeholder="0.003"
          />
          <Input
            label="Vesting cliff duration"
            name="vestingCliffDuration"
            value={lbpConfig.vestingCliffDuration}
            onChange={onLbpConfigChange}
            placeholder="0"
          />
          <Input
            label="Vesting duration"
            name="vestingFinalDuration"
            value={lbpConfig.vestingFinalDuration}
            onChange={onLbpConfigChange}
            placeholder="2592000"
          />
          <Input
            label="Cliff percent (BPS)"
            name="vestingCliffPercentBP"
            value={lbpConfig.vestingCliffPercentBP}
            onChange={onLbpConfigChange}
            placeholder="0"
          />
          <Input
            label="Max contribution per address (ETH)"
            name="maxContributionPerAddress"
            value={lbpConfig.maxContributionPerAddress || ""}
            onChange={onLbpConfigChange}
            placeholder="5"
            type="number"
          />
        </div>
      </div>
    </div>
  );
};

export default AuctionControls;

