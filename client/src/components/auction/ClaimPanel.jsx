import React, { useMemo } from "react";
import { formatEth, formatToken, formatTokenUnits } from "../../utils/auctionUtils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTime } from "../../time";

const BPS_DENOMINATOR = 10000n;

const ClaimPanel = ({ 
  auctionContract, 
  auctionData, 
  userData, 
  onClaim, 
  txState 
}) => {
  const { isConnected } = useAccount();
  const { currentTime } = useTime();

  const allocation = userData?.allocation;
  const vestingDebug = useMemo(() => {
    if (!auctionData?.vestingStart || auctionData?.vestingDuration === undefined) return null;
    const vestingStart = Number(auctionData.vestingStart);
    const vestingDuration = Number(auctionData.vestingDuration);
    const now = currentTime !== null && currentTime !== undefined 
      ? currentTime 
      : Math.floor(Date.now() / 1000);
    const vestingEnd = vestingStart + vestingDuration;
    return {
      now,
      vestingStart,
      vestingEnd,
      vestingDuration,
      isVestingComplete: now >= vestingEnd,
      currentTimeFromHook: currentTime,
      currentTimeFromDate: Math.floor(Date.now() / 1000)
    };
  }, [auctionData?.vestingStart, auctionData?.vestingDuration, currentTime]);
  const refundAmount = useMemo(() => {
    if (!userData?.revealedDeposit || !allocation?.paymentDue) return 0n;
    const deposit = BigInt(userData.revealedDeposit);
    const payment = BigInt(allocation.paymentDue);
    return deposit > payment ? deposit - payment : 0n;
  }, [userData?.revealedDeposit, allocation?.paymentDue]);

  const claimableInfo = useMemo(() => {
    if (!allocation || !auctionData?.vestingStart || auctionData?.vestingDuration === undefined) {
      return { claimableTokens: 0n, isVestingActive: false, unlockedPercent: 0 };
    }

    const totalTokens = (allocation.totalQty || 0n) + (allocation.bonusQty || 0n);
    if (totalTokens === 0n) {
      return { claimableTokens: 0n, isVestingActive: false, unlockedPercent: 0 };
    }

    const vestingStart = Number(auctionData.vestingStart);
    const vestingDuration = Number(auctionData.vestingDuration);
    const now = currentTime !== null && currentTime !== undefined 
      ? currentTime 
      : Math.floor(Date.now() / 1000);

    if (now < vestingStart) {
      return { 
        claimableTokens: 0n, 
        isVestingActive: false, 
        unlockedPercent: 0,
        vestingStartsAt: vestingStart,
        vestingEndsAt: vestingStart + vestingDuration
      };
    }

    let unlockedBps = 0n;
    if (vestingDuration === 0) {
      unlockedBps = 10000n; // Fully unlocked if no vesting
    } else {
      const vestingEnd = vestingStart + vestingDuration;
      if (now >= vestingEnd) {
        unlockedBps = 10000n; // Fully unlocked after vesting period
      } else {
        unlockedBps = 0n; // Nothing unlocked during vesting (cliff-only)
      }
    }

    const unlockedPercent = Number(unlockedBps) / 100;
    const unlocked = (totalTokens * unlockedBps) / 10000n;
    const tokensClaimed = BigInt(userData?.tokensClaimed || 0);
    const claimableTokens = unlocked > tokensClaimed ? unlocked - tokensClaimed : 0n;

    return {
      claimableTokens,
      isVestingActive: true,
      unlockedPercent,
      totalTokens,
      tokensClaimed,
      vestingEndsAt: vestingStart + vestingDuration,
    };
  }, [allocation, auctionData?.vestingStart, auctionData?.vestingDuration, currentTime, userData?.tokensClaimed]);

  const refundAlreadyClaimed = useMemo(() => {
    if (refundAmount === 0n) return false;
    if (!userData?.refundedAmount || userData.refundedAmount === 0n) return false;
    
    const refunded = BigInt(userData.refundedAmount);
    return refunded >= (refundAmount - 1n);
  }, [userData?.refundedAmount, refundAmount]);

  if (!auctionData || !auctionData.finalized || !auctionData.successful) {
    return null;
  }

  if (!allocation || !allocation.computed) {
    return (
      <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
        <p className="mb-4 text-xl font-bold text-white">Claim Tokens</p>
        <p className="text-sm text-[rgba(255,255,255,0.7)]">
          Your allocation will be computed when you claim. Click the button below to claim your tokens and any refunds.
        </p>
        {!isConnected ? (
          <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
            <p className="mb-3 text-[rgba(255,255,255,0.9)]">
              Connect wallet to claim your tokens
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <button
            onClick={onClaim}
            disabled={txState?.status === "pending"}
            className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(16,185,129)] to-[rgb(52,211,153)] px-4 py-4 text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-gradient-to-r hover:not-disabled:from-[rgb(52,211,153)] hover:not-disabled:to-[rgb(16,185,129)] hover:not-disabled:shadow-[0_10px_20px_rgba(16,185,129,0.3)]"
          >
            {txState?.status === "pending" ? "Claiming..." : "Claim Tokens & Refunds"}
          </button>
        )}
      </div>
    );
  }

  const totalTokens = (allocation.totalQty || 0n) + (allocation.bonusQty || 0n);
  const vestingEnd = auctionData?.vestingStart && auctionData?.vestingDuration !== undefined
    ? Number(auctionData.vestingStart) + Number(auctionData.vestingDuration)
    : null;
  const currentTimeForCheck = currentTime !== null && currentTime !== undefined 
    ? currentTime 
    : Math.floor(Date.now() / 1000);
  const mightBeVestingComplete = vestingEnd !== null && currentTimeForCheck >= (vestingEnd - 3600);
  const hasUnclaimedTokens = totalTokens > 0n && (userData?.tokensClaimed || 0n) < totalTokens;
  const hasClaimable = claimableInfo.claimableTokens > 0n || 
    (refundAmount > 0n && !refundAlreadyClaimed) ||
    (hasUnclaimedTokens && vestingEnd !== null); // Allow if vesting end is set and user has unclaimed tokens

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(16,185,129,0.3)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-2xl font-bold text-[rgb(110,231,183)]">Claim Tokens</p>
      
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Allocated Tokens</p>
          <p className="font-mono text-2xl font-bold text-white">{formatTokenUnits(allocation.totalQty || 0n)}</p>
        </div>
        {allocation.bonusQty > 0n && (
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Bonus Tokens</p>
            <p className="font-mono text-2xl font-bold text-[rgb(251,191,36)]">{formatTokenUnits(allocation.bonusQty)}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Tokens</p>
          <p className="font-mono text-2xl font-bold text-[rgb(110,231,183)]">{formatTokenUnits(totalTokens)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Payment Due</p>
          <p className="font-mono text-2xl font-bold text-white">{formatEth(allocation.paymentDue || 0n)} ETH</p>
        </div>
        {refundAmount > 0n && (
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Refund Amount</p>
            <p className="font-mono text-2xl font-bold text-[rgb(110,231,183)]">{formatEth(refundAmount)} ETH</p>
          </div>
        )}
      </div>

      {/* Vesting info */}
      {claimableInfo.vestingStartsAt && (
        <div className="mb-4 rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(251,191,36)]">⏰ Vesting Not Started</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            Token vesting starts at {new Date(claimableInfo.vestingStartsAt * 1000).toLocaleString()}.
            {claimableInfo.vestingEndsAt && (
              <> Tokens will unlock fully at {new Date(claimableInfo.vestingEndsAt * 1000).toLocaleString()} (cliff vesting).</>
            )}
          </p>
        </div>
      )}

      {/* Show when vesting is active but tokens not unlocked yet (cliff vesting) */}
      {claimableInfo.isVestingActive && claimableInfo.unlockedPercent === 0 && claimableInfo.vestingEndsAt && (
        <div className="mb-4 rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(251,191,36)]">⏰ Vesting In Progress (Cliff)</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            Tokens are locked until {new Date(claimableInfo.vestingEndsAt * 1000).toLocaleString()}. 
            All tokens will unlock at once when vesting completes (cliff vesting, not gradual).
          </p>
        </div>
      )}

      {/* Show refund available message when vesting hasn't started */}
      {claimableInfo.vestingStartsAt && refundAmount > 0n && !refundAlreadyClaimed && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(110,231,183)]">💰 Refund Available</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            You can claim your refund of {formatEth(refundAmount)} ETH now, even though token vesting hasn't started yet.
          </p>
        </div>
      )}

      {claimableInfo.isVestingActive && claimableInfo.claimableTokens === 0n && !refundAlreadyClaimed && refundAmount > 0n && (
        <div className="mb-4 rounded-xl border border-[rgba(100,116,139,0.4)] bg-[rgba(100,116,139,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">ℹ️ No Tokens Unlocked Yet</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            {claimableInfo.unlockedPercent > 0 
              ? `You have already claimed all unlocked tokens (${claimableInfo.unlockedPercent.toFixed(2)}% unlocked).`
              : "No tokens are unlocked yet based on the vesting schedule."
            }
            {refundAmount > 0n && " You can still claim your refund."}
          </p>
        </div>
      )}

      {/* Show warning if vesting might have ended but UI shows it hasn't */}
      {vestingEnd !== null && mightBeVestingComplete && claimableInfo.claimableTokens === 0n && !refundAlreadyClaimed && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(110,231,183)]">💡 Vesting May Have Ended</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            Based on the vesting schedule, tokens may now be unlocked. The contract will verify the exact blockchain time when you claim.
            {vestingDebug && (
              <> Expected vesting end: {new Date(vestingDebug.vestingEnd * 1000).toLocaleString()}</>
            )}
          </p>
        </div>
      )}

      {/* Only show "Nothing to Claim" if refund is already claimed AND no tokens available AND vesting definitely hasn't ended */}
      {refundAlreadyClaimed && claimableInfo.claimableTokens === 0n && !hasUnclaimedTokens && (
        <div className="mb-4 rounded-xl border border-[rgba(100,116,139,0.4)] bg-[rgba(100,116,139,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">ℹ️ Nothing to Claim</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            Your refund has already been claimed, and no tokens are available to claim at this time.
            {claimableInfo.isVestingActive && ` Check back when more tokens unlock (${claimableInfo.unlockedPercent.toFixed(2)}% unlocked).`}
            {claimableInfo.vestingStartsAt && ` Token vesting starts at ${new Date(claimableInfo.vestingStartsAt * 1000).toLocaleString()}.`}
          </p>
        </div>
      )}

      {/* Show message if vesting might have ended but UI shows it hasn't */}
      {hasUnclaimedTokens && claimableInfo.claimableTokens === 0n && vestingEnd !== null && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(110,231,183)]">💡 Try Claiming Tokens</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            You have {formatTokenUnits(totalTokens - (userData?.tokensClaimed || 0n))} unclaimed tokens. 
            {vestingEnd && (
              <> The vesting period may have ended (expected end: {new Date(vestingEnd * 1000).toLocaleString()}).</>
            )}
            {" "}The contract will verify the exact blockchain time when you claim. If vesting has completed, you'll be able to claim your tokens.
          </p>
        </div>
      )}

      {claimableInfo.isVestingActive && claimableInfo.claimableTokens > 0n && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(110,231,183)]">✅ Tokens Available</p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            {formatTokenUnits(claimableInfo.claimableTokens)} tokens are available to claim 
            ({claimableInfo.unlockedPercent.toFixed(2)}% of total unlocked).
          </p>
        </div>
      )}

      {/* Debug info - show revealed vs allocated */}
      {userData && (
        <div className="mb-4 rounded-xl border border-[rgba(100,116,139,0.3)] bg-[rgba(100,116,139,0.1)] p-4">
          <p className="mb-2 text-xs font-semibold text-[rgba(255,255,255,0.9)]">📊 Allocation Details</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-[rgba(255,255,255,0.7)]">
            <div>
              <span className="font-semibold">Revealed Qty:</span> {formatTokenUnits(userData.revealedQty || 0n)}
            </div>
            <div>
              <span className="font-semibold">Allocated Qty:</span> {formatTokenUnits(allocation.totalQty || 0n)}
            </div>
            <div>
              <span className="font-semibold">Bonus Qty:</span> {formatTokenUnits(allocation.bonusQty || 0n)}
            </div>
            <div>
              <span className="font-semibold">Tokens Claimed:</span> {formatTokenUnits(userData.tokensClaimed || 0n)}
            </div>
            <div>
              <span className="font-semibold">Refunded:</span> {formatEth(userData.refundedAmount || 0n)} ETH
            </div>
            <div>
              <span className="font-semibold">Vesting End:</span> {claimableInfo.vestingEndsAt 
                ? new Date(claimableInfo.vestingEndsAt * 1000).toLocaleString()
                : "N/A"}
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-[rgba(0,0,0,0.3)] p-2">
            <p className="mb-1 text-xs font-semibold text-[rgba(255,255,255,0.9)]">🔍 Raw Values (for debugging):</p>
            <div className="grid grid-cols-2 gap-1 text-xs font-mono text-[rgba(255,255,255,0.6)]">
              <div>revealedQty: {(userData.revealedQty || 0n).toString()}</div>
              <div>allocatedQty: {(allocation.totalQty || 0n).toString()}</div>
              <div>bonusQty: {(allocation.bonusQty || 0n).toString()}</div>
              <div>totalTokens: {totalTokens.toString()}</div>
              <div>paymentDue: {(allocation.paymentDue || 0n).toString()}</div>
              <div>revealedDeposit: {(userData.revealedDeposit || 0n).toString()}</div>
              <div>refundAmount (calc): {refundAmount.toString()}</div>
              <div>refundedAmount (on-chain): {(userData.refundedAmount || 0n).toString()}</div>
              <div>refundAlreadyClaimed: {refundAlreadyClaimed ? "true" : "false"}</div>
              <div>claimableTokens: {claimableInfo.claimableTokens.toString()}</div>
              <div>hasClaimable: {hasClaimable ? "true" : "false"}</div>
              {vestingDebug && (
                <>
                  <div>currentTime (hook): {vestingDebug.currentTimeFromHook || "null"}</div>
                  <div>currentTime (Date): {vestingDebug.currentTimeFromDate}</div>
                  <div>vestingStart: {vestingDebug.vestingStart}</div>
                  <div>vestingEnd: {vestingDebug.vestingEnd}</div>
                  <div>isVestingComplete: {vestingDebug.isVestingComplete ? "true" : "false"}</div>
                  <div>unlockedPercent: {claimableInfo.unlockedPercent.toFixed(2)}%</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mb-4 text-sm text-[rgba(255,255,255,0.7)]">
        Claim your allocated tokens (subject to vesting schedule) and any refunds from excess deposits.
        {claimableInfo.isVestingActive && claimableInfo.unlockedPercent === 0 && (
          <> <strong>Note:</strong> This auction uses cliff vesting - all tokens unlock at once when vesting period ends.</>
        )}
      </p>

      {!isConnected ? (
        <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
          <p className="mb-3 text-[rgba(255,255,255,0.9)]">
            Connect wallet to claim your tokens
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      ) : (
        <button
          onClick={onClaim}
          disabled={!hasClaimable || txState?.status === "pending"}
          className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(16,185,129)] to-[rgb(52,211,153)] px-4 py-4 text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-gradient-to-r hover:not-disabled:from-[rgb(52,211,153)] hover:not-disabled:to-[rgb(16,185,129)] hover:not-disabled:shadow-[0_10px_20px_rgba(16,185,129,0.3)]"
        >
          {txState?.status === "pending" ? "Claiming..." : "Claim Tokens & Refunds"}
        </button>
      )}
    </div>
  );
};

export default ClaimPanel;

