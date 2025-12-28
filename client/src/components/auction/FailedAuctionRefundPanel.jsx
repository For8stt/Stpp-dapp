import React from "react";
import { formatEth } from "../../utils/auctionUtils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const FailedAuctionRefundPanel = ({ 
  auctionContract, 
  auctionData, 
  userData, 
  onRefund, 
  txState 
}) => {
  const { isConnected } = useAccount();

  // Calculate unrevealed deposits from commits (must be before any early returns)
  const unrevealedDeposits = React.useMemo(() => {
    if (!userData?.commits || userData.commits.length === 0) {
      return 0n;
    }
    return userData.commits
      .filter(commit => !commit.revealed && !commit.withdrawn)
      .reduce((sum, commit) => sum + (commit.deposit || 0n), 0n);
  }, [userData?.commits]);

  if (!auctionData || !auctionData.finalized || auctionData.successful) {
    return null;
  }

  const hasDeposits = (userData?.revealedDeposit && userData.revealedDeposit > 0n) || 
                      unrevealedDeposits > 0n;

  if (!hasDeposits) {
    return null;
  }

  const totalRefund = (userData?.revealedDeposit || 0n) + unrevealedDeposits;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(239,68,68,0.4)] bg-[rgba(15,23,42,0.6)] p-8">
      <div className="mb-6">
        <p className="mb-2 text-2xl font-bold text-[rgb(239,68,68)]">Auction Failed</p>
        <p className="text-sm text-[rgba(255,255,255,0.7)]">
          The auction did not meet the soft cap. All deposits will be refunded.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4">
        <p className="mb-2 text-sm text-[rgba(255,255,255,0.7)]">Total Refund Available:</p>
        <p className="font-mono text-2xl font-bold text-[rgb(239,68,68)]">{formatEth(totalRefund)} ETH</p>
        {userData?.revealedDeposit > 0n && (
          <p className="mt-2 text-xs text-[rgba(255,255,255,0.6)]">
            Revealed deposits: {formatEth(userData.revealedDeposit)} ETH
          </p>
        )}
        {unrevealedDeposits > 0n && (
          <p className="mt-1 text-xs text-[rgba(255,255,255,0.6)]">
            Unrevealed commits: {formatEth(unrevealedDeposits)} ETH
          </p>
        )}
      </div>

      <p className="mb-4 text-sm text-[rgba(255,255,255,0.7)]">
        Click the button below to refund all your deposits (both revealed and unrevealed commits).
      </p>

      {!isConnected ? (
        <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
          <p className="mb-3 text-[rgba(255,255,255,0.9)]">
            Connect wallet to refund your deposits
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      ) : (
        <button
          onClick={onRefund}
          disabled={txState?.status === "pending"}
          className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(239,68,68)] to-[rgb(220,38,38)] px-4 py-4 text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-gradient-to-r hover:not-disabled:from-[rgb(220,38,38)] hover:not-disabled:to-[rgb(239,68,68)] hover:not-disabled:shadow-[0_10px_20px_rgba(239,68,68,0.3)]"
        >
          {txState?.status === "pending" ? "Processing Refund..." : "Refund All Deposits"}
        </button>
      )}
    </div>
  );
};

export default FailedAuctionRefundPanel;

