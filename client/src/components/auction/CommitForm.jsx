import React, { useMemo, useCallback, useState, useEffect } from "react";
import { ethers } from "ethers";
import { formatEth, formatToken, formatTokenUnits } from "../../utils/auctionUtils";
import { generateCommitHash, calculateDeposit, parseMerkleProof, validateMerkleProof, verifyMerkleProof } from "../../utils/commitUtils";
import { loadWhitelistProofFromIPFS } from "../../utils/ipfsWhitelist";
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
  const { isConnected, address: userAddress } = useAccount();
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState(null);
  const [autoProofStatus, setAutoProofStatus] = useState(null); // 'loading' | 'found' | 'not-found' | null
  
  // Check if whitelist is enabled
  const isWhitelistEnabled = useMemo(() => {
    if (!auctionData?.merkleRoot) return false;
    const root = auctionData.merkleRoot;
    return root !== ethers.ZeroHash && 
           root !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  }, [auctionData?.merkleRoot]);
  
  // Check if user has proof and validate format + verify it matches current address
  const proofValidation = useMemo(() => {
    if (!isWhitelistEnabled) return { valid: true, error: null }; // No whitelist = always allowed
    if (!form.merkleProof) return { valid: false, error: "Merkle proof is required" };
    
    const proofArray = parseMerkleProof(form.merkleProof);
    if (proofArray.length === 0) {
      return { valid: false, error: "Merkle proof cannot be empty" };
    }
    
    // Validate format first (this checks if proof elements are valid hex)
    const formatValidation = validateMerkleProof(proofArray);
    if (!formatValidation.valid) {
      return formatValidation;
    }
    
    // Only verify proof matches current address if format is valid
    // This prevents errors when user is still typing
    if (userAddress && auctionData?.merkleRoot) {
      try {
        const isValid = verifyMerkleProof(proofArray, auctionData.merkleRoot, userAddress);
        if (!isValid) {
          return { valid: false, error: "Merkle proof is not valid for your address" };
        }
      } catch (error) {
        // If verification fails due to invalid format, return format error
        // This can happen if user is still typing
        return { valid: false, error: "Invalid proof format" };
      }
    }
    
    return { valid: true };
  }, [isWhitelistEnabled, form.merkleProof, userAddress, auctionData?.merkleRoot]);
  
  const hasProof = proofValidation.valid;
  
  // Auto-load proof from IPFS when wallet is connected and whitelist is enabled
  useEffect(() => {
    const autoLoadProof = async () => {
      // Skip if whitelist is disabled
      if (!isWhitelistEnabled) {
        setAutoProofStatus(null);
        setForm({ ...form, merkleProof: "" }); // Clear proof when whitelist disabled
        return;
      }

      // Skip if no wallet connected
      if (!userAddress) {
        setAutoProofStatus(null);
        setForm({ ...form, merkleProof: "" }); // Clear proof when wallet disconnected
        return;
      }

      // Clear proof if address changed (user switched wallet)
      const lastAddress = localStorage.getItem('last-whitelist-check-address');
      if (lastAddress && lastAddress.toLowerCase() !== userAddress.toLowerCase()) {
        setForm({ ...form, merkleProof: "" }); // Clear proof when address changes
      }
      localStorage.setItem('last-whitelist-check-address', userAddress.toLowerCase());

      // Skip if proof already loaded manually and valid
      if (form.merkleProof) {
        const proofArray = parseMerkleProof(form.merkleProof);
        if (proofArray.length > 0 && auctionData?.merkleRoot) {
          // Only verify if format is valid (prevents errors during typing)
          const formatValidation = validateMerkleProof(proofArray);
          if (formatValidation.valid) {
            try {
              const isValid = verifyMerkleProof(proofArray, auctionData.merkleRoot, userAddress);
              if (isValid) {
                setAutoProofStatus('found');
                return;
              } else {
                // Proof is invalid for current address, clear it
                setForm({ ...form, merkleProof: "" });
              }
            } catch (error) {
              // Ignore verification errors during typing
              console.debug('[CommitForm] Proof verification skipped (user typing):', error.message);
            }
          }
        }
      }

      // Skip if no whitelistCID
      if (!auctionData?.whitelistCID || !auctionData.whitelistCID.trim()) {
        setAutoProofStatus(null);
        return;
      }

      // Try to load from localStorage cache first
      try {
        const cached = localStorage.getItem(`whitelist-proof-${auctionData.merkleRoot}`);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.proofs && data.proofs[userAddress.toLowerCase()]) {
            const cachedProof = data.proofs[userAddress.toLowerCase()];
            // Verify cached proof is still valid
            if (auctionData.merkleRoot && cachedProof && Array.isArray(cachedProof)) {
              try {
                // Validate format first
                const formatValidation = validateMerkleProof(cachedProof);
                if (formatValidation.valid) {
                  const isValid = verifyMerkleProof(cachedProof, auctionData.merkleRoot, userAddress);
                  if (isValid) {
                    setForm({ ...form, merkleProof: cachedProof.join(",") });
                    setAutoProofStatus('found');
                    setProofError(null);
                    return;
                  } else {
                    // Cached proof is invalid, remove from cache
                    delete data.proofs[userAddress.toLowerCase()];
                    localStorage.setItem(`whitelist-proof-${auctionData.merkleRoot}`, JSON.stringify(data));
                  }
                }
              } catch (error) {
                // Invalid cached proof, remove from cache
                console.warn('[CommitForm] Invalid cached proof, removing:', error);
                delete data.proofs[userAddress.toLowerCase()];
                localStorage.setItem(`whitelist-proof-${auctionData.merkleRoot}`, JSON.stringify(data));
              }
            }
          }
        }
      } catch (e) {
        // Ignore cache errors, continue to IPFS
      }

      // Load from IPFS
      setProofLoading(true);
      setAutoProofStatus('loading');
      setProofError(null);

      try {
        const result = await loadWhitelistProofFromIPFS(
          auctionData.whitelistCID,
          userAddress,
          auctionData.auctionAddress,
          auctionData.merkleRoot
        );

        if (result && result.proof && result.proof.length > 0) {
          // Verify proof is valid for current address before using it
          if (auctionData.merkleRoot) {
            try {
              // Validate format first
              const formatValidation = validateMerkleProof(result.proof);
              if (formatValidation.valid) {
                const isValid = verifyMerkleProof(result.proof, auctionData.merkleRoot, userAddress);
                if (isValid) {
                  // Auto-fill the proof
                  const proofString = result.proof.join(",");
                  setForm({ ...form, merkleProof: proofString });
                  setAutoProofStatus('found');
                  setProofError(null);
                  console.log('[CommitForm] Auto-loaded Merkle proof from IPFS');
                } else {
                  // Proof from IPFS is not valid for current address
                  setAutoProofStatus('not-found');
                  setProofError("Proof loaded from IPFS is not valid for your address");
                }
              } else {
                setAutoProofStatus('not-found');
                setProofError("Invalid proof format from IPFS");
              }
            } catch (error) {
              console.error('[CommitForm] Error verifying proof from IPFS:', error);
              setAutoProofStatus('not-found');
              setProofError("Failed to verify proof from IPFS");
            }
          } else {
            // No merkle root to verify against
            setAutoProofStatus('not-found');
            setProofError("Merkle root not available");
          }
        } else {
          // Proof not found for this address
          setAutoProofStatus('not-found');
          setProofError("You are not whitelisted for this auction");
        }
      } catch (error) {
        console.error('[CommitForm] Error loading proof from IPFS:', error);
        setAutoProofStatus('not-found');
        setProofError("Failed to load whitelist. Please try uploading the JSON file manually.");
      } finally {
        setProofLoading(false);
      }
    };

    autoLoadProof();
  }, [isWhitelistEnabled, userAddress, auctionData?.merkleRoot, auctionData?.whitelistCID, auctionData?.auctionAddress, setForm]);
  
  const commitHashPreview = useMemo(() => {
    if (!form.quantity) return null;
    const priceTickIndex = BigInt(form.priceTickIndex || "0");
    return generateCommitHash(priceTickIndex, form.quantity, form.nonce, 18);
  }, [form.quantity, form.priceTickIndex, form.nonce]);
  
  const ethRequired = useMemo(() => {
    if (!form.quantity || !auctionData?.priceTicks?.[0]) return "0";
    try {
      const deposit = calculateDeposit(form.quantity, auctionData.priceTicks[0], 18);
      return formatEth(deposit);
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
          <label className="mb-2 block text-sm font-medium text-[rgba(255,255,255,0.8)]">Quantity (tokens, supports decimals like 1.5)</label>
          <input
            className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] px-4 py-3 text-base text-white transition-all duration-300 focus:border-[rgba(99,102,241,0.5)] focus:bg-[rgba(15,23,42,0.95)] focus:outline-none"
            type="text"
            inputMode="decimal"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="1.5"
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
        {isWhitelistEnabled && (
          <div className="mb-5 rounded-xl border border-[rgba(255,193,7,0.3)] bg-[rgba(255,193,7,0.1)] p-4">
            {/* Auto-load status */}
            {autoProofStatus === 'loading' && (
              <div className="mb-3 rounded-lg border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.1)] p-3">
                <p className="text-xs font-semibold text-[rgb(59,130,246)]">
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Loading whitelist proof from IPFS...
                  </span>
                </p>
              </div>
            )}
            
            {autoProofStatus === 'found' && hasProof && (
              <div className="mb-3 rounded-lg border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] p-3">
                <p className="text-xs font-semibold text-[rgb(34,197,94)]">
                  ✓ You are whitelisted! Proof loaded automatically.
                </p>
              </div>
            )}
            
            {autoProofStatus === 'not-found' && !hasProof && (
              <div className="mb-3 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-[rgb(239,68,68)]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  You are not whitelisted for this auction
                </p>
                <p className="mt-1 text-xs text-[rgba(255,255,255,0.7)]">
                  Your address is not in the whitelist. Please contact the auction organizer or enter the Merkle proof manually.
                </p>
              </div>
            )}

            {/* Show manual input if proof not auto-loaded OR if proof is invalid */}
            {(!hasProof || (proofValidation.error && form.merkleProof)) && (autoProofStatus === null || autoProofStatus === 'not-found' || (autoProofStatus === 'found' && !hasProof)) && (
              <>
                {!auctionData?.whitelistCID || !auctionData.whitelistCID.trim() ? (
                  <p className="mb-3 text-xs text-[rgba(255,255,255,0.7)]">
                    This auction requires a whitelist. The organizer has not set up automatic proof loading. Please enter the Merkle proof manually.
                  </p>
                ) : autoProofStatus !== 'not-found' && (
                  <p className="mb-3 text-xs text-[rgba(255,255,255,0.7)]">
                    Automatic proof loading is not available. Please enter the Merkle proof manually.
                  </p>
                )}
                
                <div>
                  <label className="mb-2 block text-xs font-medium text-[rgba(255,255,255,0.8)]">
                    Enter Merkle Proof
                  </label>
                  <input
                    type="text"
                    className={`w-full rounded-xl border bg-[rgba(15,23,42,0.8)] px-4 py-3 font-mono text-xs text-white transition-all duration-300 focus:bg-[rgba(15,23,42,0.95)] focus:outline-none ${
                      proofValidation.error && form.merkleProof
                        ? "border-[rgba(239,68,68,0.5)] focus:border-[rgba(239,68,68,0.7)]"
                        : "border-[rgba(255,255,255,0.1)] focus:border-[rgba(99,102,241,0.5)]"
                    }`}
                    value={form.merkleProof}
                    onChange={(e) => {
                      setForm({ ...form, merkleProof: e.target.value });
                      setProofError(null);
                    }}
                    placeholder="0x123...,0x456..."
                    disabled={false}
                  />
                  {proofValidation.error && form.merkleProof && (
                    <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[rgb(239,68,68)]">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {proofValidation.error}
                    </p>
                  )}
                </div>
              </>
            )}
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
            <p className="mb-1 text-sm text-[rgba(255,255,255,0.8)]">Committed Qty: {formatTokenUnits(userData.committedQty, 18)}</p>
            <p className="mb-1 text-sm text-[rgba(255,255,255,0.8)]">Committed Deposit: {formatEth((userData.committedQty || 0n) * (auctionData.priceTicks[0] || 0n) / ethers.parseUnits("1", 18))} ETH</p>
            {auctionData.perAddressCap && (
              <>
                <div className="my-2 h-px bg-[rgba(255,255,255,0.1)]" />
                <p className="mb-1 text-sm font-semibold text-[rgba(255,255,255,0.9)]">Per-Address Cap:</p>
                <p className="mb-1 text-sm text-[rgba(255,255,255,0.8)]">
                  Used: {formatTokenUnits(userData.committedQty, 18)} / {formatToken(auctionData.perAddressCap, 18)}
                </p>
                <p className="text-xs text-[rgba(255,255,255,0.7)]">
                  Remaining: {formatToken((auctionData.perAddressCap || 0n) - (userData.committedQty || 0n), 18)}
                </p>
                {(userData.committedQty || 0n) >= (auctionData.perAddressCap || 0n) && (
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[rgb(239,68,68)]">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Cap reached
                  </p>
                )}
              </>
            )}
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
            disabled={!form.quantity || !form.nonce || txState?.status === "pending" || (isWhitelistEnabled && !hasProof)}
            className="mt-4 w-full rounded-xl border-0 bg-gradient-to-r from-[rgb(59,130,246)] to-[rgb(96,165,250)] px-4 py-4 text-base font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:-translate-y-0.5 hover:not-disabled:bg-gradient-to-r hover:not-disabled:from-[rgb(96,165,250)] hover:not-disabled:to-[rgb(59,130,246)] hover:not-disabled:shadow-[0_10px_20px_rgba(59,130,246,0.3)]"
            title={isWhitelistEnabled && !hasProof ? "Merkle proof required to commit" : ""}
          >
            {txState?.status === "pending" ? "Submitting..." : "Submit Commit"}
          </button>
        )}
      </div>
    </div>
  );
};

export default CommitForm;

