/* global BigInt */
import React, { useMemo } from "react";
import { ethers } from "ethers";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import styles from "./css/CommitForm.module.css";

const CommitForm = ({ 
  form, 
  setForm, 
  auctionData, 
  userData, 
  onSubmit, 
  txState 
}) => {
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
    <div className={styles.formCard}>
      <p className={styles.formTitle}>Commit Bid</p>
      <div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Quantity (whole units)</label>
          <input
            className={styles.formInput}
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="1000"
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Price Tick Index</label>
          <select
            className={styles.formSelect}
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
        <div className={styles.formField}>
          <label className={styles.formLabel}>Nonce (string or bytes32)</label>
          <input
            className={`${styles.formInput} font-mono`}
            style={{ fontSize: '0.75rem' }}
            value={form.nonce}
            onChange={(e) => setForm({ ...form, nonce: e.target.value })}
            placeholder="my-secret-nonce"
          />
        </div>
        {auctionData.merkleRoot && 
         auctionData.merkleRoot !== ethers.ZeroHash && 
         auctionData.merkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
          <div className={styles.formField}>
            <label className={styles.formLabel}>Merkle Proof (comma separated bytes32)</label>
            <input
              className={`${styles.formInput} font-mono`}
              style={{ fontSize: '0.75rem' }}
              value={form.merkleProof}
              onChange={(e) => setForm({ ...form, merkleProof: e.target.value })}
              placeholder="0x123...,0x456..."
            />
          </div>
        )}
        {commitHashPreview && (
          <div className={styles.infoBox}>
            <p className={styles.infoLabel}>Commit Hash Preview:</p>
            <p className="font-mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{commitHashPreview}</p>
          </div>
        )}
        <div className={styles.infoBox}>
          <p className={styles.infoLabel}>ETH Required:</p>
          <p className={styles.infoValue}>{ethRequired} ETH</p>
        </div>
        {userData && (
          <div className={styles.infoBox}>
            <p className={styles.infoLabel}>Your Commits:</p>
            <p className={styles.infoText}>Committed Qty: {formatToken(userData.committedQty)}</p>
            <p className={styles.infoText}>Committed Deposit: {formatEth(userData.committedQty * (auctionData.priceTicks[0] || 0n))} ETH</p>
          </div>
        )}
        <button
          onClick={onSubmit}
          disabled={!form.quantity || !form.nonce || txState?.status === "pending"}
          className={`${styles.submitButton} ${styles.commit}`}
        >
          {txState?.status === "pending" ? "Submitting..." : "Submit Commit"}
        </button>
      </div>
    </div>
  );
};

export default CommitForm;

