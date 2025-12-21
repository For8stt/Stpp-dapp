import React from "react";
import { formatTimeRemaining } from "./vesting.utils";

const VestingConfig = ({
  vestingConfigured,
  vestingStart,
  vestingCliffDuration,
  vestingFinalDuration,
  vestingCliffPercentBP,
}) => {
  if (!vestingConfigured) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-8 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2)] backdrop-blur-[12px] backdrop-saturate-[180%]">
      <h2 className="mb-6 bg-gradient-to-br from-white to-slate-300 bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Vesting Configuration</h2>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg bg-slate-700/30 p-4">
          <span className="font-semibold text-slate-400">Vesting Start:</span>
          <span className="font-bold text-white">
            {new Date(vestingStart * 1000).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-700/30 p-4">
          <span className="font-semibold text-slate-400">Cliff Duration:</span>
          <span className="font-bold text-white">
            {formatTimeRemaining(vestingCliffDuration)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-700/30 p-4">
          <span className="font-semibold text-slate-400">Final Duration:</span>
          <span className="font-bold text-white">
            {formatTimeRemaining(vestingFinalDuration)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-700/30 p-4">
          <span className="font-semibold text-slate-400">Cliff Percent:</span>
          <span className="font-bold text-white">
            {(vestingCliffPercentBP / 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default VestingConfig;



