import React, { useState, useCallback } from "react";
import { ethers } from "ethers";
import { handleTxError, showTxSuccess } from "../../utils/txErrorHandler";
import { ensureSigner } from "../../services/web3/signer";
import allAbis from "../../abi/allAbis.json";
import { formatTokenUnits } from "../../utils/auctionUtils";

/**
 * Component for managing bonus Merkle root (owner only)
 * Allows owner to:
 * 1. Compute bonus allocations off-chain (triggers script execution)
 * 2. Set Merkle root on-chain
 */
const BonusMerkleManager = ({ auctionContract, auctionAddress, auctionData, onUpdate }) => {
  const [merkleRoot, setMerkleRoot] = useState("");
  const [computing, setComputing] = useState(false);
  const [setting, setSetting] = useState(false);
  const [computedData, setComputedData] = useState(null);
  const [error, setError] = useState("");

  const rootSet = auctionData?.bonusMerkleRoot && 
    auctionData.bonusMerkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  const handleComputeBonus = useCallback(async () => {
    if (!auctionAddress) {
      setError("Auction address not available");
      return;
    }

      setComputing(true);
      setError("");
      setComputedData(null);

    try {
      
      const message = `To compute bonus allocations, run the following command in the contract directory:

npx hardhat run scripts/computeBonusAllocations.ts --network <network> ${auctionAddress}

This will generate a bonus-allocations.json file with Merkle root and proofs.
After the file is generated, you can upload it in Step 2.`;

      alert(message);
      
      setError("Please run the off-chain script to compute bonus allocations. See instructions above.");
    } catch (err) {
      console.error("Error computing bonus:", err);
      setError(err.message || "Failed to compute bonus allocations");
    } finally {
      setComputing(false);
    }
  }, [auctionAddress]);

  const handleLoadFromFile = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError("");
    setComputing(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.merkleRoot) {
        throw new Error("Invalid bonus allocations file: missing merkleRoot");
      }

      if (!data.allocations || typeof data.allocations !== "object") {
        throw new Error("Invalid bonus allocations file: missing allocations");
      }

      const allocationCount = Object.keys(data.allocations).length;
      let totalBonus = 0n;
      for (const addr in data.allocations) {
        totalBonus += BigInt(data.allocations[addr].bonusQty || "0");
      }

      setComputedData({
        merkleRoot: data.merkleRoot,
        allocationCount,
        totalBonus,
        summary: data.summary || null,
      });
      setMerkleRoot(data.merkleRoot);
    } catch (err) {
      console.error("Error loading file:", err);
      setError(err.message || "Failed to load bonus allocations file");
    } finally {
      setComputing(false);
    }
  }, []);

  const handleSetMerkleRoot = useCallback(async () => {
    if (!merkleRoot || !auctionContract) {
      setError("Merkle root or auction contract not available");
      return;
    }

    if (rootSet) {
      setError("Merkle root is already set and cannot be changed");
      return;
    }

    if (!merkleRoot.startsWith("0x") || merkleRoot.length !== 66) {
      setError("Invalid Merkle root format. Must be a 32-byte hex string (0x...).");
      return;
    }

    setSetting(true);
    setError("");

    try {
      const signer = await ensureSigner();
      const auctionWithSigner = auctionContract.connect(signer);
      const signerAddress = await signer.getAddress();

      console.log("[BonusMerkleManager] Pre-flight checks...");
      const finalized = await auctionContract.finalized();
      if (!finalized) {
        setError("Auction must be finalized before setting Merkle root");
        setSetting(false);
        return;
      }

      const currentRoot = await auctionContract.bonusMerkleRoot();
      if (currentRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        setError("Merkle root is already set and cannot be changed");
        setSetting(false);
        return;
      }

      const owner = await auctionContract.owner();
      const manager = await auctionContract.presaleManager();
      const isAuctionOwner = owner.toLowerCase() === signerAddress.toLowerCase();
      const isManager = manager.toLowerCase() === signerAddress.toLowerCase();
      
      let isManagerOwner = false;
      if (!isAuctionOwner && !isManager) {
        try {
          const { Contract } = await import("ethers");
          const allAbis = await import("../../abi/allAbis.json");
          const { ensureProvider } = await import("../../services/web3/provider");
          const provider = ensureProvider();
          const managerAbi = allAbis.PresaleManager || [];
          if (managerAbi.length > 0) {
            const managerContract = new Contract(manager, managerAbi, provider);
            const managerOwner = await managerContract.owner();
            isManagerOwner = managerOwner.toLowerCase() === signerAddress.toLowerCase();
          }
        } catch (err) {
          console.warn("Could not check manager owner:", err);
        }
      }
      
      if (!isAuctionOwner && !isManager && !isManagerOwner) {
        setError(`Only the auction owner, manager, or manager owner can set Merkle root. Auction owner: ${owner}, Manager: ${manager}, Your address: ${signerAddress}`);
        setSetting(false);
        return;
      }
      
      console.log("[BonusMerkleManager] Authorization check:", {
        isAuctionOwner,
        isManager,
        isManagerOwner,
        signerAddress,
        auctionOwner: owner,
        managerAddress: manager
      });

      console.log("[BonusMerkleManager] All checks passed, sending transaction...");
      console.log("[BonusMerkleManager] Setting root:", merkleRoot);

      try {
        const gasEstimate = await auctionWithSigner.setBonusMerkleRoot.estimateGas(merkleRoot);
        console.log("[BonusMerkleManager] Gas estimate:", gasEstimate.toString());
      } catch (estimateError) {
        console.error("[BonusMerkleManager] Gas estimation failed:", estimateError);
        let errorMsg = "Transaction will fail. ";
        if (estimateError?.reason) {
          errorMsg += estimateError.reason;
        } else if (estimateError?.message) {
          errorMsg += estimateError.message;
        } else {
          errorMsg += "Possible reasons: not the owner, auction not finalized, or root already set.";
        }
        setError(errorMsg);
        setSetting(false);
        return;
      }

      const tx = await auctionWithSigner.setBonusMerkleRoot(merkleRoot);
      console.log("[BonusMerkleManager] Transaction sent:", tx.hash);
      
      await tx.wait();
      console.log("[BonusMerkleManager] Transaction confirmed");

      showTxSuccess("Merkle root set successfully!");
      
      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error("Error setting Merkle root:", err);
      
      let errorMessage = "Failed to set Merkle root";
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      }
      if (errorMessage.includes("missing revert data") || errorMessage.includes("CALL_EXCEPTION")) {
        errorMessage = "Transaction failed. Please check: 1) You are the auction owner, 2) Auction is finalized, 3) Merkle root is not already set.";
      }
      
      handleTxError(err, errorMessage);
      setError(errorMessage);
    } finally {
      setSetting(false);
    }
  }, [merkleRoot, auctionContract, rootSet, onUpdate]);

  if (!auctionData?.finalized) {
    return null; // Only show after finalization
  }

  if (auctionData?.bonusReserve === 0n || !auctionData?.earlyBonusPct || auctionData.earlyBonusPct === 0n) {
    return null; // No early incentives configured
  }

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(251,191,36,0.3)] bg-gradient-to-br from-[rgba(251,191,36,0.1)] to-[rgba(217,119,6,0.05)] p-6 shadow-lg">
      <h3 className="mb-4 text-xl font-bold text-[rgb(251,191,36)]">Early Incentives Management</h3>
      
      <div className="mb-4 space-y-3">
        <div className="rounded-xl border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.05)] p-4">
          <p className="mb-2 text-sm font-semibold text-[rgb(251,191,36)]">Status</p>
          <div className="space-y-1 text-sm text-[rgba(255,255,255,0.8)]">
            <div className="flex justify-between">
              <span>Merkle Root Set:</span>
              <span className={rootSet ? "text-[rgb(34,197,94)]" : "text-[rgb(239,68,68)]"}>
                {rootSet ? "Yes" : "No"}
              </span>
            </div>
            {rootSet && auctionData?.bonusMerkleRoot && (
              <div className="mt-2 break-all font-mono text-xs text-[rgba(255,255,255,0.6)]">
                {auctionData.bonusMerkleRoot}
              </div>
            )}
            <div className="flex justify-between">
              <span>Bonus Reserve:</span>
              <span>{formatTokenUnits(auctionData?.bonusReserve || 0n)}</span>
            </div>
            <div className="flex justify-between">
              <span>Remaining Reserve:</span>
              <span>{formatTokenUnits(auctionData?.bonusReserveRemaining || 0n)}</span>
            </div>
            <div className="flex justify-between">
              <span>Early Bonus %:</span>
              <span>{auctionData?.earlyBonusPct ? (Number(auctionData.earlyBonusPct) / 100).toFixed(2) : "0"}%</span>
            </div>
          </div>
        </div>
      </div>

      {!rootSet && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">
              Step 1: Compute Bonus Allocations
            </p>
            <p className="mb-3 text-xs text-[rgba(255,255,255,0.7)]">
              Run the off-chain script to compute bonus allocations and generate the Merkle tree.
            </p>
            <button
              onClick={handleComputeBonus}
              disabled={computing}
              className="rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.1)] px-4 py-2 text-sm font-semibold text-[rgb(251,191,36)] transition-all hover:bg-[rgba(251,191,36,0.2)] disabled:opacity-50"
            >
              {computing ? "Computing..." : "Show Instructions"}
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">
              Step 2: Load Bonus Allocations File
            </p>
            <p className="mb-3 text-xs text-[rgba(255,255,255,0.7)]">
              Upload the bonus-allocations.json file generated by the script.
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleLoadFromFile}
              disabled={computing}
              className="block w-full text-sm text-[rgba(255,255,255,0.7)] file:mr-4 file:rounded-xl file:border-0 file:bg-[rgba(251,191,36,0.2)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[rgb(251,191,36)] hover:file:bg-[rgba(251,191,36,0.3)]"
            />
          </div>

          {computedData && (
            <div className="rounded-xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] p-4">
              <p className="mb-2 text-sm font-semibold text-[rgb(34,197,94)]">Computed Data</p>
              <div className="space-y-1 text-xs text-[rgba(255,255,255,0.8)]">
                <div>Allocations: {computedData.allocationCount}</div>
                <div>Total Bonus: {formatTokenUnits(computedData.totalBonus)}</div>
                {computedData.summary && (
                  <div className="mt-2 rounded bg-[rgba(0,0,0,0.2)] p-2">
                    <pre className="text-xs">{JSON.stringify(computedData.summary, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-[rgba(255,255,255,0.9)]">
              Step 3: Set Merkle Root On-Chain
            </p>
            <p className="mb-3 text-xs text-[rgba(255,255,255,0.7)]">
              Enter the Merkle root (or use the one from the file) and set it on-chain.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={merkleRoot}
                onChange={(e) => setMerkleRoot(e.target.value)}
                placeholder="0x..."
                className="flex-1 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] px-4 py-2 text-sm text-white placeholder-[rgba(255,255,255,0.5)] focus:border-[rgb(251,191,36)] focus:outline-none"
              />
              <button
                onClick={handleSetMerkleRoot}
                disabled={!merkleRoot || setting || rootSet}
                className="rounded-xl border-0 bg-gradient-to-r from-[rgb(251,191,36)] to-[rgb(217,119,6)] px-6 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {setting ? "Setting..." : "Set Root"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rootSet && (
        <div className="rounded-xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] p-4">
          <p className="text-sm font-semibold text-[rgb(34,197,94)]">
            ✅ Merkle root is set. Early participants can now claim their bonuses.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] p-3">
          <p className="text-sm text-[rgb(239,68,68)]">{error}</p>
        </div>
      )}
    </div>
  );
};

export default BonusMerkleManager;

