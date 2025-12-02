import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ethers } from "ethers";

import AuctionControls from "../components/presale/AuctionControls";
import CreateAuctionForm from "../components/presale/CreateAuctionForm";
import loadContract from "../services/web3/loadContract";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";

const toDateInput = (secondsFromNow = 0) =>
  new Date((Math.floor(Date.now() / 1000) + secondsFromNow) * 1000).toISOString().slice(0, 16);

const defaultAuctionForm = {
  saleToken: "",
  treasury: "",
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  tokensForSale: "",
  bonusReserve: "",
  perAddressCap: "",
  softCap: "",
  merkleRoot: ethers.ZeroHash,
  priceTicks: "1,0.9,0.8",
};

const defaultLbpConfig = {
  startTime: toDateInput(7200),
  endTime: toDateInput(17200),
  poolStartWeightToken: "80",
  poolEndWeightToken: "20",
  poolSwapFee: "0.003",
  vestingCliffDuration: "0",
  vestingFinalDuration: "2592000",
  vestingCliffPercentBP: "0",
};

const parseTimestamp = (value) => {
  if (!value) return Math.floor(Date.now() / 1000) + 600;
  const result = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(result) ? result : Math.floor(Date.now() / 1000) + 600;
};
const parseEtherValue = (value) => (value ? ethers.parseUnits(value, 18).toString() : "0");
const parseBps = (value) => Number(value || 0);
const parseWeight = (value) => ethers.parseUnits(((Number(value || 0) / 100) || 0).toString(), 18).toString();

