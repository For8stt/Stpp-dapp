import React from "react";
import { toDate } from "../../utils/auctionUtils";

const AuctionTimeline = React.memo(({ auctionData, phase }) => {
  if (!auctionData) return null;

  const progressWidth = phase === "Finalized" ? "100%" : phase === "Reveal" ? "66%" : phase === "Commit" ? "33%" : "0%";
  const progressColor = phase === "Commit" 
    ? "bg-gradient-to-r from-[rgb(59,130,246)] to-[rgb(96,165,250)]"
    : phase === "Reveal"
    ? "bg-gradient-to-r from-[rgb(59,130,246)] to-[rgb(147,51,234)]"
    : "bg-gradient-to-r from-[rgb(59,130,246)] to-[rgb(16,185,129)]";

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-xl font-bold text-white">Auction Timeline</p>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-base font-semibold text-white">Commit Phase</p>
            <p className="font-mono text-sm text-[rgba(255,255,255,0.7)]">{toDate(auctionData.startTime)}</p>
            <p className="font-mono text-sm text-[rgba(255,255,255,0.7)]">{toDate(auctionData.commitEndTime)}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-base font-semibold text-white">Reveal Phase</p>
            <p className="font-mono text-sm text-[rgba(255,255,255,0.7)]">{toDate(auctionData.commitEndTime)}</p>
            <p className="font-mono text-sm text-[rgba(255,255,255,0.7)]">{toDate(auctionData.revealEndTime)}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-base font-semibold text-white">Finalization</p>
            <p className="font-mono text-sm text-[rgba(255,255,255,0.7)]">{toDate(auctionData.revealEndTime)}</p>
          </div>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded bg-[rgba(255,255,255,0.1)]">
          <div
            className={`h-full transition-all duration-500 ${progressColor}`}
            style={{ width: progressWidth }}
          />
        </div>
      </div>
    </div>
  );
});

AuctionTimeline.displayName = 'AuctionTimeline';

export default AuctionTimeline;

