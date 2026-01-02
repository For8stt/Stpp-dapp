import React from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { formatTime, shortenAddress } from "../../utils/formatUtils";

const LBPHeader = ({ lbpAddress, lbpData, status, timeUntilEnd, timeUntilPauseEnd }) => {
  const statusBadgeStyles = {
    Active: "bg-[rgba(34,197,94,0.2)] text-[rgb(74,222,128)] border-[rgba(34,197,94,0.5)]",
    Finalized: "bg-[rgba(59,130,246,0.2)] text-[rgb(96,165,250)] border-[rgba(59,130,246,0.5)]",
    Paused: "bg-[rgba(234,179,8,0.2)] text-[rgb(250,204,21)] border-[rgba(234,179,8,0.5)]",
  };
  
  const statusDotStyles = {
    Active: "bg-[rgb(74,222,128)]",
    Finalized: "bg-[rgb(96,165,250)]",
    Paused: "bg-[rgb(250,204,21)]",
  };
  
  const statusBadgeClass = statusBadgeStyles[status] || "bg-[rgba(100,116,139,0.2)] text-[rgb(148,163,184)] border-[rgba(100,116,139,0.5)]";
  const statusDotClass = statusDotStyles[status] || "bg-[rgb(148,163,184)]";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(34,197,94,0.8)] before:via-[rgba(6,182,212,0.8)] before:to-[rgba(34,197,94,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-2 bg-gradient-to-br from-white to-[#a0aec0] bg-clip-text text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">
            Liquidity Bootstrapping Pool
          </h1>
          <p className="text-[0.95rem] font-medium text-[rgb(148,163,184)]">
            LBP: {shortenAddress(lbpAddress)}
          </p>
        </div>
        <div className={`relative flex items-center gap-2.5 overflow-hidden rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${statusBadgeClass} before:absolute before:left-[-100%] before:top-0 before:h-full before:w-full before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.1)] before:to-transparent before:transition-all before:duration-500 hover:before:left-[100%]`}>
          <span className={`relative z-10 h-2.5 w-2.5 animate-pulse rounded-full shadow-[0_0_8px_currentColor] ${statusDotClass}`}></span>
          <span className="relative z-10 font-semibold">{status}</span>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-4">
        {lbpData.auction && lbpData.auction !== ethers.ZeroAddress && (
          <Link
            to={`/presale/${lbpData.presaleManager}/auction`}
            className="relative inline-block rounded-lg px-4 py-2 font-medium text-[rgb(74,222,128)] no-underline transition-all duration-300 after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-0 after:-translate-x-1/2 after:bg-gradient-to-r after:from-[rgb(74,222,128)] after:to-[rgb(6,182,212)] after:transition-all after:duration-300 hover:bg-[rgba(74,222,128,0.1)] hover:text-[rgb(147,197,253)] hover:after:w-4/5"
          >
            ← Back to Auction
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">LBP Contract</h3>
          <p className="relative z-10 break-all font-mono text-sm font-medium text-white">{lbpAddress}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Presale Manager</h3>
          <p className="relative z-10 break-all font-mono text-sm font-medium text-white">
            {shortenAddress(lbpData.presaleManager)}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Sale Token</h3>
          <p className="relative z-10 text-base font-bold text-white">
            {lbpData.tokenInfo?.symbol || "N/A"}
          </p>
          <p className="relative z-10 mt-1.5 font-mono text-xs text-[rgba(148,163,184,0.8)]">
            {shortenAddress(lbpData.token)}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Trading Token</h3>
          <p className="relative z-10 text-base font-bold text-white">ETH</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Start Time</h3>
          <p className="relative z-10 break-all font-mono text-sm font-medium text-white">{formatTime(lbpData.startTime)}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">End Time</h3>
          <p className="relative z-10 break-all font-mono text-sm font-medium text-white">{formatTime(lbpData.endTime)}</p>
        </div>
        {timeUntilEnd && (
          <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-5 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
            <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Time Until End</h3>
            <p className="relative z-10 text-base font-bold text-white">
              {timeUntilEnd.hours}h {timeUntilEnd.minutes}m
            </p>
          </div>
        )}
        <div className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 ${
          timeUntilPauseEnd 
            ? "border-[rgba(239,68,68,0.5)] bg-gradient-to-br from-[rgba(239,68,68,0.2)] to-[rgba(220,38,38,0.1)]" 
            : "border-[rgba(71,85,105,0.3)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)]"
        } before:absolute before:inset-0 before:bg-gradient-to-br before:from-[rgba(34,197,94,0.05)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-[rgba(71,85,105,0.6)] hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100`}>
          <h3 className="relative z-10 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Oracle Pause</h3>
          {timeUntilPauseEnd ? (
            <p className="relative z-10 flex items-center gap-2 text-sm font-bold text-[rgb(239,68,68)]">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Yes
            </p>
          ) : (
            <p className="relative z-10 break-all font-mono text-sm font-medium text-white">No</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LBPHeader;

