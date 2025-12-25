import React from "react";
import { Link } from "react-router-dom";

const VestingHeader = ({ lbpAddress, secureLBPAddress }) => {
  const lbpAddressToLink = secureLBPAddress || lbpAddress;
  
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-8 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2)] backdrop-blur-[12px] backdrop-saturate-[180%] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-cyan-500/80 before:via-green-500/80 before:to-cyan-500/80 before:bg-[length:200%_100%] before:animate-shimmer">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="bg-gradient-to-br from-white to-slate-300 bg-clip-text text-3xl font-extrabold leading-tight tracking-[-0.02em] text-transparent">Token Vesting</h1>
        {lbpAddressToLink && (
          <div className="flex items-center gap-4">
            <Link 
              to={`/lbp/${lbpAddressToLink}`} 
              className="flex items-center gap-2 rounded-lg border border-green-500/50 bg-gradient-to-br from-green-500/20 to-green-600/15 px-4 py-2 font-semibold text-green-400 no-underline transition-all hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-green-500/30 hover:to-green-600/20 hover:shadow-lg"
            >
              <span>←</span>
              <span>View LBP</span>
            </Link>
          </div>
        )}
      </div>
      <p className="text-base text-white/70">
        View and claim your vested tokens from the LBP sale
      </p>
    </div>
  );
};

export default VestingHeader;