const PresalePage = ({ account }) => {
  const { address } = useParams();
  const [managerContract, setManagerContract] = useState(null);
  const [info, setInfo] = useState(null);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [auctionForm, setAuctionForm] = useState(defaultAuctionForm);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [lbpConfig, setLbpConfig] = useState(defaultLbpConfig);

  const refreshInfo = useCallback(async () => {
    if (!address) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const normalizedAddress = address.toLowerCase();
      let factoryContract = null;
      try {
        factoryContract = await loadContract("PublicPresaleFactory");
      } catch {
        // ignore missing factory configuration
      }
      if (factoryContract) {
        const factoryAddress = (factoryContract.target || factoryContract.address || "").toString().toLowerCase();
        if (factoryAddress === normalizedAddress) {
          setError(
            "This address is the public factory. Open one of the PresaleManager clones emitted by the factory (see All presales)."
          );
          setManagerContract(null);
          setAuctions([]);
          setInfo(null);
          return;
        }
      }
      const contract = await loadContract("PresaleManager", address);
      setManagerContract(contract);
      const ownerAddress = await contract.owner();
      const auctionsList = await contract.getAllAuctions();
      setAuctions(auctionsList);

      let latestInfo = null;
      if (auctionsList.length > 0) {
        const targetAuction = auctionsList[auctionsList.length - 1];
        let details = null;

        if (typeof contract.getPresaleInfo === "function") {
          details = await contract.getPresaleInfo(targetAuction);
        } else if (typeof contract.getLatestPresaleInfo === "function") {
          details = await contract.getLatestPresaleInfo();
        } else if (typeof contract.getAuctionRecord === "function") {
          const record = await contract.getAuctionRecord(targetAuction);
          details = [
            ownerAddress,
            targetAuction,
            record.lbp,
            record.vestingEscrow,
            record.finalized,
            record.lbpInitialized,
            record.lbpFinalized,
            record.tokensForSale,
            record.bonusReserve,
            record.totalRaised,
            record.clearingPrice,
          ];
        }

        if (details) {
          latestInfo = {
            owner: details[0],
            auction: details[1],
            lbp: details[2],
            vesting: details[3],
            finalized: details[4],
            lbpInitialized: details[5],
            lbpFinalized: details[6],
            tokensForSale: details[7],
            bonusReserve: details[8],
            totalRaised: details[9],
            clearingPrice: details[10],
          };
        }
      }

      setInfo(latestInfo);
      setIsOwner(ownerAddress?.toLowerCase() === account?.toLowerCase());
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load presale");
    } finally {
      setLoading(false);
    }
  }, [address, account]);

  useEffect(() => {
    refreshInfo();
  }, [refreshInfo]);

  const handleAuctionFormChange = (name, value) => {
    setAuctionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLbpConfigChange = (name, value) => {
    setLbpConfig((prev) => ({ ...prev, [name]: value }));
  };

  const launchLbpConfig = useMemo(
    () => ({
      startTime: parseTimestamp(lbpConfig.startTime),
      endTime: parseTimestamp(lbpConfig.endTime),
      poolStartWeightToken: parseWeight(lbpConfig.poolStartWeightToken),
      poolEndWeightToken: parseWeight(lbpConfig.poolEndWeightToken),
      poolSwapFee: ethers.parseUnits(lbpConfig.poolSwapFee || "0.003", 18).toString(),
      vestingStartTime: info?.vesting ? parseTimestamp(lbpConfig.startTime) : parseTimestamp(lbpConfig.startTime),
      vestingCliffDuration: Number(lbpConfig.vestingCliffDuration || 0),
      vestingFinalDuration: Number(lbpConfig.vestingFinalDuration || 0),
      vestingCliffPercentBP: parseBps(lbpConfig.vestingCliffPercentBP),
    }),
    [lbpConfig, info]
  );

  const submitAuction = async () => {
    if (!managerContract) return;
    try {
      setCreatingAuction(true);
      const startTime = parseTimestamp(auctionForm.startTime);
      const payload = {
        saleToken: auctionForm.saleToken,
        treasury: auctionForm.treasury,
        startTime,
        commitDuration: Number(auctionForm.commitDuration || 0),
        revealDuration: Number(auctionForm.revealDuration || 0),
        perAddressCap: parseEtherValue(auctionForm.perAddressCap),
        softCap: parseEtherValue(auctionForm.softCap),
        tokensForSale: parseEtherValue(auctionForm.tokensForSale),
        bonusReserve: parseEtherValue(auctionForm.bonusReserve),
        earlyBonusWindow: 0,
        earlyBonusPct: 0,
        nonRevealPenaltyBps: 0,
        lbpStableShareBps: 4000,
        thresholdLow: 0,
        maxDecayMultiplier: ethers.parseUnits("1", 18).toString(),
        minCommitDuration: 600,
        demandCheckTime: startTime + 900,
        vestingStart: startTime + 86400,
        vestingDuration: 2_592_000,
        merkleRoot: auctionForm.merkleRoot || ethers.ZeroHash,
        priceTicks: auctionForm.priceTicks
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((tick) => ethers.parseEther(tick).toString()),
      };

      setTxStatus({ status: "pending", message: "Creating auction..." });
      showTxInfo("Please confirm the transaction in your wallet", { autoClose: false });
      const tx = await managerContract.createAuction(payload);
      showTxInfo("Transaction submitted to the network", { autoClose: 3000 });
      setTxStatus({ status: "pending", message: "Transaction submitted", hash: tx.hash });
      await tx.wait();
      showTxSuccess("Auction created successfully!", { autoClose: 3000 });
      setTxStatus({ status: "success", message: "Auction created", hash: tx.hash });
      await refreshInfo();
    } catch (err) {
      console.error(err);
      handleTxError(err, "Unable to create auction");
      setTxStatus({ status: "error", message: err?.message || "Unable to create auction" });
    } finally {
      setCreatingAuction(false);
    }
  };

  const runAction = async (label, action) => {
    if (!managerContract || !info?.auction) return;
    try {
      setTxStatus({ status: "pending", message: `${label}…` });
      showTxInfo(`Please confirm ${label.toLowerCase()} in your wallet`, { autoClose: false });
      const tx = await action();
      showTxInfo(`${label} submitted to the network`, { autoClose: 3000 });
      setTxStatus({ status: "pending", message: `${label} submitted`, hash: tx.hash });
      await tx.wait();
      showTxSuccess(`${label} completed successfully!`, { autoClose: 3000 });
      setTxStatus({ status: "success", message: `${label} confirmed`, hash: tx.hash });
      await refreshInfo();
    } catch (err) {
      console.error(err);
      handleTxError(err, `Failed to ${label.toLowerCase()}`);
      setTxStatus({ status: "error", message: err?.message || `Failed to ${label.toLowerCase()}` });
    }
  };

  const handleFinalizeAuction = () =>
    runAction("Finalize auction", () => managerContract.finalizeAuction(info.auction));

  const handleLaunchLbp = () =>
    runAction("Launch LBP", () => managerContract.launchLBP(info.auction, launchLbpConfig));

  const handleFinalizeLbp = () =>
    runAction("Finalize LBP", () => managerContract.finalizeLbp(info.auction, info.vesting));

  const handleUnwind = () => runAction("Unwind LBP", () => managerContract.unwindLbpAll(info.auction));

  return (
    <section className="page space-y-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-7 text-white shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-white/70">Presale manager</p>
            <h1 className="text-2xl font-semibold">{address}</h1>
          </div>
          {info?.auction && (
            <Link
              to={`/presale/${address}/auction`}
              className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Open auction view
            </Link>
          )}
        </div>
        {info && (
          <div className="mt-5 grid gap-4 text-sm text-white/70 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Owner</p>
              <p className="font-mono">{info.owner}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Auction</p>
              <p className="font-mono">{info.auction || "Pending"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">LBP</p>
              <p className="font-mono">{info.lbp || "Not initialized"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40">Vesting escrow</p>
              <p className="font-mono">{info.vesting || "Not created"}</p>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center text-white/70">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-6 text-rose-200">{error}</div>
      ) : (
        <>
          <AuctionControls
            isOwner={isOwner}
            auctionAddress={info?.auction}
            onFinalizeAuction={handleFinalizeAuction}
            onLaunchLbp={handleLaunchLbp}
            onFinalizeLbp={handleFinalizeLbp}
            onUnwind={handleUnwind}
            lbpConfig={lbpConfig}
            onLbpConfigChange={handleLbpConfigChange}
            disabled={!info?.auction}
          />

          {isOwner && (
            <CreateAuctionForm
              values={auctionForm}
              onChange={handleAuctionFormChange}
              onSubmit={submitAuction}
              disabled={creatingAuction}
            />
          )}

          {auctions.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-white/70">
              <p className="text-base font-semibold text-white">Deployed auctions</p>
              <ul className="mt-3 space-y-2 font-mono">
                {auctions.map((auctionAddress) => (
                  <li key={auctionAddress} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                    {auctionAddress}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

    </section>
  );
};

export default PresalePage;
