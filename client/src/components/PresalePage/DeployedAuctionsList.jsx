import React from "react";

const DeployedAuctionsList = ({ auctions }) => {
  if (auctions.length === 0) return null;

  return (
    <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
      <p className="mb-5 flex items-center gap-2 text-lg font-semibold text-white">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Deployed auctions
      </p>
      <ul className="m-0 flex flex-col gap-3.5 p-0 list-none">
        {auctions.map((auctionAddress) => (
          <li 
            key={auctionAddress}
            className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-4 font-mono text-sm text-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:translate-x-1 hover:border-white/12 hover:bg-gradient-to-br hover:from-slate-900/95 hover:to-slate-800/75 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-gradient-to-b before:from-indigo-500/80 before:to-green-500/80 before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100"
          >
            {auctionAddress}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DeployedAuctionsList;

