import React from "react";
import { ethers } from "ethers";
import { formatEth } from "../../utils/auctionUtils";

const ReservePanel = React.memo(({ auctionData, onDemandCheck, isOwner }) => {
  if (!auctionData || auctionData.thresholdLow <= 0n) return null;
  if (!isOwner) return null;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-xl font-bold text-white">Dynamic Reserve Automation</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Demand Check Time</p>
          <p className="text-xs text-white/70 leading-relaxed">Can be triggered by owner or Chainlink Keepers (automated). Time stored in UpkeepController.</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Adjustments Triggered</p>
          <p className="font-mono text-lg font-semibold text-white">{auctionData.dynamicAdjustmentCount}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Current Decay Multiplier</p>
          <p className="font-mono text-lg font-semibold text-white">{formatEth(auctionData.decayMultiplier)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Threshold Low</p>
          <p className="font-mono text-lg font-semibold text-white">{formatEth(auctionData.thresholdLow || 0n)} ETH</p>
        </div>
        {process.env.NODE_ENV === "development" && onDemandCheck && isOwner && (
          <div className="col-span-2">
            <button
              onClick={onDemandCheck}
              className="w-full rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.2)] px-6 py-3 font-semibold text-[rgb(251,191,36)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(245,158,11,0.6)] hover:bg-[rgba(245,158,11,0.3)]"
            >
              Trigger Demand Check (Dev Only)
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

ReservePanel.displayName = 'ReservePanel';

export default ReservePanel;

