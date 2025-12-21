/* global BigInt */
import React, { useMemo } from "react";
import { ethers } from "ethers";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const CommitForm = ({ 
  form, 
  setForm, 
  auctionData, 
  userData, 
  onSubmit, 
  txState 
}) => {
  const { isConnected } = useAccount();
  const generateCommitHash = () => {
    try {
      const qty = BigInt(form.quantity || "0");
      const priceTickIndex = BigInt(form.priceTickIndex || "0");
      const nonce = form.nonce
        ? (form.nonce.startsWith("0x") && form.nonce.length === 66
            ? form.nonce
            : ethers.id(form.nonce))
        : ethers.ZeroHash;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const commitHash = ethers.keccak256(
        abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTickIndex, qty, nonce])
      );
      
      return commitHash;
    } catch (err) {
      return null;
    }
  };

  const commitHashPreview = useMemo(() => generateCommitHash(), [form]);
  
  const ethRequired = useMemo(() => {
    if (!form.quantity || !auctionData?.priceTicks?.[0]) return "0";
    try {
      const qty = BigInt(form.quantity);
      const price = auctionData.priceTicks[0];
      return formatEth(qty * price);
    } catch {
      return "0";
    }
  }, [form.quantity, auctionData?.priceTicks]);

  if (!auctionData) return null;

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-2xl font-bold text-white">Commit Bid</p>
      <div>
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Quantity (whole units)</label>
          <input
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-base text-white transition-all duration-300 focus:border-[rgba(99,102,241,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="1000"
          />
        </div>
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Price Tick Index</label>
          <select
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-base text-white transition-all duration-300 focus:border-[rgba(99,102,241,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
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
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Nonce (string or bytes32)</label>
          <input
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 font-mono text-xs text-white transition-all duration-300 focus:border-[rgba(99,102,241,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            value={form.nonce}
            onChange={(e) => setForm({ ...form, nonce: e.target.value })}
            placeholder="my-secret-nonce"
          />
        </div>
        {auctionData.merkleRoot && 
         auctionData.merkleRoot !== ethers.ZeroHash && 
         auctionData.merkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Merkle Proof (comma separated bytes32)</label>
            <input
              className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 font-mono text-xs text-white transition-all duration-300 focus:border-[rgba(99,102,241,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
              value={form.merkleProof}
              onChange={(e) => setForm({ ...form, merkleProof: e.target.value })}
              placeholder="0x123...,0x456..."
            />
          </div>
        )}
        {commitHashPreview && (
          <div className="mb-4 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4">
            <p className="mb-2 text-sm text-[rgba(255,255,255,0.7)]">Commit Hash Preview:</p>
            <p className="break-all font-mono text-xs">{commitHashPreview}</p>
          </div>
        )}
        <div className="mb-4 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4">
          <p className="mb-2 text-sm text-[rgba(255,255,255,0.7)]">ETH Required:</p>
          <p className="font-mono text-lg font-semibold text-white">{ethRequired} ETH</p>
        </div>
        {userData && (
          <div className="mb-4 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4">
            <p className="mb-2 text-sm text-[rgba(255,255,255,0.7)]">Your Commits:</p>
            <p className="mb-1 text-sm text-[rgba(255,255,255,0.8)]">Committed Qty: {formatToken(userData.committedQty)}</p>
            <p className="text-sm text-[rgba(255,255,255,0.8)]">Committed Deposit: {formatEth(userData.committedQty * (auctionData.priceTicks[0] || 0n))} ETH</p>
          </div>
        )}
        {!isConnected ? (
          <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
            <p className="mb-3 text-[rgba(255,255,255,0.9)]">
              Connect wallet to participate in the auction
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!form.quantity || !form.nonce || txState?.status === "pending"}
            className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(59,130,246)] to-[rgb(96,165,250)] px-4 py-4 text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-gradient-to-r hover:not-disabled:from-[rgb(96,165,250)] hover:not-disabled:to-[rgb(59,130,246)] hover:not-disabled:shadow-[0_10px_20px_rgba(59,130,246,0.3)]"
          >
            {txState?.status === "pending" ? "Submitting..." : "Submit Commit"}
          </button>
        )}
      </div>
    </div>
  );
};

export default CommitForm;

