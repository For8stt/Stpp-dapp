import React from "react";
import { Link } from "react-router-dom";
import { WarningIcon, ClockIcon } from "../common/Icons";

const VestingWarnings = ({
  escrowAddress,
  lbpAddressToCheck,
  secureLBPAddress,
  correctEscrowAddress,
  checkingEscrow,
  lbpFinalized,
  totalTokensAllocated,
  escrowMismatchWarning,
  timeUntilCliff,
  isCliffPassed,
  userAllocationFromAuction,
}) => {
  const hasLbpMismatch = lbpAddressToCheck && 
    lbpAddressToCheck.toLowerCase() !== secureLBPAddress.toLowerCase();
  const hasEscrowMismatch = escrowMismatchWarning !== null && escrowMismatchWarning !== undefined;
  const hasCliffNotPassed = !isCliffPassed && timeUntilCliff !== undefined && timeUntilCliff > 0 && totalTokensAllocated && totalTokensAllocated > 0n;
  const hasAuctionAllocationButNoLBP = userAllocationFromAuction !== undefined && userAllocationFromAuction > 0n && (!totalTokensAllocated || totalTokensAllocated === 0n);

  if (!hasLbpMismatch && !hasEscrowMismatch && !hasCliffNotPassed && !hasAuctionAllocationButNoLBP) {
    return null;
  }

  return (
    <div className="mb-8 space-y-4">
      {hasEscrowMismatch && (
        <div className="rounded-2xl border border-red-500/50 bg-gradient-to-br from-red-500/20 to-red-500/10 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-red-400">
            <WarningIcon className="h-6 w-6" />
            Wrong Vesting Escrow Detected
          </h3>
          <p className="mb-4 text-white/90">
            The LBP contract is linked to a different vesting escrow than the one you're viewing.
            <br />
            <strong>Escrow in URL:</strong> {escrowMismatchWarning.escrowAddressInURL.slice(0, 8)}...{escrowMismatchWarning.escrowAddressInURL.slice(-6)}
            <br />
            <strong>Escrow in LBP:</strong> {escrowMismatchWarning.vestingEscrowInLBP.slice(0, 8)}...{escrowMismatchWarning.vestingEscrowInLBP.slice(-6)}
          </p>
          <p className="mb-4 text-sm text-yellow-300">
            {escrowMismatchWarning.message}
          </p>
          <Link
            to={`/vesting/${escrowMismatchWarning.vestingEscrowInLBP}?lbp=${secureLBPAddress}`}
            className="inline-block rounded-xl border border-green-500/50 bg-gradient-to-br from-green-500/20 to-green-600/15 px-6 py-3 font-bold text-green-400 no-underline transition-all hover:translate-y-[-2px] hover:bg-gradient-to-br hover:from-green-500/30 hover:to-green-600/20"
          >
            Go to Correct Vesting Escrow →
          </Link>
        </div>
      )}
      
      {hasAuctionAllocationButNoLBP && (
        <div className="rounded-2xl border border-orange-500/50 bg-gradient-to-br from-orange-500/20 to-orange-500/10 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-orange-400">
            <WarningIcon className="h-6 w-6" />
            Tokens Purchased in Auction, Not LBP
          </h3>
          <p className="mb-4 text-white/90">
            You have {userAllocationFromAuction ? `${(Number(userAllocationFromAuction) / 1e18).toFixed(4)} tokens` : "tokens"} allocated in the Dutch Auction, but this vesting escrow only tracks tokens purchased in the LBP (Liquidity Bootstrap Pool).
            <br />
            <strong>Why this happens:</strong>
            <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
              <li>Tokens purchased in the Dutch Auction are tracked separately from LBP purchases</li>
              <li>This vesting escrow is linked to the LBP contract and only shows LBP allocations</li>
              <li>Your auction tokens may be claimable from the auction contract directly</li>
            </ul>
          </p>
          <p className="mt-4 text-sm text-yellow-300">
            <strong>Solution:</strong> If you purchased tokens in the LBP (not the auction), make sure you completed the purchase transaction. If you only purchased in the auction, you may need to claim from the auction contract instead.
          </p>
        </div>
      )}
      
      {hasCliffNotPassed && (
        <div className="rounded-2xl border border-yellow-500/50 bg-gradient-to-br from-yellow-500/20 to-yellow-500/10 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-yellow-400">
            <ClockIcon className="h-6 w-6" />
            Cliff Period Not Passed Yet
          </h3>
          <p className="mb-4 text-white/90">
            Tokens are in the escrow, but the vesting cliff period has not passed yet. You cannot claim tokens until the cliff period ends.
            <br />
            <strong>Time until cliff:</strong> {timeUntilCliff >= 86400 ? `${Math.floor(timeUntilCliff / 86400)} days ` : ""}{Math.floor((timeUntilCliff % 86400) / 3600)} hours {Math.floor((timeUntilCliff % 3600) / 60)} minutes
          </p>
        </div>
      )}
      
      {hasLbpMismatch && (
        <div className="rounded-2xl border border-yellow-500/50 bg-gradient-to-br from-yellow-500/20 to-yellow-500/10 p-6">
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
              {lbpAddressToCheck && (
                <Link
                  to={`/lbp/${lbpAddressToCheck}`}
                  className="inline-block rounded-xl border border-blue-500/50 bg-gradient-to-br from-blue-500/20 to-blue-600/15 px-6 py-3 font-bold text-blue-400 no-underline transition-all hover:translate-y-[-2px] hover:bg-gradient-to-br hover:from-blue-500/30 hover:to-blue-600/20"
                >
                  View Expected LBP →
                </Link>
              )}
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
      )}
    </div>
  );
};

export default VestingWarnings;




