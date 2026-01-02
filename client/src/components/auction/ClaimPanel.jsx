import React, { useMemo, useState, useEffect } from "react";
import { formatEth, formatToken, formatTokenUnits } from "../../utils/auctionUtils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTime } from "../../time";
import { loadBonusAllocationFromIPFS } from "../../utils/ipfsBonusAllocations";
import { safeContractCall } from "../../utils/contractUtils";
import { isValidCID, getIPFSURL } from "../../services/ipfs/ipfsService";
import { MoneyIcon, LightBulbIcon, CheckIcon, ChartIcon, GiftIcon, InfoIcon, WarningIcon } from "../common/Icons";

const BPS_DENOMINATOR = 10000n;

const ClaimPanel = ({ 
  auctionContract, 
  auctionData, 
  userData, 
  onClaim, 
  txState,
  auctionAddress
}) => {
  const { isConnected, address: account } = useAccount();
  const { currentTime } = useTime();
  const [userBonusFromFile, setUserBonusFromFile] = useState(null);
  const [loadingBonusFromFile, setLoadingBonusFromFile] = useState(false);
  const [isEarlyParticipant, setIsEarlyParticipant] = useState(null);
  const [earlyCheckLoading, setEarlyCheckLoading] = useState(false);
  
  const bonusMerkleRootSet = auctionData?.bonusMerkleRoot && 
    auctionData.bonusMerkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const [ipfsCID, setIpfsCID] = useState(null);
  useEffect(() => {
    if (auctionAddress && typeof window !== 'undefined' && window.localStorage) {
      const storedCID = window.localStorage.getItem(`sttp:bonus-cid:${auctionAddress.toLowerCase()}`);
      setIpfsCID(storedCID);
    }
  }, [auctionAddress]);
  useEffect(() => {
    const checkEarlyParticipant = async () => {
      if (!auctionContract || !account) {
        setIsEarlyParticipant(null);
        return;
      }
      
      setEarlyCheckLoading(true);
      try {
        const isEarly = await safeContractCall(
          () => auctionContract.isEarlyParticipant(account),
          false
        );
        setIsEarlyParticipant(isEarly);
        console.log('[ClaimPanel] Early participant check:', {
          account,
          isEarly,
          auctionAddress
        });
      } catch (err) {
        console.warn('[ClaimPanel] Error checking early participant:', err);
        setIsEarlyParticipant(null);
      } finally {
        setEarlyCheckLoading(false);
      }
    };
    
    checkEarlyParticipant();
  }, [auctionContract, account, auctionAddress]);
  
  useEffect(() => {
    const loadBonus = async () => {
      if (!bonusMerkleRootSet || !auctionAddress || !account || userData?.bonusClaimed) {
        setUserBonusFromFile(null);
        return;
      }
      
      setLoadingBonusFromFile(true);
      try {
        const ipfsCID = auctionData?.bonusAllocationsCID || null;
        
        const merkleRoot = auctionData?.bonusMerkleRoot;
        let bonusAlloc = null;
        if (ipfsCID && isValidCID(ipfsCID)) {
          console.log('[ClaimPanel] Loading bonus allocation from IPFS:', {
            cid: ipfsCID,
            auctionAddress: auctionAddress.toLowerCase(),
            userAddress: account.toLowerCase()
          });
          
          try {
            bonusAlloc = await loadBonusAllocationFromIPFS(
              ipfsCID,
              account,
              auctionAddress,
              merkleRoot
            );
            
            if (bonusAlloc) {
              console.log('[ClaimPanel] Bonus allocation loaded from IPFS');
            } else {
              console.warn('[ClaimPanel] No bonus allocation found in IPFS');
            }
          } catch (ipfsError) {
            console.warn('[ClaimPanel] Error loading from IPFS:', ipfsError);
          }
        }
        if (!bonusAlloc && ipfsCID) {
          console.warn('[ClaimPanel] Failed to load bonus allocation from IPFS. CID:', ipfsCID);
        } else if (!ipfsCID) {
          console.warn('[ClaimPanel] No IPFS CID available for this auction. Owner should set CID in BonusMerkleManager.');
        }
        
        console.log('[ClaimPanel] Bonus allocation result:', {
          found: !!bonusAlloc,
          bonusQty: bonusAlloc?.bonusQty,
          hasProof: !!bonusAlloc?.merkleProof,
          proofLength: bonusAlloc?.merkleProof?.length,
          isEarlyParticipant,
          bonusMerkleRootSet,
          source: ipfsCID ? 'IPFS' : 'local file'
        });
        
        if (bonusAlloc) {
          setUserBonusFromFile({
            bonusQty: BigInt(bonusAlloc.bonusQty),
            merkleProof: bonusAlloc.merkleProof
          });
        } else {
          setUserBonusFromFile(null);
        }
      } catch (err) {
        console.warn('[ClaimPanel] Error loading bonus allocation:', err);
        setUserBonusFromFile(null);
      } finally {
        setLoadingBonusFromFile(false);
      }
    };
    
    loadBonus();
  }, [bonusMerkleRootSet, auctionAddress, account, userData?.bonusClaimed, isEarlyParticipant, auctionData?.bonusMerkleRoot]);

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

  // Bonus allocation is read from contract only (allocation.bonusQty)

  if (!auctionData || !auctionData.finalized || !auctionData.successful) {
    return null;
  }

  if (!allocation || !allocation.computed) {
    // Check if user has revealed deposit - if so, they might have refund to claim
    const hasRevealedDeposit = userData?.revealedDeposit && BigInt(userData.revealedDeposit) > 0n;
    const hasRefundedAmount = userData?.refundedAmount && BigInt(userData.refundedAmount) > 0n;
    const mightHaveRefund = hasRevealedDeposit && (!hasRefundedAmount || BigInt(userData.revealedDeposit) > BigInt(userData.refundedAmount));
    
    // Check if vesting is active
    const vestingStart = auctionData?.vestingStart ? Number(auctionData.vestingStart) : null;
    const vestingDuration = auctionData?.vestingDuration !== undefined ? Number(auctionData.vestingDuration) : null;
    const now = currentTime !== null && currentTime !== undefined 
      ? currentTime 
      : Math.floor(Date.now() / 1000);
    const isVestingActive = vestingStart && vestingDuration && now >= vestingStart && now < (vestingStart + vestingDuration);
    
    return (
      <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
        <p className="mb-4 text-xl font-bold text-white">Claim Tokens</p>
        <p className="text-sm text-[rgba(255,255,255,0.7)]">
          Your allocation will be computed when you claim. Click the button below to claim your tokens and any refunds.
        </p>
        {isVestingActive && mightHaveRefund && (
          <div className="mt-3 rounded-xl border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] p-3">
            <p className="text-xs text-[rgba(255,255,255,0.8)]">
              <span className="font-semibold text-[rgb(110,231,183)]">Note:</span> Tokens are currently locked in vesting, but you may still be able to claim your refund if you deposited more than the clearing price.
            </p>
          </div>
        )}
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
        {/* Show bonus info if Merkle root is set or if user already has bonus allocated */}
        {(bonusMerkleRootSet || allocation.bonusQty > 0n) && (
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">
              Bonus Tokens
              {bonusMerkleRootSet && allocation.bonusQty === 0n && (
                <span className="ml-2 text-xs text-[rgba(255,255,255,0.5)]">(via Merkle proof)</span>
              )}
            </p>
            <p className="font-mono text-2xl font-bold text-[rgb(251,191,36)]">
              {allocation.bonusQty > 0n 
                ? formatTokenUnits(allocation.bonusQty)
                : bonusMerkleRootSet 
                  ? "Available" 
                  : "0"}
            </p>
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
      {claimableInfo.isVestingActive && claimableInfo.unlockedPercent === 0 && claimableInfo.vestingEndsAt && (() => {
        const now = currentTime !== null && currentTime !== undefined 
          ? currentTime 
          : Math.floor(Date.now() / 1000);
        const vestingEnd = claimableInfo.vestingEndsAt;
        const timeRemaining = vestingEnd - now;
        
        let timeText = "";
        if (timeRemaining > 0) {
          const days = Math.floor(timeRemaining / (3600 * 24));
          const hours = Math.floor((timeRemaining % (3600 * 24)) / 3600);
          const minutes = Math.floor((timeRemaining % 3600) / 60);
          
          if (days > 0) {
            timeText = `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
          } else if (hours > 0) {
            timeText = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
          } else {
            timeText = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
          }
        }
        
        return (
          <div className="mb-4 rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] p-4">
            <p className="mb-2 text-sm font-semibold text-[rgb(251,191,36)]"> Vesting In Progress (Cliff)</p>
            <p className="text-sm text-[rgba(255,255,255,0.8)]">
              Tokens are locked until {new Date(claimableInfo.vestingEndsAt * 1000).toLocaleString()}. 
              {timeText && (
                <> <span className="font-semibold text-[rgb(251,191,36)]">Time remaining: {timeText}.</span></>
              )}
              {" "}All tokens will unlock at once when vesting completes (cliff vesting, not gradual).
            </p>
          </div>
        );
      })()}

      {/* Show refund available message when vesting hasn't started */}
      {claimableInfo.vestingStartsAt && refundAmount > 0n && !refundAlreadyClaimed && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(110,231,183)]">
            <MoneyIcon className="h-5 w-5" />
            Refund Available
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            You can claim your refund of {formatEth(refundAmount)} ETH now, even though token vesting hasn't started yet.
          </p>
        </div>
      )}

      {claimableInfo.isVestingActive && claimableInfo.claimableTokens === 0n && !refundAlreadyClaimed && refundAmount > 0n && (
        <div className="mb-4 rounded-xl border border-[rgba(100,116,139,0.4)] bg-[rgba(100,116,139,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">
            <InfoIcon className="h-5 w-5" />
            No Tokens Unlocked Yet
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            {claimableInfo.unlockedPercent > 0 
              ? `You have already claimed all unlocked tokens (${claimableInfo.unlockedPercent.toFixed(2)}% unlocked).`
              : "No tokens are unlocked yet based on the vesting schedule."
            }
            {refundAmount > 0n && " You can still claim your refund."}
          </p>
        </div>
      )}

      {/* Only show "Nothing to Claim" if refund is already claimed AND no tokens available AND vesting definitely hasn't ended */}
      {refundAlreadyClaimed && claimableInfo.claimableTokens === 0n && !hasUnclaimedTokens && (
        <div className="mb-4 rounded-xl border border-[rgba(100,116,139,0.4)] bg-[rgba(100,116,139,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">
            <InfoIcon className="h-5 w-5" />
            Nothing to Claim
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            Your refund has already been claimed, and no tokens are available to claim at this time.
            {claimableInfo.isVestingActive && ` Check back when more tokens unlock (${claimableInfo.unlockedPercent.toFixed(2)}% unlocked).`}
            {claimableInfo.vestingStartsAt && ` Token vesting starts at ${new Date(claimableInfo.vestingStartsAt * 1000).toLocaleString()}.`}
          </p>
        </div>
      )}

      {/* Show message if vesting might have ended but UI shows it hasn't - only show if vesting is NOT active */}
      {hasUnclaimedTokens && claimableInfo.claimableTokens === 0n && vestingEnd !== null && !claimableInfo.isVestingActive && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(110,231,183)]">
            <LightBulbIcon className="h-5 w-5" />
            Try Claiming Tokens
          </p>
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
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(110,231,183)]">
            <CheckIcon className="h-5 w-5" />
            Tokens Available
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.8)]">
            {formatTokenUnits(claimableInfo.claimableTokens)} tokens are available to claim 
            ({claimableInfo.unlockedPercent.toFixed(2)}% of total unlocked).
          </p>
        </div>
      )}

      {/* Debug info - show revealed vs allocated */}
      {userData && (
        <div className="mb-4 rounded-xl border border-[rgba(100,116,139,0.3)] bg-[rgba(100,116,139,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[rgba(255,255,255,0.9)]">
            <ChartIcon className="h-4 w-4" />
            Allocation Details
          </p>
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
        </div>
      )}

      {/* Show info about bonus Merkle root status */}
      {auctionData?.bonusReserve > 0n && (
        <div className="mb-4 rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.1)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(251,191,36)]">
            <GiftIcon className="h-5 w-5" />
            Early Incentives
          </p>
          {bonusMerkleRootSet && ipfsCID && isValidCID(ipfsCID) && (
            <div className="mb-3 rounded-lg border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.05)] p-3">
              <p className="mb-1 text-xs font-semibold text-[rgb(59,130,246)]">📡 Bonus Proofs Source: IPFS</p>
              <div className="text-xs text-[rgba(255,255,255,0.7)]">
                <div className="font-mono break-all mb-1">{ipfsCID}</div>
                {getIPFSURL(ipfsCID) && (
                  <a
                    href={getIPFSURL(ipfsCID)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[rgb(59,130,246)] hover:underline"
                  >
                    View on IPFS →
                  </a>
                )}
              </div>
            </div>
          )}
          {userData?.bonusClaimed ? (
            <div>
              <p className="text-sm text-[rgba(255,255,255,0.8)] mb-2">
                <span className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4" />
                  Your bonus tokens have already been claimed and are included in your total allocation.
                </span>
              </p>
              {allocation?.bonusQty > 0n && (
                <p className="text-sm font-semibold text-[rgb(251,191,36)]">
                  Bonus Tokens Claimed: {formatTokenUnits(allocation.bonusQty)}
                </p>
              )}
            </div>
          ) : bonusMerkleRootSet ? (
            <div>
              <p className="text-sm text-[rgba(255,255,255,0.8)] mb-3">
                Bonus Merkle root is set. {ipfsCID && isValidCID(ipfsCID) 
                  ? "If you're an early participant, your bonus will be verified and included when you claim."
                  : <span className="flex items-center gap-2">
                      <WarningIcon className="h-4 w-4" />
                      IPFS CID not yet published. Please wait for the owner to publish bonus allocations before claiming, or you may forfeit your bonus.
                    </span>}
              </p>
              
              {/* Your Allocation Breakdown - Only when root is set */}
              {account && (
                <div className="mt-4 rounded-lg border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.05)] p-4">
                  <p className="mb-3 text-sm font-semibold text-[rgb(59,130,246)]">Your Token Allocation</p>
                  
                  {loadingBonusFromFile ? (
                    <p className="text-xs text-[rgba(255,255,255,0.6)]">Loading allocation data...</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Guaranteed Base Allocation */}
                      <div className="rounded-lg border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.05)] p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-[rgba(255,255,255,0.8)]">Guaranteed Base Allocation:</span>
                          <span className="text-lg font-bold text-[rgb(34,197,94)]">
                            {allocation?.computed === false
                              ? "Not computed yet"
                              : allocation?.totalQty !== undefined
                                ? formatTokenUnits(allocation.totalQty)
                                : "0"}
                          </span>
                        </div>
                        {allocation?.computed === false && (
                          <p className="text-xs text-[rgba(255,255,255,0.5)] mt-1 italic">
                            Will be computed when you claim
                          </p>
                        )}
                      </div>

                      {/* Additional Bonus */}
                      {userBonusFromFile && userBonusFromFile.bonusQty > 0n ? (
                        <div className="rounded-lg border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.15)] p-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-[rgba(255,255,255,0.8)]">
                              Additional Bonus {ipfsCID && isValidCID(ipfsCID) ? "(from IPFS)" : ""}:
                            </span>
                            <span className="text-lg font-bold text-[rgb(251,191,36)]">
                              {formatTokenUnits(userBonusFromFile.bonusQty)}
                            </span>
                          </div>
                          {ipfsCID && isValidCID(ipfsCID) && (
                            <p className="text-xs text-[rgba(255,255,255,0.6)] mt-1">
                              ✓ Loaded from IPFS
                            </p>
                          )}
                        </div>
                      ) : userBonusFromFile === null && !loadingBonusFromFile ? (
                        <div className="rounded-lg border border-[rgba(100,116,139,0.3)] bg-[rgba(100,116,139,0.05)] p-3">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-[rgba(255,255,255,0.7)]">Additional Bonus:</span>
                              <span className="text-sm text-[rgba(255,255,255,0.5)]">
                                {ipfsCID && isValidCID(ipfsCID) ? "Not found in IPFS allocations" : "Not found"}
                              </span>
                            </div>
                            {earlyCheckLoading ? (
                              <p className="text-xs text-[rgba(255,255,255,0.5)] italic">Checking early participant status...</p>
                            ) : isEarlyParticipant === true ? (
                              <div className="mt-2 rounded border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] p-2">
                                <p className="flex items-center gap-2 text-xs text-[rgb(239,68,68)] font-semibold">
                                  <WarningIcon className="h-4 w-4" />
                                  Status Check:
                                </p>
                                <p className="text-xs text-[rgba(255,255,255,0.8)] mt-1">
                                  <span className="flex items-center gap-2">
                                    <CheckIcon className="h-4 w-4" />
                                    You ARE registered as an early participant on the contract
                                  </span>
                                </p>
                                <p className="text-xs text-[rgba(255,255,255,0.6)] mt-1">
                                  However, your address was not found in the IPFS allocations.
                                  {ipfsCID && isValidCID(ipfsCID) && (
                                    <> CID: {ipfsCID.substring(0, 20)}...</>
                                  )}
                                </p>
                                <p className="text-xs text-[rgba(255,255,255,0.6)] mt-1">
                                  Possible reasons:
                                </p>
                                <ul className="text-xs text-[rgba(255,255,255,0.6)] mt-1 ml-4 list-disc">
                                  <li>Bonus computation script hasn't been run yet</li>
                                  <li>Your base allocation is 0 (no tokens allocated)</li>
                                  <li>IPFS CID might be incorrect or file not accessible</li>
                                  {ipfsCID && isValidCID(ipfsCID) && (
                                    <li>Check IPFS gateway: <a href={getIPFSURL(ipfsCID)} target="_blank" rel="noopener noreferrer" className="text-[rgb(59,130,246)] hover:underline">View on IPFS</a></li>
                                  )}
                                </ul>
                              </div>
                            ) : isEarlyParticipant === false ? (
                              <div className="mt-2 rounded border border-[rgba(100,116,139,0.3)] bg-[rgba(100,116,139,0.1)] p-2">
                                <p className="text-xs text-[rgba(255,255,255,0.7)]">
                                  <span className="flex items-center gap-2">
                                    <InfoIcon className="h-4 w-4" />
                                    You are not registered as an early participant on the contract.
                                  </span>
                                </p>
                                <p className="text-xs text-[rgba(255,255,255,0.5)] mt-1">
                                  This means your commit was made after the early bonus window closed.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {/* Total Claimable */}
                      {allocation?.totalQty !== undefined && userBonusFromFile && userBonusFromFile.bonusQty > 0n && (
                        <div className="mt-3 rounded-lg border-2 border-[rgba(59,130,246,0.5)] bg-[rgba(59,130,246,0.1)] p-4">
                          <div className="flex justify-between items-center">
                            <span className="text-base font-semibold text-[rgb(59,130,246)]">Total You Will Receive:</span>
                            <span className="text-2xl font-bold text-[rgb(59,130,246)]">
                              {formatTokenUnits(allocation.totalQty + userBonusFromFile.bonusQty)}
                            </span>
                          </div>
                          <p className="text-xs text-[rgba(255,255,255,0.6)] mt-2">
                            = {formatTokenUnits(allocation.totalQty)} (base) + {formatTokenUnits(userBonusFromFile.bonusQty)} (bonus)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[rgba(255,255,255,0.8)]">
              Bonus Merkle root not set yet. You can still claim your base allocation. Bonus tokens will be available once the owner sets the Merkle root.
            </p>
          )}
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

