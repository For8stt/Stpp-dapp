import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { Contract } from "ethers";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import { ensureProvider } from "../../services/web3/provider";
import allAbis from "../../abi/allAbis.json";

const FinalizedPanel = React.memo(({ auctionData, isOwner, onLaunchLBP, managerAddress, auctionAddress }) => {
  const [lbpAddress, setLbpAddress] = useState(null);

  useEffect(() => {
    const fetchLbpAddress = async () => {
      if (!managerAddress || !auctionData?.finalized || !auctionAddress) {
        setLbpAddress(null);
        return;
      }
      try {
        // Use read-only provider to avoid wallet connection popup
        const provider = ensureProvider();
        const abi = allAbis.PresaleManager || [];
        if (abi.length === 0) {
          console.warn("PresaleManager ABI not found");
          return;
        }
        const managerContract = new Contract(managerAddress, abi, provider);
        const info = await managerContract.getPresaleInfo(auctionAddress);
        if (info && info.length > 2 && info[2] !== ethers.ZeroAddress) {
          setLbpAddress(info[2]);
        }
      } catch (error) {
        console.warn("Could not fetch LBP address:", error);
        setLbpAddress(null);
      }
    };
    fetchLbpAddress();
  }, [managerAddress, auctionAddress, auctionData?.finalized]);

  if (!auctionData || !auctionData.finalized) return null;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(16,185,129,0.3)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-2xl font-bold text-[rgb(110,231,183)]">Auction Finalized</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Tokens Sold</p>
          <p className="font-mono text-2xl font-bold text-[rgb(110,231,183)]">{formatToken(auctionData.tokensSold)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Total Raised</p>
          <p className="font-mono text-2xl font-bold text-[rgb(110,231,183)]">{formatEth(auctionData.totalRaised)} ETH</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">ETH for Treasury</p>
          <p className="font-mono text-2xl font-bold text-[rgb(110,231,183)]">{formatEth(auctionData.ethForTreasury)} ETH</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Clearing Price</p>
          <p className="font-mono text-2xl font-bold text-[rgb(110,231,183)]">{formatEth(auctionData.clearingPrice)} ETH</p>
        </div>
      </div>
      {!auctionData.lbpLaunched && isOwner && onLaunchLBP && (
        <button
          onClick={onLaunchLBP}
          className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(99,102,241)] to-[rgb(129,140,248)] px-6 py-3 font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-gradient-to-r hover:from-[rgb(129,140,248)] hover:to-[rgb(99,102,241)] hover:shadow-[0_10px_20px_rgba(99,102,241,0.3)]"
        >
          Launch LBP
        </button>
      )}
      {!auctionData.lbpLaunched && isOwner && !onLaunchLBP && managerAddress && (
        <div className="mt-4 rounded-xl border border-[rgba(99,102,241,0.3)] bg-[rgba(99,102,241,0.1)] p-4">
          <p className="mb-3 text-sm font-medium text-[rgba(255,255,255,0.9)]">
            Ready to Launch LBP
          </p>
          <p className="text-xs text-[rgba(255,255,255,0.6)]">
            LBP will be available here once launched.
          </p>
        </div>
      )}
      {auctionData.lbpLaunched && (lbpAddress || auctionData.lbpTokenRecipient !== ethers.ZeroAddress) && (
        <div className="mt-6 rounded-xl border border-[rgba(99,102,241,0.3)] bg-[rgba(99,102,241,0.1)] p-4">
          <p className="mb-3 text-sm font-medium text-[rgba(255,255,255,0.9)]">
             LBP Successfully Launched
          </p>
          {lbpAddress && (
            <>
              <p className="mb-2 font-mono text-xs text-[rgba(255,255,255,0.6)]">
                LBP Contract: {lbpAddress}
              </p>
              <Link
                to={`/lbp/${lbpAddress}`}
                className="mt-2 inline-block rounded-lg bg-[rgb(99,102,241)] px-4 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-[rgb(79,70,229)]"
              >
                View LBP →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
});

FinalizedPanel.displayName = 'FinalizedPanel';

export default FinalizedPanel;

