import React from "react";
import { formatToken, formatTokenRounded, formatTimeRemaining } from "./vesting.utils";

const VestingTimeline = ({
  vestingConfigured,
  progressPercent,
  userVested,
  userAllocation,
  tokenSymbol,
  tokenDecimals,
  cliffProgress,
  timeUntilCliff,
  cliffTime,
  currentTime,
  finalProgress,
  timeUntilFinal,
  finalTime,
  vestingFinalDuration,
}) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-8 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2)] backdrop-blur-[12px] backdrop-saturate-[180%] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-green-500/80 before:via-cyan-500/80 before:to-green-500/80 before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="mb-6 bg-gradient-to-br from-white to-slate-300 bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Vesting Progress</h2>

      <div className="mb-8 last:mb-0">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.9375rem] font-semibold text-slate-200">Overall Vesting</span>
          <span className="text-[0.9375rem] font-bold text-white">{progressPercent.toFixed(2)}%</span>
        </div>
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-700/50">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-green-500/80 to-cyan-500/80 transition-[width] duration-500 ease-out before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:animate-shimmer"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400/80">
          <span>{formatTokenRounded(userVested, tokenDecimals)} / {formatTokenRounded(userAllocation, tokenDecimals)} {tokenSymbol}</span>
        </div>
      </div>

      {vestingConfigured && (
        <div className="mb-8 last:mb-0">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[0.9375rem] font-semibold text-slate-200">Cliff Progress</span>
            <span className="text-[0.9375rem] font-bold text-white">
              {timeUntilCliff > 0 ? formatTimeRemaining(timeUntilCliff) : "Unlocked"}
            </span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-700/50">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-purple-500/80 to-purple-600/80 transition-[width] duration-500 ease-out before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:animate-shimmer"
              style={{ width: `${Math.min(cliffProgress, 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-400/80">
            <span>
              {currentTime >= cliffTime
                ? "Cliff unlocked"
                : `Cliff unlocks: ${new Date(cliffTime * 1000).toLocaleString()}`}
            </span>
          </div>
        </div>
      )}

      {vestingConfigured && vestingFinalDuration > 0 && (
        <div className="mb-8 last:mb-0">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[0.9375rem] font-semibold text-slate-200">Full Unlock Progress</span>
            <span className="text-[0.9375rem] font-bold text-white">
              {timeUntilFinal > 0 ? formatTimeRemaining(timeUntilFinal) : "Fully Unlocked"}
            </span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-700/50">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-cyan-500/80 to-green-500/80 transition-[width] duration-500 ease-out before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:animate-shimmer"
              style={{ width: `${Math.min(finalProgress, 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-400/80">
            <span>
              {currentTime >= finalTime
                ? "Fully unlocked"
                : `Full unlock: ${new Date(finalTime * 1000).toLocaleString()}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VestingTimeline;



