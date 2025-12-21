import React from "react";
import { Link } from "react-router-dom";

const VestingWarnings = ({
  escrowAddress,
  lbpAddressToCheck,
  secureLBPAddress,
  correctEscrowAddress,
  checkingEscrow,
  lbpFinalized,
}) => {
  if (!lbpAddressToCheck || lbpAddressToCheck.toLowerCase() === secureLBPAddress.toLowerCase()) {
    return null;
  }

  return (
    <div className="mb-8 rounded-2xl border border-yellow-500/50 bg-gradient-to-br from-yellow-500/20 to-yellow-500/10 p-6">
      <h3 className="mb-4 text-lg font-bold text-yellow-400">
          Wrong Escrow Address Detected
      </h3>
      <p className="mb-4 text-white/90">
        This escrow ({escrowAddress.slice(0, 8)}...{escrowAddress.slice(-6)}) is linked to a different LBP contract ({secureLBPAddress.slice(0, 8)}...{secureLBPAddress.slice(-6)}).
        <br />
        The expected LBP ({lbpAddressToCheck.slice(0, 8)}...{lbpAddressToCheck.slice(-6)}) {lbpFinalized ? "has" : "will have"} a different escrow address.
      </p>
      {correctEscrowAddress ? (
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to={`/vesting/${correctEscrowAddress}?lbp=${lbpAddressToCheck}`}
            className="inline-block rounded-xl border border-green-500/50 bg-gradient-to-br from-green-500/20 to-green-600/15 px-6 py-3 font-bold text-green-400 no-underline transition-all hover:translate-y-[-2px] hover:bg-gradient-to-br hover:from-green-500/30 hover:to-green-600/20"
          >
            Go to Correct Escrow →
          </Link>
          <span className="text-sm text-white/70">
            Correct Escrow: {correctEscrowAddress.slice(0, 8)}...{correctEscrowAddress.slice(-6)}
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-blue-500/50 bg-blue-500/20 p-3 text-sm text-blue-300">
          {checkingEscrow 
            ? "Checking escrow address..."
            : lbpFinalized 
              ? "LBP is finalized but escrow address is not set yet. Please check the LBP contract."
              : "LBP is not finalized yet. Escrow will be set after finalization."}
        </div>
      )}
    </div>
  );
};

export default VestingWarnings;




