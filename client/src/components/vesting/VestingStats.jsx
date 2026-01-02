import React from "react";
import { formatTokenRounded } from "./vesting.utils";

const VestingStats = ({
  userAllocation,
  userVested,
  userClaimed,
  userClaimable,
  tokenSymbol,
  tokenDecimals,
  progressPercent,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/15 to-blue-600/8 p-6 shadow-[0_4px_15px_-3px_rgba(59,130,246,0.2)] backdrop-blur-md transition-all hover:translate-y-[-4px] hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <h4 className="relative z-10 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Total Allocation</h4>
        <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)] break-words">
          {formatTokenRounded(userAllocation, tokenDecimals)} {tokenSymbol}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/15 to-green-600/8 p-6 shadow-[0_4px_15px_-3px_rgba(34,197,94,0.2)] backdrop-blur-md transition-all hover:translate-y-[-4px] hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <h4 className="relative z-10 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Vested Amount</h4>
        <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)] break-words">
          {formatTokenRounded(userVested, tokenDecimals)} {tokenSymbol}
        </p>
        <p className="relative z-10 mt-2 text-xs text-slate-400/80">
          {progressPercent.toFixed(2)}% of allocation
        </p>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/15 to-purple-600/8 p-6 shadow-[0_4px_15px_-3px_rgba(168,85,247,0.2)] backdrop-blur-md transition-all hover:translate-y-[-4px] hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <h4 className="relative z-10 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Claimed Amount</h4>
        <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)] break-words">
          {formatTokenRounded(userClaimed, tokenDecimals)} {tokenSymbol}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/15 to-cyan-600/8 p-6 shadow-[0_4px_15px_-3px_rgba(6,182,212,0.2)] backdrop-blur-md transition-all hover:translate-y-[-4px] hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <h4 className="relative z-10 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Available to Claim</h4>
        <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)] break-words">
          {formatTokenRounded(userClaimable || 0n, tokenDecimals)} {tokenSymbol}
        </p>
      </div>
    </div>
  );
};

export default VestingStats;




