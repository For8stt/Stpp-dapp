import React from "react";
import { formatEth, formatToken, formatTokenUnits } from "../../utils/auctionUtils";

const AllocationPanel = React.memo(({ userData }) => {
  if (!userData || userData.revealedQty <= 0n) return null;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-xl font-bold text-white">Your Allocation Preview</p>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Estimated Allocation</p>
          <p className="font-mono text-2xl font-bold text-white">{formatTokenUnits(userData.revealedQty)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Estimated Payment</p>
          <p className="font-mono text-2xl font-bold text-white">{formatEth(userData.revealedDeposit)} ETH</p>
        </div>
      </div>
      <p className="text-sm italic text-[rgba(255,255,255,0.6)]">
        * Final allocation will be determined after auction finalization
      </p>
    </div>
  );
});

AllocationPanel.displayName = 'AllocationPanel';

export default AllocationPanel;

