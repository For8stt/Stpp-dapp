import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Contract, ethers } from "ethers";
import { BrowserProvider } from "ethers";
import allAbis from "../../abi/allAbis.json";
import { useTime } from "../../time/useTime";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PresaleCard = ({ presale }) => {
  const { currentTime } = useTime();
  const [vestingCompleted, setVestingCompleted] = useState(false);

  const shortenAddress = (address) => {
    if (!address) return "—";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  useEffect(() => {
    const checkVestingCompleted = async () => {
      if (!presale.lbp || presale.lbp === ZERO_ADDRESS || !presale.lbpFinalized) {
        setVestingCompleted(false);
        return;
      }

      try {
        if (typeof window === "undefined" || !window.ethereum) {
          return;
        }

        const provider = new BrowserProvider(window.ethereum);
        const secureLBPAbi = Array.isArray(allAbis.SecureLBP) 
          ? allAbis.SecureLBP 
          : (allAbis.SecureLBP?.abi || allAbis.SecureLBP);
        
        if (!secureLBPAbi || secureLBPAbi.length === 0) {
          return;
        }

        const secureLBPContract = new Contract(presale.lbp, secureLBPAbi, provider);
        
        const [vestingConfigured, vestingStart, vestingFinalDuration] = await Promise.all([
          secureLBPContract.vestingConfigured().catch(() => false),
          secureLBPContract.vestingStart().catch(() => 0n),
          secureLBPContract.vestingFinalDuration().catch(() => 0n),
        ]);

        if (vestingConfigured && vestingStart > 0n && vestingFinalDuration > 0n) {
          const finalTime = Number(vestingStart) + Number(vestingFinalDuration);
          const isCompleted = currentTime >= finalTime;
          setVestingCompleted(isCompleted);
        } else {
          setVestingCompleted(false);
        }
      } catch (error) {
        console.warn("Failed to check vesting completion:", error);
        setVestingCompleted(false);
      }
    };

    checkVestingCompleted();
  }, [presale.lbp, presale.lbpFinalized, currentTime]);

  const statusConfig = {
    completed: {
      bgClass: 'bg-[rgba(107,114,128,0.15)]',
      borderClass: 'border-[rgba(107,114,128,0.3)]',
      textClass: 'text-[#d1d5db]',
      icon: '●',
      text: 'Completed'
    },
    vesting: {
      bgClass: 'bg-[rgba(249,115,22,0.15)]',
      borderClass: 'border-[rgba(249,115,22,0.3)]',
      textClass: 'text-[#fed7aa]',
      icon: '●',
      text: 'Vesting'
    },
    lbp: {
      bgClass: "bg-[rgba(59,130,246,0.15)]",
      borderClass: "border-[rgba(59,130,246,0.3)]",
      textClass: "text-[#bfdbfe]",
      icon: "●",
      text: "LBP",
    },
    finalized: {
      bgClass: 'bg-[rgba(34,197,94,0.15)]',
      borderClass: 'border-[rgba(34,197,94,0.3)]',
      textClass: 'text-[#bbf7d0]',
      icon: '●',
      text: 'Finalized'
    },
    active: {
      bgClass: 'bg-[rgba(245,158,11,0.15)]',
      borderClass: 'border-[rgba(245,158,11,0.3)]',
      textClass: 'text-[#fed7aa]',
      icon: '●',
      text: 'Active'
    }
  };

  const hasLBP = presale.lbp && presale.lbp !== ZERO_ADDRESS;
  const currentStatus = vestingCompleted
    ? statusConfig.completed
    : presale.lbpFinalized
      ? statusConfig.vesting
      : presale.finalized
    ? hasLBP
      ? statusConfig.lbp
      : statusConfig.finalized
    : statusConfig.active;

  return (
    <div className="group relative cursor-default overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] bg-gradient-to-br from-[rgba(15,23,42,0.95)] via-[rgba(30,41,59,0.9)] to-[rgba(15,23,42,0.95)] p-6 text-white shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-[rgba(255,255,255,0.25)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[rgba(99,102,241,0.4)] before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 group-hover:before:opacity-100">
      <div className={`absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm shadow-lg ${currentStatus.bgClass} ${currentStatus.borderClass} ${currentStatus.textClass}`}>
        <span className="text-xs opacity-80">{currentStatus.icon}</span>
        <span>{currentStatus.text}</span>
      </div>

      <div className="relative z-10">
        <div className="mb-6">
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#10b981] via-[#06b6d4] to-[#0891b2] shadow-[0_8px_16px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]">
              <div className="relative h-6 w-6 rounded border border-[rgba(255,255,255,0.8)]">
                <div className="absolute left-1/2 top-1 -translate-x-1/2 h-0.5 w-3 rounded bg-[rgba(255,255,255,0.8)]"></div>
                <div className="absolute left-1 top-2 h-0.5 w-1.5 rounded bg-[rgba(255,255,255,0.8)]"></div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="mb-2 bg-gradient-to-br from-[#f8fafc] to-[#cbd5e1] bg-clip-text text-lg font-bold text-transparent">Presale Manager</h3>
              <div className="rounded-xl border border-[rgba(51,65,85,0.5)] bg-[rgba(30,41,59,0.6)] p-3 transition-all duration-200 hover:border-[rgba(51,65,85,0.7)] hover:bg-[rgba(30,41,59,0.7)]">
                <p className="font-mono text-sm leading-snug text-[#10b981] transition-colors hover:text-[#34d399]">{shortenAddress(presale.manager)}</p>
                <p className="mt-1 font-mono text-xs text-[rgba(148,163,184,0.8)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">{presale.manager}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-2 sm:grid-cols-1 sm:gap-2">
          <div className={`group/info relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
            !presale.owner ? 'bg-[rgba(30,41,59,0.3)] border-[rgba(51,65,85,0.5)]' : 'border-[rgba(59,130,246,0.15)] bg-gradient-to-br from-[rgba(59,130,246,0.08)] to-[rgba(59,130,246,0.04)]'
          }`}>
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                !presale.owner ? 'bg-[rgba(51,65,85,0.5)]' : 'bg-[rgba(59,130,246,0.15)]'
              }`}>
                <div className="h-4 w-4 rounded-full border border-current relative">
                  <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-current"></div>
                </div>
              </div>
              <h4 className={`text-sm font-semibold uppercase tracking-wider ${
                !presale.owner ? 'text-[rgba(100,116,139,0.8)]' : 'text-[rgba(59,130,246,0.9)]'
              }`}>Owner</h4>
            </div>
            <p className={`font-mono text-sm leading-snug ${
              !presale.owner ? 'text-[rgba(100,116,139,0.6)]' : 'text-[rgba(248,250,252,0.9)]'
            }`}>
              {shortenAddress(presale.owner)}
            </p>
          </div>

          <div className={`group/info relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
            !presale.auction ? 'bg-[rgba(30,41,59,0.3)] border-[rgba(51,65,85,0.5)]' : 'border-[rgba(147,51,234,0.15)] bg-gradient-to-br from-[rgba(147,51,234,0.08)] to-[rgba(147,51,234,0.04)]'
          }`}>
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                !presale.auction ? 'bg-[rgba(51,65,85,0.5)]' : 'bg-[rgba(147,51,234,0.15)]'
              }`}>
                <div className="relative h-4 w-4">
                  <div className="absolute left-1/2 top-0 h-1.5 w-3 -translate-x-1/2 rounded-t-full border border-current"></div>
                  <div className="absolute left-1/2 top-1 h-2 w-1 -translate-x-1/2 bg-current"></div>
                </div>
              </div>
              <h4 className={`text-sm font-semibold uppercase tracking-wider ${
                !presale.auction ? 'text-[rgba(100,116,139,0.8)]' : 'text-[rgba(147,51,234,0.9)]'
              }`}>Auction</h4>
            </div>
            <p className={`font-mono text-sm leading-snug ${
              !presale.auction ? 'text-[rgba(100,116,139,0.6)]' : 'text-[rgba(248,250,252,0.9)]'
            }`}>
              {presale.auction ? shortenAddress(presale.auction) : 'Not launched'}
            </p>
          </div>

          <div className={`group/info relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
            !presale.lbp ? 'bg-[rgba(30,41,59,0.3)] border-[rgba(51,65,85,0.5)]' : 'border-[rgba(6,182,212,0.15)] bg-gradient-to-br from-[rgba(6,182,212,0.08)] to-[rgba(6,182,212,0.04)]'
          }`}>
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                !presale.lbp ? 'bg-[rgba(51,65,85,0.5)]' : 'bg-[rgba(6,182,212,0.15)]'
              }`}>
                <div className="relative h-4 w-4">
                  <div className="absolute left-0 top-0 h-4 w-1 rounded-full bg-current"></div>
                  <div className="absolute right-0 top-1 h-3 w-1 rounded-full bg-current"></div>
                </div>
              </div>
              <h4 className={`text-sm font-semibold uppercase tracking-wider ${
                !presale.lbp ? 'text-[rgba(100,116,139,0.8)]' : 'text-[rgba(6,182,212,0.9)]'
              }`}>Liquidity Pool</h4>
            </div>
            <p className={`font-mono text-sm leading-snug ${
              !presale.lbp ? 'text-[rgba(100,116,139,0.6)]' : 'text-[rgba(248,250,252,0.9)]'
            }`}>
              {presale.lbp ? shortenAddress(presale.lbp) : 'Not launched'}
            </p>
          </div>

          <div className={`group/info relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
            !presale.vesting ? 'bg-[rgba(30,41,59,0.3)] border-[rgba(51,65,85,0.5)]' : 'border-[rgba(249,115,22,0.15)] bg-gradient-to-br from-[rgba(249,115,22,0.08)] to-[rgba(249,115,22,0.04)]'
          }`}>
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                !presale.vesting ? 'bg-[rgba(51,65,85,0.5)]' : 'bg-[rgba(249,115,22,0.15)]'
              }`}>
                <div className="h-4 w-4 rounded-full border border-current relative">
                  <div className="absolute left-1/2 top-1/2 h-1.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rotate-0 bg-current"></div>
                  <div className="absolute left-1/2 top-1/2 h-1 w-0.5 -translate-x-1/2 -translate-y-1/2 rotate-90 bg-current"></div>
                </div>
              </div>
              <h4 className={`text-sm font-semibold uppercase tracking-wider ${
                !presale.vesting ? 'text-[rgba(100,116,139,0.8)]' : 'text-[rgba(249,115,22,0.9)]'
              }`}>Vesting</h4>
            </div>
            <p className={`font-mono text-sm leading-snug ${
              !presale.vesting ? 'text-[rgba(100,116,139,0.6)]' : 'text-[rgba(248,250,252,0.9)]'
            }`}>
              {presale.vesting ? shortenAddress(presale.vesting) : 'Not created'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[rgba(255,255,255,0.1)] pt-4 sm:gap-2">
          {presale.auction && (
            <Link
              to={`/presale/${presale.manager}/auction`}
              className="group/btn relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-2xl border border-[rgba(147,51,234,0.3)] bg-[rgba(147,51,234,0.08)] px-6 py-3.5 text-base font-bold text-[rgba(196,181,253,0.9)] shadow-lg backdrop-blur-sm transition-all duration-300 before:absolute before:left-[-100%] before:top-0 before:h-full before:w-full before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.2)] before:to-transparent before:transition-[left] before:duration-600 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-[rgba(147,51,234,0.5)] hover:bg-[rgba(147,51,234,0.15)] hover:shadow-xl hover:before:left-[100%] sm:px-5 sm:py-3 sm:text-sm"
            >
              <div className="relative z-10 h-5 w-5">
                <div className="absolute left-1 top-0 h-3 w-1 rotate-[12deg] bg-current"></div>
                <div className="absolute left-0 top-1 h-2 w-1 -rotate-[12deg] bg-current"></div>
              </div>
              <span>Auction</span>
            </Link>
          )}
          {presale.lbp && presale.lbp !== "0x0000000000000000000000000000000000000000" && (
            <Link
              to={`/lbp/${presale.lbp}`}
              className="group/btn relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#10b981] via-[#06b6d4] to-[#0891b2] px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all duration-300 before:absolute before:left-[-100%] before:top-0 before:h-full before:w-full before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.2)] before:to-transparent before:transition-[left] before:duration-600 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl hover:before:left-[100%] sm:px-5 sm:py-3 sm:text-sm"
            >
              <div className="relative z-10 h-5 w-5">
                <div className="absolute left-0 top-0 h-4 w-1 rounded-full bg-current"></div>
                <div className="absolute right-0 top-1 h-3 w-1 rounded-full bg-current"></div>
              </div>
              <span>LBP</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default PresaleCard;
