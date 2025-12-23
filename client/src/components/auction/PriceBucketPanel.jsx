import React from "react";
import { formatEth, formatTokenUnits } from "../../utils/auctionUtils";

const PriceBucketPanel = React.memo(({ auctionData, priceBuckets }) => {
  if (!auctionData?.priceTicks || auctionData.priceTicks.length === 0) return null;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-xl font-bold text-white">Price Bucket Demand</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
        {auctionData.priceTicks.map((tick, idx) => {
          const bucket = priceBuckets.find(b => b.index === idx) || { index: idx, price: tick, total: 0n };
          const maxDemand = priceBuckets.length > 0 
            ? Math.max(...priceBuckets.map(b => Number(b.total)), 1) 
            : 1;
          const height = maxDemand > 0 ? (Number(bucket.total) / maxDemand) * 100 : 0;
          const isClearing = auctionData.finalized && idx === auctionData.clearingTickIndex;
          const isUserBucket = false;
          
          const barClass = isClearing
            ? "bg-gradient-to-t from-[rgb(16,185,129)] to-[rgb(52,211,153)] shadow-[0_0_20px_rgba(16,185,129,0.5)]"
            : isUserBucket
            ? "bg-gradient-to-t from-[rgb(34,197,94)] to-[rgb(74,222,128)]"
            : bucket.total > 0n
            ? "bg-gradient-to-t from-[rgb(59,130,246)] to-[rgb(96,165,250)]"
            : "bg-[rgba(255,255,255,0.1)]";
          
          return (
            <div key={idx} className="flex flex-col gap-2">
              <div className="text-center text-xs font-semibold text-[rgba(255,255,255,0.7)]">Tick #{idx}</div>
              <div className="flex flex-col gap-2">
                <div className="relative flex h-[200px] items-end justify-center rounded-lg bg-[rgba(255,255,255,0.05)] p-2">
                  <div
                    className={`relative w-full rounded transition-all duration-300 ${barClass}`}
                    style={{ 
                      height: `${Math.max(height, 2)}%`,
                      minHeight: bucket.total > 0n ? "8px" : "2px"
                    }}
                  >
                    {bucket.total > 0n && (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-white text-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                        {formatTokenUnits(bucket.total)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center font-mono text-sm text-[rgba(255,255,255,0.8)]">
                  {formatEth(bucket.price)} ETH
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {auctionData.finalized && (
        <p className="mt-4 text-sm text-[rgba(255,255,255,0.7)]">
          Clearing Price: <span className="font-semibold text-[rgb(110,231,183)]">{formatEth(auctionData.clearingPrice)} ETH</span> (Tick #{auctionData.clearingTickIndex})
        </p>
      )}
      {priceBuckets.length === 0 && (
        <p className="mt-4 text-sm italic text-[rgba(255,255,255,0.5)]">
          No demand data available yet. Commits will appear here once users start committing bids.
        </p>
      )}
    </div>
  );
});

PriceBucketPanel.displayName = 'PriceBucketPanel';

export default PriceBucketPanel;

