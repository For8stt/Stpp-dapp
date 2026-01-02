import React from "react";
import { formatEth, formatToken, formatTokenUnits } from "../../utils/auctionUtils";

const AuctionStatusGrid = React.memo(({ auctionData }) => {
  if (!auctionData) return null;

  return (
    <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
        <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Tokens for Sale</p>
        <p className="font-mono text-2xl font-bold text-white">{formatToken(auctionData.tokensForSale)}</p>
      </div>
      <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
        <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Committed</p>
        <p className="font-mono text-2xl font-bold text-white">{formatEth(auctionData.totalDepositCommitted)} ETH</p>
      </div>
      <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
        <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Revealed Qty</p>
        <p className="font-mono text-2xl font-bold text-white">{formatTokenUnits(auctionData.totalQtyRevealed)}</p>
      </div>
      <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
        <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Revealed Deposit</p>
        <p className="font-mono text-2xl font-bold text-white">{formatEth(auctionData.totalDepositsRevealed)} ETH</p>
      </div>
      <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
        <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Bonus Reserve Remaining</p>
        <p className="font-mono text-2xl font-bold text-white">{formatToken(auctionData.bonusReserveRemaining)}</p>
      </div>
      <div className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 ${
        auctionData.finalized && !auctionData.successful
          ? 'border-[rgba(239,68,68,0.6)] bg-[rgba(239,68,68,0.15)] hover:border-[rgba(239,68,68,0.8)] hover:bg-[rgba(239,68,68,0.2)]'
          : 'border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]'
      }`}>
        <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Soft Cap</p>
        <p className={`font-mono text-2xl font-bold ${
          auctionData.finalized && !auctionData.successful
            ? 'text-[rgb(239,68,68)]'
            : auctionData.totalDepositsRevealed >= auctionData.softCap
            ? 'text-[rgb(110,231,183)]'
            : 'text-white'
        }`}>
          {formatEth(auctionData.softCap)}
          {auctionData.totalDepositsRevealed >= auctionData.softCap && !(auctionData.finalized && !auctionData.successful) && (
            <span className="ml-2">Reached</span>
          )}
          {auctionData.finalized && !auctionData.successful && (
            <span className="ml-2 text-[rgb(239,68,68)]">Not Met</span>
          )}
        </p>
      </div>
      {auctionData.finalized && (
        <>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
            <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Clearing Price</p>
            <p className="font-mono text-2xl font-bold text-white">{formatEth(auctionData.clearingPrice)} ETH</p>
          </div>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
            <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Tokens Sold</p>
            <p className="font-mono text-2xl font-bold text-white">{formatTokenUnits(auctionData.tokensSold)}</p>
          </div>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.8)]">
            <p className="mb-2 text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Raised</p>
            <p className="font-mono text-2xl font-bold text-white">{formatEth(auctionData.totalRaised)} ETH</p>
          </div>
        </>
      )}
    </div>
  );
});

AuctionStatusGrid.displayName = 'AuctionStatusGrid';

export default AuctionStatusGrid;

