import React from "react";
import PhaseBadge from "./PhaseBadge";

const AuctionHeader = React.memo(({ address, auctionAddress, auctionData, phase, countdown }) => {
  return (
    <div className="relative mb-8 overflow-hidden rounded-[2rem] border border-[rgba(255,255,255,0.12)] bg-gradient-to-br from-[rgba(15,23,42,0.95)] to-[rgba(30,41,59,0.95)] p-8 shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(99,102,241,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[rgba(99,102,241,0.3)] before:to-transparent hover:border-[rgba(255,255,255,0.2)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Presale Manager</p>
          <h1 className="mb-4 font-mono text-[1.75rem] font-bold leading-tight text-white break-all">{address}</h1>
          <div className="flex flex-col gap-2 text-sm text-[rgba(255,255,255,0.6)]">
            <div className="flex gap-2">
              <span className="text-[rgba(255,255,255,0.7)]">Auction:</span>
              <span className="font-mono text-white">{auctionAddress}</span>
            </div>
            {auctionData && (
              <>
                <div className="flex gap-2">
                  <span className="text-[rgba(255,255,255,0.7)]">Sale Token:</span>
                  <span className="font-mono text-white">{auctionData.tokenSymbol} ({auctionData.saleToken.slice(0, 10)}...)</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[rgba(255,255,255,0.7)]">Treasury:</span>
                  <span className="font-mono text-white">{auctionData.treasury}</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:items-end sm:gap-4">
          <PhaseBadge phase={phase} countdown={countdown} />
        </div>
      </div>
    </div>
  );
});

AuctionHeader.displayName = 'AuctionHeader';

export default AuctionHeader;

