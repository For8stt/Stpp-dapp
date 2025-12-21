import React from "react";

const VestingError = ({ error, onRetry }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <div className="relative max-w-md overflow-hidden rounded-2xl border border-red-500/50 bg-gradient-to-br from-red-500/15 to-red-600/10 p-8 shadow-none backdrop-filter-none before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-red-500/80 before:via-red-400/80 before:to-red-500/80 before:bg-[length:200%_100%] before:animate-shimmer">
        <h2 className="mb-4 text-2xl font-bold text-white">Error Loading Vesting Data</h2>
        <p className="mb-6 text-white/80">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg border border-red-500/50 bg-gradient-to-br from-red-500/20 to-red-600/10 px-6 py-3 font-semibold text-white transition-all hover:translate-y-[-2px] hover:bg-gradient-to-br hover:from-red-500/30 hover:to-red-600/20 hover:shadow-[0_10px_15px_-3px_rgba(239,68,68,0.3)]"
        >
          Retry
        </button>
      </div>
    </div>
  );
};

export default VestingError;






