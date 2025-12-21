import React from "react";
import { formatToken } from "./vesting.utils";

const ClaimPanel = ({
  userClaimable,
  tokenSymbol,
  tokenDecimals,
  canClaim,
  isPending,
  onClaim,
}) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-8 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2)] backdrop-blur-[12px] backdrop-saturate-[180%] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-green-500/80 before:via-cyan-500/80 before:to-green-500/80 before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="mb-6 bg-gradient-to-br from-white to-slate-300 bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Claim Tokens</h2>
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="min-w-[200px] flex-1">
          <p className="mb-2 text-sm font-semibold text-slate-400">Available to Claim:</p>
          <p className="text-2xl font-extrabold text-white">
            {formatToken(userClaimable, tokenDecimals)} {tokenSymbol}
          </p>
        </div>
        <button
          onClick={onClaim}
          disabled={!canClaim || isPending}
          className={`min-w-[180px] rounded-xl border-0 px-8 py-4 text-base font-bold text-white transition-all ${
            !canClaim || isPending
              ? "cursor-not-allowed bg-emerald-300/50 opacity-50"
              : "bg-emerald-300 hover:translate-y-[-2px] hover:bg-emerald-400 hover:shadow-[0_10px_15px_-3px_rgba(16,185,129,0.4)] active:translate-y-0 active:bg-emerald-300"
          }`}
        >
          {isPending ? "Claiming…" : "Claim Tokens"}
        </button>
      </div>
    </div>
  );
};

export default ClaimPanel;




