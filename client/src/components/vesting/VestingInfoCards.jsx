import React from "react";
import { Link } from "react-router-dom";

const VestingInfoCards = ({
  escrowAddress,
  secureLBPAddress,
  tokenAddress,
  tokenSymbol,
  finalized,
  lbpAddressToCheck,
  correctEscrowAddress,
}) => {
  const hasLbpMismatch = lbpAddressToCheck && 
    lbpAddressToCheck.toLowerCase() !== secureLBPAddress.toLowerCase();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="relative overflow-hidden rounded-xl border border-slate-600/30 bg-gradient-to-br from-slate-700/40 to-slate-800/50 p-5 transition-all hover:translate-y-[-2px] hover:border-slate-600/60 hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-green-500/5 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <div className="relative z-10 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Escrow Contract</div>
        <div className="relative z-10 font-mono text-sm font-medium text-white break-all">{escrowAddress}</div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-slate-600/30 bg-gradient-to-br from-slate-700/40 to-slate-800/50 p-5 transition-all hover:translate-y-[-2px] hover:border-slate-600/60 hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-green-500/5 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <div className="relative z-10 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">LBP Contract</div>
        <div className="relative z-10 mb-2 font-mono text-sm font-medium text-white break-all">{secureLBPAddress}</div>
        {secureLBPAddress && (
          <Link
            to={`/lbp/${secureLBPAddress}`}
            className="relative z-10 inline-block rounded-md border border-blue-500/50 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-400 no-underline transition-all hover:bg-blue-500/30"
          >
            View LBP →
          </Link>
        )}
        {hasLbpMismatch && (
          <div className="relative z-10 mt-3 rounded-lg border border-yellow-500/50 bg-yellow-500/20 p-3 text-xs text-yellow-400">
            <div className="mb-2">
                Expected LBP: {lbpAddressToCheck.slice(0, 8)}...{lbpAddressToCheck.slice(-6)}
            </div>
            {lbpAddressToCheck && (
              <Link
                to={`/lbp/${lbpAddressToCheck}`}
                className="mt-1 inline-block rounded-md border border-yellow-500/50 bg-yellow-500/20 px-3 py-1.5 text-[0.7rem] font-semibold text-yellow-300 no-underline transition-all hover:bg-yellow-500/30"
              >
                View Expected LBP →
              </Link>
            )}
            {correctEscrowAddress && (
              <div className="mt-2 border-t border-yellow-500/30 pt-2">
                <div className="mb-2 text-[0.7rem] opacity-90">
                  Correct Escrow for this LBP:
                </div>
                <div className="mb-2 font-mono text-[0.7rem] break-all">
                  {correctEscrowAddress}
                </div>
                <Link
                  to={`/vesting/${correctEscrowAddress}?lbp=${lbpAddressToCheck}`}
                  className="mt-1 inline-block rounded-md border border-green-500/50 bg-green-500/20 px-3 py-1.5 text-[0.7rem] font-semibold text-green-400 no-underline transition-all hover:bg-green-500/30"
                >
                  Go to Correct Escrow →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-slate-600/30 bg-gradient-to-br from-slate-700/40 to-slate-800/50 p-5 transition-all hover:translate-y-[-2px] hover:border-slate-600/60 hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-green-500/5 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <div className="relative z-10 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Token</div>
        <div className="relative z-10 text-base font-bold text-white">
          {tokenSymbol} ({tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)})
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-slate-600/30 bg-gradient-to-br from-slate-700/40 to-slate-800/50 p-5 transition-all hover:translate-y-[-2px] hover:border-slate-600/60 hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.3)] before:absolute before:inset-0 before:bg-gradient-to-br before:from-green-500/5 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100">
        <div className="relative z-10 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</div>
        <div className="relative z-10 text-base font-bold text-white">
          {finalized ? "Finalized" : "Not Finalized"}
        </div>
        {!finalized && (
          <div className="relative z-10 mt-2 text-xs text-white/70">
            SecureLBP: {secureLBPAddress.slice(0, 8)}...{secureLBPAddress.slice(-6)}
          </div>
        )}
      </div>
    </div>
  );
};

export default VestingInfoCards;






