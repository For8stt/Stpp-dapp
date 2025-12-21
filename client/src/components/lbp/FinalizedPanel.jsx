import React from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { shortenAddress } from "../../utils/formatUtils";

const FinalizedPanel = ({ lbpAddress, lbpData }) => {
  if (!lbpData.finalized) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(59,130,246,0.4)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(59,130,246,0.2)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(59,130,246,0.8)] before:via-[rgba(96,165,250,0.8)] before:to-[rgba(59,130,246,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="relative z-10 mb-4 bg-gradient-to-br from-[#60a5fa] to-[#3b82f6] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Finalized</h2>
      <p className="relative z-10 text-base leading-relaxed text-[rgb(203,213,225)]">
        This LBP has been finalized. Trading is no longer available.
      </p>
      {lbpData.vestingEscrow &&
        lbpData.vestingEscrow !== ethers.ZeroAddress && (
          <>
            <p className="relative z-10 mt-3 font-mono text-sm text-[rgba(148,163,184,0.8)]">
              Vesting Escrow: {shortenAddress(lbpData.vestingEscrow)}
            </p>
            <Link
              to={`/vesting/${lbpData.vestingEscrow}?lbp=${lbpAddress}`}
              className="relative z-10 mt-6 inline-block rounded-xl border border-[rgba(34,197,94,0.5)] bg-gradient-to-br from-[rgba(34,197,94,0.2)] to-[rgba(22,163,74,0.15)] px-7 py-3.5 text-base font-bold text-[rgb(74,222,128)] no-underline shadow-[0_4px_15px_-3px_rgba(34,197,94,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-[rgba(34,197,94,0.3)] hover:to-[rgba(22,163,74,0.2)] hover:text-[rgb(147,197,253)] hover:shadow-[0_10px_15px_-3px_rgba(34,197,94,0.3)] active:translate-y-0"
            >
              View Vesting Page →
            </Link>
          </>
        )}
    </div>
  );
};

export default FinalizedPanel;

