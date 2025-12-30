import React from "react";
import { Link } from "react-router-dom";

const PresaleHero = ({ address, info }) => {
  const heroStats = info
    ? [
        { label: "Owner", value: info.owner || "—" },
        { label: "Auction", value: info.auction || "Pending" },
        { label: "LBP", value: info.lbp || "Not initialized" },
        { label: "Vesting escrow", value: info.vesting || "Not created" },
      ]
    : [];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[radial-gradient(circle_at_15%_-5%,rgba(99,102,241,0.3),transparent_45%),radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.25),transparent_50%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.2),transparent_60%),linear-gradient(135deg,rgba(2,6,23,0.95),rgba(15,23,42,0.9))] p-10 shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset,0_1px_0_rgba(255,255,255,0.1)_inset] backdrop-blur-[20px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_70px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_0_rgba(255,255,255,0.15)_inset] before:absolute before:inset-0 before:pointer-events-none before:bg-[linear-gradient(135deg,rgba(99,102,241,0.1),transparent_60%),linear-gradient(225deg,rgba(16,185,129,0.08),transparent_70%)] before:opacity-60 after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.03),transparent_50%)] md:p-8 sm:p-6">
      <div className="relative z-10 mb-2 flex flex-col gap-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-white/65">
            <svg className="h-4 w-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Presale manager
          </p>
          <h1 className="m-0 bg-gradient-to-br from-white to-white/85 bg-clip-text text-4xl font-bold leading-tight tracking-[-0.02em] text-transparent break-all sm:text-3xl sm:text-2xl">
            {address}
          </h1>
        </div>
        {info?.auction && (
          <Link 
            to={`/presale/${address}/auction`} 
            className="inline-flex w-1/5 items-center gap-2 whitespace-nowrap rounded-2xl border-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-green-400 px-7 py-3 text-sm font-semibold text-white no-underline shadow-[0_8px_20px_rgba(99,102,241,0.3),0_0_0_1px_rgba(255,255,255,0.1)_inset] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_12px_30px_rgba(99,102,241,0.4),0_0_0_1px_rgba(255,255,255,0.15)_inset] active:translate-y-0 active:scale-100 after:content-['→'] after:text-lg after:transition-transform after:duration-300 hover:after:translate-x-1"
          >
            Open auction view
          </Link>
        )}
      </div>
      {info && (
        <div className="relative z-10 mt-8 grid grid-cols-1 gap-5 border-t border-white/8 pt-8 sm:mt-6 sm:gap-4 sm:pt-6 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {heroStats.map((stat) => (
            <div 
              key={stat.label} 
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/70 to-slate-800/50 p-5 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[10px] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-gradient-to-br hover:from-slate-900/85 hover:to-slate-800/65 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-indigo-500/60 before:via-green-500/60 before:to-indigo-500/60 before:bg-[length:200%_100%] before:animate-shimmer sm:p-4"
            >
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/65">
                {stat.label}
              </span>
              <strong className="mt-1 block font-mono text-[0.95rem] font-medium leading-snug text-white break-all">
                {stat.value}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PresaleHero;

