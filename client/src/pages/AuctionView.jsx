/* eslint-env es2020 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";

import TxStatusIndicator from "../components/common/TxStatusIndicator";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";

const toDate = (timestamp) => new Date(Number(timestamp || 0) * 1000).toLocaleString();

const AuctionView = () => {
  const { address } = useParams();
  const [auctionAddress, setAuctionAddress] = useState("");
  const [auctionContract, setAuctionContract] = useState(null);
  const [priceTicks, setPriceTicks] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [commitForm, setCommitForm] = useState({
    priceTickIndex: "0",
    quantity: "",
    nonce: "",
    merkleProof: "",
  });
  const [revealForm, setRevealForm] = useState({
    priceTickIndex: "0",
    quantity: "",
    nonce: "",
    commitIndex: "0",
  });
  const [txState, setTxState] = useState(null);

  const fetchAuction = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const manager = await loadContract("PresaleManager", address);
      const latest = await manager.getLatestPresaleInfo();
      const auctionAddr = latest[1];
      if (!auctionAddr || auctionAddr === ethers.ZeroAddress) {
        throw new Error("Auction not initialized for this presale yet.");
      }

      const auction = await loadContract("DutchAuction", auctionAddr);
      setAuctionContract(auction);
      setAuctionAddress(auctionAddr);

      const [startTime, commitEndTime, revealEndTime, tokensForSale, bonusReserve, perAddressCap, saleToken] =
        await Promise.all([
          auction.startTime(),
          auction.commitEndTime(),
          auction.revealEndTime(),
          auction.tokensForSale(),
          auction.bonusReserve(),
          auction.perAddressCap(),
          auction.saleToken(),
        ]);

      const tickLength = Number(await auction.priceTicksLength());
      const ticks = [];
      for (let i = 0; i < tickLength; i += 1) {
        const tick = await auction.priceTicks(i);
        ticks.push(tick);
      }
      setPriceTicks(ticks);

      setStats({
        startTime: Number(startTime),
        commitEnd: Number(commitEndTime),
        revealEnd: Number(revealEndTime),
        tokensForSale: tokensForSale.toString(),
        bonusReserve: bonusReserve.toString(),
        perAddressCap: perAddressCap.toString(),
        saleToken,
      });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load auction");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchAuction();
  }, [fetchAuction]);

  const referencePrice = useMemo(() => (priceTicks.length > 0 ? priceTicks[0] : 0n), [priceTicks]);

  const formatEth = (value) => (value ? ethers.formatEther(value) : "0");

  const updateCommitForm = (name, value) => {
    setCommitForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateRevealForm = (name, value) => {
    setRevealForm((prev) => ({ ...prev, [name]: value }));
  };

  const normalizeNonce = (value) => {
    if (!value) return ethers.ZeroHash;
    if (value.startsWith("0x") && value.length === 66) {
      return value;
    }
    return ethers.id(value);
  };

  const parseProof = (value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const handleCommit = async () => {
    if (!auctionContract) return;
    try {
      const qty = BigInt(commitForm.quantity || "0");
      if (qty <= 0n) {
        throw new Error("Quantity must be greater than zero");
      }

      const priceTickIndex = BigInt(commitForm.priceTickIndex || "0");
      const nonce = normalizeNonce(commitForm.nonce);
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const commitHash = ethers.keccak256(abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTickIndex, qty, nonce]));
      const merkleProof = parseProof(commitForm.merkleProof);

      const depositValue = qty * referencePrice;
      if (depositValue === 0n) {
        throw new Error("Unable to compute deposit. Check price ticks and quantity.");
      }

      setTxState({ status: "pending", message: "Submitting commit…" });
      showTxInfo("Please confirm the commit transaction in your wallet", { autoClose: false });
      const tx = await auctionContract.commit(commitHash, merkleProof, { value: depositValue });
      showTxInfo("Commit transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "Commit in mempool", hash: tx.hash });
      await tx.wait();
      showTxSuccess("Commit confirmed successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "Commit confirmed", hash: tx.hash });
    } catch (err) {
      console.error(err);
      handleTxError(err, "Commit failed");
      setTxState({ status: "error", message: err?.message || "Commit failed" });
    }
  };

  const handleReveal = async () => {
    if (!auctionContract) return;
    try {
      const qty = BigInt(revealForm.quantity || "0");
      if (qty <= 0n) {
        throw new Error("Quantity must be greater than zero");
      }
      const priceTickIndex = BigInt(revealForm.priceTickIndex || "0");
      const nonce = normalizeNonce(revealForm.nonce);
      const commitIndex = Number(revealForm.commitIndex || 0);

      setTxState({ status: "pending", message: "Submitting reveal…" });
      showTxInfo("Please confirm the reveal transaction in your wallet", { autoClose: false });
      const tx = await auctionContract.reveal(priceTickIndex, qty, nonce, commitIndex);
      showTxInfo("Reveal transaction submitted to the network", { autoClose: 3000 });
      setTxState({ status: "pending", message: "Reveal in mempool", hash: tx.hash });
      await tx.wait();
      showTxSuccess("Reveal confirmed successfully!", { autoClose: 3000 });
      setTxState({ status: "success", message: "Reveal confirmed", hash: tx.hash });
    } catch (err) {
      console.error(err);
      handleTxError(err, "Reveal failed");
      setTxState({ status: "error", message: err?.message || "Reveal failed" });
    }
  };

  return (
    <section className="page space-y-6 text-white">
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-7 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-white/70">Presale manager</p>
          <h1 className="text-2xl font-semibold">{address}</h1>
          <p className="text-sm text-white/60">Auction address: {auctionAddress || "—"}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center text-white/70">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-6 text-rose-200">{error}</div>
      ) : (
        <>
          <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-sm text-white/80 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Sale token</p>
              <p className="font-mono">{stats?.saleToken}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Tokens for sale</p>
              <p>{stats?.tokensForSale}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Commit phase</p>
              <p>
                {toDate(stats?.startTime)} → {toDate(stats?.commitEnd)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Reveal phase</p>
              <p>{toDate(stats?.revealEnd)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Per wallet cap</p>
              <p>{stats?.perAddressCap}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Bonus reserve</p>
              <p>{stats?.bonusReserve}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 text-sm text-white/80">
            <p className="text-base font-semibold text-white">Price ticks</p>
            <ul className="mt-3 space-y-2 font-mono">
              {priceTicks.map((tick, index) => (
                <li key={index} className="rounded-lg border border-white/5 bg-black/30 px-3 py-2">
                  Tick #{index}: {formatEth(tick)} ETH
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <p className="mb-4 text-lg font-semibold text-white">Commit bid</p>
              <div className="space-y-3">
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Price tick index
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={commitForm.priceTickIndex}
                    onChange={(event) => updateCommitForm("priceTickIndex", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Quantity (whole units)
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={commitForm.quantity}
                    onChange={(event) => updateCommitForm("quantity", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Nonce (string or bytes32)
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={commitForm.nonce}
                    onChange={(event) => updateCommitForm("nonce", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Merkle proof (comma separated bytes32)
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={commitForm.merkleProof}
                    onChange={(event) => updateCommitForm("merkleProof", event.target.value)}
                  />
                </label>
                <button
                  onClick={handleCommit}
                  className="mt-2 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
                >
                  Submit commit
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <p className="mb-4 text-lg font-semibold text-white">Reveal bid</p>
              <div className="space-y-3">
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Price tick index
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={revealForm.priceTickIndex}
                    onChange={(event) => updateRevealForm("priceTickIndex", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Quantity
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={revealForm.quantity}
                    onChange={(event) => updateRevealForm("quantity", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Nonce (exact same as commit)
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={revealForm.nonce}
                    onChange={(event) => updateRevealForm("nonce", event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/70">
                  Commit index
                  <input
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none"
                    value={revealForm.commitIndex}
                    onChange={(event) => updateRevealForm("commitIndex", event.target.value)}
                  />
                </label>
                <button
                  onClick={handleReveal}
                  className="mt-2 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  Reveal bid
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <TxStatusIndicator
        status={txState?.status}
        message={txState?.message}
        hash={txState?.hash}
        onClear={() => setTxState(null)}
      />
    </section>
  );
};

export default AuctionView;
