import React from "react";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const RevealForm = ({ 
  form, 
  setForm, 
  auctionData, 
  userData, 
  onSubmit, 
  txState 
}) => {
  const { isConnected } = useAccount();
  if (!auctionData) return null;

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-2xl font-bold text-white">Reveal Bid</p>
      <div>
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Commit Index</label>
          <input
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-base text-white transition-all duration-300 focus:border-[rgba(147,51,234,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            type="number"
            value={form.commitIndex}
            onChange={(e) => setForm({ ...form, commitIndex: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Quantity (must match commit)</label>
          <input
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-base text-white transition-all duration-300 focus:border-[rgba(147,51,234,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="1000"
          />
        </div>
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Price Tick Index (must match commit)</label>
          <select
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-base text-white transition-all duration-300 focus:border-[rgba(147,51,234,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            value={form.priceTickIndex}
            onChange={(e) => setForm({ ...form, priceTickIndex: e.target.value })}
          >
            {auctionData.priceTicks.map((tick, idx) => (
              <option key={idx} value={idx}>
                Tick #{idx}: {formatEth(tick)} ETH
              </option>
            ))}
          </select>
        </div>
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Nonce (exact same as commit)</label>
          <input
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 font-mono text-xs text-white transition-all duration-300 focus:border-[rgba(147,51,234,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            value={form.nonce}
            onChange={(e) => setForm({ ...form, nonce: e.target.value })}
            placeholder="my-secret-nonce"
          />
        </div>
        {userData && (
          <div className="mb-4 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4">
            <p className="mb-2 text-sm text-[rgba(255,255,255,0.7)]">Your Reveals:</p>
            <p className="mb-1 text-sm text-[rgba(255,255,255,0.8)]">Revealed Qty: {formatToken(userData.revealedQty)}</p>
            <p className="text-sm text-[rgba(255,255,255,0.8)]">Revealed Deposit: {formatEth(userData.revealedDeposit)} ETH</p>
          </div>
        )}
        {!isConnected ? (
          <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
            <p className="mb-3 text-[rgba(255,255,255,0.9)]">
              Connect wallet to reveal your bid
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!form.quantity || !form.nonce || txState?.status === "pending"}
            className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(147,51,234)] to-[rgb(168,85,247)] px-4 py-4 text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-gradient-to-r hover:not-disabled:from-[rgb(168,85,247)] hover:not-disabled:to-[rgb(147,51,234)] hover:not-disabled:shadow-[0_10px_20px_rgba(147,51,234,0.3)]"
          >
            {txState?.status === "pending" ? "Submitting..." : "Reveal Bid"}
          </button>
        )}
      </div>
    </div>
  );
};

export default RevealForm;

