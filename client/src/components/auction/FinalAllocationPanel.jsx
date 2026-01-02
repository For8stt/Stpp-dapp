import React, { useMemo } from "react";
import { formatEth, formatToken, formatTokenUnits } from "../../utils/auctionUtils";

const FinalAllocationPanel = ({ auctionData, userData }) => {
  const allocation = userData?.allocation;
  const refundAmount = useMemo(() => {
    if (!userData?.revealedDeposit || !allocation?.paymentDue) return 0n;
    const deposit = BigInt(userData.revealedDeposit);
    const payment = BigInt(allocation.paymentDue);
    return deposit > payment ? deposit - payment : 0n;
  }, [userData?.revealedDeposit, allocation?.paymentDue]);

  if (!auctionData || !auctionData.finalized) {
    return null;
  }

  if (!allocation || !allocation.computed) {
    return null;
  }

  const totalTokens = (allocation.totalQty || 0n) + (allocation.bonusQty || 0n);
  const revealedQty = userData?.revealedQty || 0n;
  const allocatedQty = allocation.totalQty || 0n;

  if (totalTokens === 0n && refundAmount === 0n) {
    return null;
  }

  const wasProRated = revealedQty > allocatedQty;
  const wasFullyAllocated = revealedQty === allocatedQty && revealedQty > 0n;
  const wasZeroAllocated = revealedQty > 0n && allocatedQty === 0n;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(16,185,129,0.3)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-2xl font-bold text-[rgb(110,231,183)]">Your Final Allocation</p>
      
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Revealed Quantity</p>
          <p className="font-mono text-xl font-bold text-white">{formatTokenUnits(revealedQty)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Allocated Quantity</p>
          <p className="font-mono text-xl font-bold text-[rgb(110,231,183)]">{formatTokenUnits(allocatedQty)}</p>
        </div>
        {allocation.bonusQty > 0n && (
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Bonus Tokens</p>
            <p className="font-mono text-xl font-bold text-[rgb(251,191,36)]">{formatTokenUnits(allocation.bonusQty)}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Tokens</p>
          <p className="font-mono text-xl font-bold text-[rgb(110,231,183)]">{formatTokenUnits(totalTokens)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Payment Due</p>
          <p className="font-mono text-xl font-bold text-white">{formatEth(allocation.paymentDue || 0n)} ETH</p>
        </div>
        {refundAmount > 0n && (
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Refund Amount</p>
            <p className="font-mono text-xl font-bold text-[rgb(110,231,183)]">{formatEth(refundAmount)} ETH</p>
          </div>
        )}
      </div>

      {/* Explanation text */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4">
        {wasProRated && (
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            <span className="font-semibold text-[rgb(251,191,36)]">Pro-rata allocation applied:</span> Your bid was at the clearing price tick. 
            You received {formatTokenUnits(allocatedQty)} tokens out of {formatTokenUnits(revealedQty)} requested, 
            based on the pro-rata distribution at the clearing price.
          </p>
        )}
        {wasFullyAllocated && (
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            <span className="font-semibold text-[rgb(110,231,183)]">Full allocation:</span> Your bid was above the clearing price, 
            so you received your full requested quantity of {formatTokenUnits(allocatedQty)} tokens.
          </p>
        )}
        {wasZeroAllocated && (
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            <span className="font-semibold text-[rgb(239,68,68)]">No allocation:</span> Your bid was below the clearing price, 
            so you did not receive any tokens. Your deposit will be fully refunded.
          </p>
        )}
        {allocation.bonusQty > 0n && (
          <p className="mt-2 text-sm text-[rgba(255,255,255,0.8)]">
            <span className="font-semibold text-[rgb(251,191,36)]">Early bonus:</span> You received {formatTokenUnits(allocation.bonusQty)} bonus tokens 
            for participating early in the auction.
          </p>
        )}
        {refundAmount > 0n && (
          <p className="mt-2 text-sm text-[rgba(255,255,255,0.8)]">
            <span className="font-semibold text-[rgb(110,231,183)]">Refund:</span> You deposited {formatEth(userData?.revealedDeposit || 0n)} ETH 
            but only needed to pay {formatEth(allocation.paymentDue || 0n)} ETH. 
            The excess of {formatEth(refundAmount)} ETH will be refunded when you claim.
          </p>
        )}
      </div>
    </div>
  );
};

export default FinalAllocationPanel;

