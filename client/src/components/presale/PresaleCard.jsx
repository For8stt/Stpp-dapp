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
  const [hasWhitelist, setHasWhitelist] = useState(false);

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

  useEffect(() => {
    const checkWhitelist = async () => {
      if (!presale.auction || presale.auction === ZERO_ADDRESS) {
        setHasWhitelist(false);
        return;
      }

      try {
        if (typeof window === "undefined" || !window.ethereum) {
          return;
        }

        const provider = new BrowserProvider(window.ethereum);
        const dutchAuctionAbi = Array.isArray(allAbis.DutchAuction) 
          ? allAbis.DutchAuction 
          : (allAbis.DutchAuction?.abi || allAbis.DutchAuction);
        
        if (!dutchAuctionAbi || dutchAuctionAbi.length === 0) {
          return;
        }

        const auctionContract = new Contract(presale.auction, dutchAuctionAbi, provider);
        const merkleRoot = await auctionContract.merkleRoot().catch(() => ethers.ZeroHash);
        setHasWhitelist(merkleRoot && merkleRoot !== ethers.ZeroHash && merkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000");
      } catch (error) {
        console.warn("Failed to check whitelist:", error);
        setHasWhitelist(false);
      }
    };

    checkWhitelist();
  }, [presale.auction]);

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
    <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-surface/90 via-surface/80 to-surface/90 p-[2px] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(99,102,241,0.2)] transition-all duration-700 hover:scale-[1.02] hover:border-primary/70 hover:shadow-[0_12px_48px_rgba(99,102,241,0.5),0_0_0_1px_rgba(99,102,241,0.4),inset_0_0_60px_rgba(99,102,241,0.1)]">
      
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/60 via-indigo-500/60 via-purple-500/60 to-secondary/60 opacity-60 transition-opacity duration-700 group-hover:opacity-100"></div>
      
      
      <div className="absolute inset-0 rounded-3xl bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:20px_20px] opacity-40"></div>
      
      
      <div className="relative z-0 flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-surface/95 to-surface p-7 sm:p-8">
        
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/10 to-secondary/20 opacity-60 transition-opacity duration-700 group-hover:opacity-100"></div>
        
        
        <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/40 rounded-tl-3xl"></div>
        <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/40 rounded-tr-3xl"></div>
        <div className="absolute bottom-0 left-0 h-16 w-16 border-b-2 border-l-2 border-primary/40 rounded-bl-3xl"></div>
        <div className="absolute bottom-0 right-0 h-16 w-16 border-b-2 border-r-2 border-secondary/40 rounded-br-3xl"></div>
        
        
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl opacity-60 transition-opacity duration-700 group-hover:opacity-90"></div>
        <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-secondary/15 blur-3xl opacity-50 transition-opacity duration-700 group-hover:opacity-80"></div>
        <div className="absolute top-1/2 left-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-2xl opacity-30 transition-opacity duration-700 group-hover:opacity-50"></div>
        
        
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary via-indigo-500 via-secondary to-transparent opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
        
        
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-secondary via-indigo-500 via-primary to-transparent opacity-80 transition-opacity duration-700 group-hover:opacity-100"></div>
        
        
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-primary via-indigo-500 via-secondary to-transparent opacity-60 transition-opacity duration-700 group-hover:opacity-85"></div>
        <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-secondary via-indigo-500 via-primary to-transparent opacity-60 transition-opacity duration-700 group-hover:opacity-85"></div>
      
        
        <div className={`absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border-2 px-4 py-2 text-xs font-bold uppercase tracking-wider backdrop-blur-xl shadow-2xl transition-all duration-300 group-hover:scale-110 ${currentStatus.bgClass} ${currentStatus.borderClass} ${currentStatus.textClass}`}>
          <span className="relative flex h-2 w-2 items-center justify-center">
            <span className="absolute h-2 w-2 animate-ping rounded-full bg-current opacity-75"></span>
            <span className="relative h-1.5 w-1.5 rounded-full bg-current"></span>
          </span>
          <span>{currentStatus.text}</span>
        </div>

        <div className="relative z-10 flex flex-1 flex-col">
        
        <div className="mb-6">
          <div className="mb-5 flex items-start gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/40 via-indigo-500/30 to-secondary/30 shadow-2xl shadow-primary/50 transition-all duration-700 group-hover:scale-110 group-hover:shadow-[0_0_40px_rgba(99,102,241,0.8)]">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/40 via-white/20 to-transparent"></div>
              <div className="absolute -inset-4 rounded-2xl bg-primary/40 blur-3xl opacity-70"></div>
              <svg className="relative z-10 h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              
              <div className="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-primary/60 rounded-tl-2xl"></div>
              <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-secondary/60 rounded-br-2xl"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="mb-2 bg-gradient-to-r from-text via-primary/90 to-text bg-clip-text text-2xl font-bold text-transparent">Presale Manager</h3>
              <div className="group/address relative overflow-hidden rounded-xl border-2 border-primary/50 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 p-4 backdrop-blur-sm transition-all duration-300 hover:border-primary/70 hover:from-primary/20 hover:via-primary/15 hover:to-primary/10 hover:shadow-xl hover:shadow-primary/30">
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.1),transparent)] opacity-0 transition-opacity duration-500 group-hover/address:opacity-100"></div>
                <p className="relative font-mono text-base font-bold text-primary transition-colors group-hover/address:text-primary/90">{shortenAddress(presale.manager)}</p>
                <p className="mt-1.5 font-mono text-xs text-text-muted opacity-0 transition-opacity duration-300 group-hover:opacity-100">{presale.manager}</p>
              </div>
            </div>
          </div>
        </div>

        
        <div className="mb-6 grid flex-1 grid-cols-2 gap-4">
          <div className={`group/info relative overflow-hidden rounded-xl border-2 p-5 transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl ${
            !presale.owner ? 'border-border/50 bg-surface/70' : 'border-primary/70 bg-gradient-to-br from-primary/30 via-primary/20 to-primary/15 shadow-xl shadow-primary/30'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover/info:opacity-100"></div>
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/15 blur-2xl opacity-60 transition-opacity duration-500 group-hover/info:opacity-90"></div>
            <div className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-primary/50 rounded-tr-xl"></div>
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-xl transition-all duration-500 group-hover/info:scale-110 ${
                  !presale.owner ? 'bg-surface/90 text-text-muted' : 'bg-gradient-to-br from-primary/50 via-primary/40 to-primary/30 text-primary'
                }`}>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent"></div>
                  <svg className="relative z-10 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h4 className={`text-sm font-bold uppercase tracking-wider ${
                  !presale.owner ? 'text-text-muted' : 'text-primary'
                }`}>Owner</h4>
              </div>
              <p className={`font-mono text-base font-bold ${
                !presale.owner ? 'text-text-muted' : 'text-text'
              }`}>
                {shortenAddress(presale.owner)}
              </p>
            </div>
          </div>

          <div className={`group/info relative overflow-hidden rounded-xl border-2 p-5 transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl ${
            !presale.auction ? 'border-border/50 bg-surface/70' : 'border-primary/70 bg-gradient-to-br from-primary/30 via-primary/20 to-primary/15 shadow-xl shadow-primary/30'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover/info:opacity-100"></div>
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/15 blur-2xl opacity-60 transition-opacity duration-500 group-hover/info:opacity-90"></div>
            <div className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-primary/50 rounded-tr-xl"></div>
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-xl transition-all duration-500 group-hover/info:scale-110 ${
                  !presale.auction ? 'bg-surface/90 text-text-muted' : 'bg-gradient-to-br from-primary/50 via-primary/40 to-primary/30 text-primary'
                }`}>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent"></div>
                  <svg className="relative z-10 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h4 className={`text-sm font-bold uppercase tracking-wider ${
                    !presale.auction ? 'text-text-muted' : 'text-primary'
                  }`}>Auction</h4>
                  {hasWhitelist && (
                    <span className="inline-flex shrink-0 items-center rounded-full border-2 border-secondary/80 bg-secondary/40 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-secondary shadow-xl">
                      WL
                    </span>
                  )}
                </div>
              </div>
              <p className={`font-mono text-base font-bold ${
                !presale.auction ? 'text-text-muted' : 'text-text'
              }`}>
                {presale.auction ? shortenAddress(presale.auction) : 'Not launched'}
              </p>
            </div>
          </div>

          <div className={`group/info relative overflow-hidden rounded-xl border-2 p-5 transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl ${
            !presale.lbp ? 'border-border/50 bg-surface/70' : 'border-secondary/70 bg-gradient-to-br from-secondary/30 via-secondary/20 to-secondary/15 shadow-xl shadow-secondary/30'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/20 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover/info:opacity-100"></div>
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-secondary/15 blur-2xl opacity-60 transition-opacity duration-500 group-hover/info:opacity-90"></div>
            <div className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-secondary/50 rounded-tr-xl"></div>
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-xl transition-all duration-500 group-hover/info:scale-110 ${
                  !presale.lbp ? 'bg-surface/90 text-text-muted' : 'bg-gradient-to-br from-secondary/50 via-secondary/40 to-secondary/30 text-secondary'
                }`}>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent"></div>
                  <svg className="relative z-10 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h4 className={`text-sm font-bold uppercase tracking-wider ${
                  !presale.lbp ? 'text-text-muted' : 'text-secondary'
                }`}>Liquidity Pool</h4>
              </div>
              <p className={`font-mono text-base font-bold ${
                !presale.lbp ? 'text-text-muted' : 'text-text'
              }`}>
                {presale.lbp ? shortenAddress(presale.lbp) : 'Not launched'}
              </p>
            </div>
          </div>

          <div className={`group/info relative overflow-hidden rounded-xl border-2 p-5 transition-all duration-500 hover:scale-[1.05] hover:shadow-2xl ${
            !presale.vesting ? 'border-border/50 bg-surface/70' : 'border-secondary/70 bg-gradient-to-br from-secondary/30 via-secondary/20 to-secondary/15 shadow-xl shadow-secondary/30'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/20 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover/info:opacity-100"></div>
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-secondary/15 blur-2xl opacity-60 transition-opacity duration-500 group-hover/info:opacity-90"></div>
            <div className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-secondary/50 rounded-tr-xl"></div>
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-xl transition-all duration-500 group-hover/info:scale-110 ${
                  !presale.vesting ? 'bg-surface/90 text-text-muted' : 'bg-gradient-to-br from-secondary/50 via-secondary/40 to-secondary/30 text-secondary'
                }`}>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent"></div>
                  <svg className="relative z-10 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className={`text-sm font-bold uppercase tracking-wider ${
                  !presale.vesting ? 'text-text-muted' : 'text-secondary'
                }`}>Vesting</h4>
              </div>
              <p className={`font-mono text-base font-bold ${
                !presale.vesting ? 'text-text-muted' : 'text-text'
              }`}>
                {presale.vesting ? shortenAddress(presale.vesting) : 'Not created'}
              </p>
            </div>
          </div>
        </div>

        
        <div className="mt-auto flex flex-col gap-5 border-t-2 border-primary/40 pt-6">
          {presale.auction && (
            <Link
              to={`/presale/${presale.manager}/auction`}
              className="group/btn relative flex items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-primary/70 bg-gradient-to-br from-primary/30 via-primary/25 to-primary/20 px-8 py-5 text-lg font-bold text-primary shadow-2xl shadow-primary/40 transition-all duration-300 hover:scale-[1.02] hover:border-primary/90 hover:from-primary/35 hover:via-primary/30 hover:to-primary/25 hover:shadow-[0_0_50px_rgba(99,102,241,0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50"></div>
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl opacity-60 transition-opacity duration-300 group-hover/btn:opacity-80"></div>
              <span className="relative z-10 flex items-center gap-2">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Auction
              </span>
              <svg className="relative z-10 h-6 w-6 transition-transform duration-300 group-hover/btn:translate-x-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          )}
          <div className="flex gap-5">
            {presale.lbp && presale.lbp !== "0x0000000000000000000000000000000000000000" && (
              <Link
                to={`/lbp/${presale.lbp}`}
                className="group/btn relative flex flex-1 items-center justify-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-secondary via-teal-500 via-cyan-500 to-secondary px-8 py-5 text-lg font-bold text-white shadow-2xl shadow-secondary/60 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(20,184,166,0.8)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-50"></div>
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10 blur-2xl opacity-60 transition-opacity duration-300 group-hover/btn:opacity-80"></div>
                <span className="relative z-10 flex items-center gap-2">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  LBP
                </span>
                <svg className="relative z-10 h-6 w-6 transition-transform duration-300 group-hover/btn:translate-x-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            )}
            {presale.vesting && presale.vesting !== "0x0000000000000000000000000000000000000000" && presale.lbpFinalized && (
              <Link
                to={`/vesting/${presale.vesting}${presale.lbp && presale.lbp !== "0x0000000000000000000000000000000000000000" ? `?lbp=${presale.lbp}` : ""}`}
                className="group/btn relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-secondary/60 bg-gradient-to-r from-secondary/25 via-secondary/20 to-secondary/25 px-7 py-4.5 text-base font-bold text-secondary shadow-2xl shadow-secondary/30 transition-all duration-300 hover:scale-[1.04] hover:border-secondary/80 hover:from-secondary/30 hover:via-secondary/25 hover:to-secondary/30 hover:shadow-[0_0_40px_rgba(20,184,166,0.5)]"
              >
                <span className="relative z-10">Vesting</span>
                <svg className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover/btn:translate-x-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover/btn:opacity-100"></div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default PresaleCard;
