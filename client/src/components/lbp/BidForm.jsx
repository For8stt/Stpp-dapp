import React from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const BidForm = ({
  lbpData,
  bidForm,
  handleBidFormChange,
  handlePlaceBid,
  isPending,
  account,
  timeUntilPauseEnd,
}) => {
  const { isConnected } = useAccount();
  const isPaused = lbpData?.oraclePaused || lbpData?.paused;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(34,197,94,0.8)] before:via-[rgba(6,182,212,0.8)] before:to-[rgba(34,197,94,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="relative z-10 mb-8 bg-gradient-to-br from-white to-[#cbd5e1] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Place Bid</h2>
      <div className="relative z-10 flex max-w-[28rem] flex-col gap-4">
        <div className="flex flex-col">
          <label className="mb-2.5 block text-sm font-semibold tracking-wide text-[rgb(203,213,225)]">
            ETH Amount
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={bidForm.ethAmount}
            onChange={(e) => handleBidFormChange("ethAmount", e.target.value)}
            placeholder="0.0"
            className="w-full rounded-xl border border-[rgba(71,85,105,0.5)] bg-[rgba(51,65,85,0.6)] px-5 py-3.5 text-[0.9375rem] font-medium text-white transition-all duration-300 placeholder:text-[rgba(148,163,184,0.6)] focus:border-[rgba(34,197,94,0.6)] focus:bg-[rgba(51,65,85,0.8)] focus:outline-none focus:ring-2 focus:ring-[rgba(34,197,94,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isConnected}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-2.5 block text-sm font-semibold tracking-wide text-[rgb(203,213,225)]">
            Slippage Tolerance (%)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={bidForm.slippage}
            onChange={(e) => handleBidFormChange("slippage", e.target.value)}
            placeholder="1"
            className="w-full rounded-xl border border-[rgba(71,85,105,0.5)] bg-[rgba(51,65,85,0.6)] px-5 py-3.5 text-[0.9375rem] font-medium text-white transition-all duration-300 placeholder:text-[rgba(148,163,184,0.6)] focus:border-[rgba(34,197,94,0.6)] focus:bg-[rgba(51,65,85,0.8)] focus:outline-none focus:ring-2 focus:ring-[rgba(34,197,94,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isConnected}
          />
        </div>
        {bidForm.minTokensOut && (
          <div className="relative overflow-hidden rounded-xl border border-[rgba(34,197,94,0.4)] bg-gradient-to-br from-[rgba(34,197,94,0.15)] to-[rgba(22,163,74,0.1)] p-5 shadow-[0_4px_15px_-3px_rgba(34,197,94,0.2)] transition-all duration-300 before:absolute before:left-[-100%] before:top-0 before:h-full before:w-full before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.1)] before:to-transparent before:transition-all before:duration-500 hover:before:left-[100%]">
            <p className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgba(203,213,225,0.9)]">
              Expected Tokens (min):
            </p>
            <p className="relative z-10 text-[1.75rem] font-extrabold leading-tight text-[rgb(74,222,128)] text-shadow-[0_2px_8px_rgba(34,197,94,0.3)]">
              {bidForm.minTokensOut} {lbpData.tokenInfo?.symbol || "tokens"}
            </p>
          </div>
        )}
        {isPaused && timeUntilPauseEnd && (
          <div className="mt-4 rounded-lg border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.15)] p-4">
            <p className="mb-2 text-center text-sm font-semibold text-[rgb(239,68,68)]">
              ⛔ Trading Paused by Oracle
            </p>
            <p className="text-center text-xs text-white">
              Trading will resume in: {timeUntilPauseEnd.minutes}m {timeUntilPauseEnd.seconds}s
            </p>
            <p className="mt-2 text-center text-xs text-[rgba(255,255,255,0.7)]">
              Oracle detected rapid price movement. Please wait for the pause to end.
            </p>
          </div>
        )}
        {!isConnected ? (
          <div className="mt-4 rounded-lg border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
            <p className="mb-3 text-center text-[rgba(255,255,255,0.9)]">
              Connect wallet to place a bid
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <button
            onClick={handlePlaceBid}
            disabled={
              isPaused ||
              !bidForm.ethAmount ||
              !bidForm.minTokensOut ||
              isPending ||
              !account
            }
            className={`relative w-full overflow-hidden rounded-xl border-0 px-6 py-4 text-base font-bold uppercase tracking-wider text-white transition-all duration-300 ${
              isPaused ||
              isPending ||
              !bidForm.ethAmount ||
              !bidForm.minTokensOut ||
              !account
                ? "cursor-not-allowed bg-gradient-to-br from-[rgba(71,85,105,0.6)] to-[rgba(51,65,85,0.6)] opacity-60 shadow-none"
                : "bg-gradient-to-br from-[rgb(34,197,94)] to-[rgb(6,182,212)] shadow-[0_10px_20px_-5px_rgba(34,197,94,0.4),0_4px_6px_-2px_rgba(0,0,0,0.2)] before:absolute before:left-[-100%] before:top-0 before:h-full before:w-full before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.2)] before:to-transparent before:transition-all before:duration-500 hover:-translate-y-1 hover:scale-[1.02] hover:bg-gradient-to-br hover:from-[rgb(22,163,74)] hover:to-[rgb(8,145,178)] hover:shadow-[0_20px_30px_-5px_rgba(34,197,94,0.5),0_10px_15px_-3px_rgba(0,0,0,0.3)] hover:before:left-[100%] active:translate-y-0 active:scale-100"
            }`}
          >
            {isPending ? "Placing Bid..." : "Place Bid"}
          </button>
        )}
      </div>
    </div>
  );
};

export default BidForm;

