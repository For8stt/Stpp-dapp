import React, { useMemo } from "react";
import { formatEth } from "../../utils/auctionUtils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WarningIcon } from "../common/Icons";

const BPS_DENOMINATOR = 10000n;

const UnrevealedCommitsPanel = ({ 
  auctionContract, 
  auctionData, 
  userCommits, 
  onWithdraw, 
  txState 
}) => {
  const { isConnected } = useAccount();

  const unrevealedCommits = useMemo(() => {
    if (!userCommits || userCommits.length === 0) return [];
    return userCommits.filter(commit => !commit.revealed && !commit.withdrawn);
  }, [userCommits]);

  if (!auctionData || !auctionData.finalized) {
    return null;
  }

  if (unrevealedCommits.length === 0) {
    return null;
  }

  const penaltyBps = auctionData.nonRevealPenaltyBps || 0n;
  const penaltyPercent = penaltyBps > 0n ? Number(penaltyBps) / 100 : 0;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(245,158,11,0.3)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-2xl font-bold text-[rgb(251,191,36)]">Unrevealed Commits</p>
      
      {auctionData.successful && penaltyBps > 0n && (
        <div className="mb-4 rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(251,191,36)]">
            <WarningIcon className="h-5 w-5" />
            Penalty Notice
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            Since the auction was successful, a penalty of {penaltyPercent}% will be applied to each unrevealed commit withdrawal.
          </p>
        </div>
      )}

      <div className="mb-4 space-y-3">
        {unrevealedCommits.map((commit, idx) => {
          const deposit = BigInt(commit.deposit || 0);
          const penalty = auctionData.successful && penaltyBps > 0n 
            ? (deposit * penaltyBps) / BPS_DENOMINATOR 
            : 0n;
          const refundAmount = deposit - penalty;

          return (
            <div 
              key={commit.index || idx}
              className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Commit #{commit.index}</p>
                  <p className="text-xs text-[rgba(255,255,255,0.6)]">
                    Deposit: {formatEth(deposit)} ETH
                  </p>
                </div>
                <button
                  onClick={() => onWithdraw(commit.index)}
                  disabled={txState?.status === "pending"}
                  className="rounded-lg border-0 bg-gradient-to-r from-[rgb(245,158,11)] to-[rgb(217,119,6)] px-4 py-2 text-sm font-semibold text-[rgb(15,23,42)] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-[0_4px_12px_rgba(245,158,11,0.3)]"
                >
                  {txState?.status === "pending" ? "Withdrawing..." : "Withdraw"}
                </button>
              </div>
              {penalty > 0n && (
                <div className="mt-2 rounded-lg bg-[rgba(245,158,11,0.1)] p-2">
                  <p className="text-xs text-[rgba(255,255,255,0.7)]">
                    Penalty: {formatEth(penalty)} ETH ({penaltyPercent}%)
                  </p>
                  <p className="text-xs font-semibold text-[rgb(251,191,36)]">
                    Net Refund: {formatEth(refundAmount)} ETH
                  </p>
                </div>
              )}
              {penalty === 0n && (
                <p className="text-xs text-[rgba(255,255,255,0.7)]">
                  Full refund: {formatEth(refundAmount)} ETH
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!isConnected && (
        <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
          <p className="mb-3 text-[rgba(255,255,255,0.9)]">
            Connect wallet to withdraw unrevealed commits
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      )}
    </div>
  );
};

export default UnrevealedCommitsPanel;

