import React from "react";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import styles from "./css/RevealForm.module.css";

const RevealForm = ({ 
  form, 
  setForm, 
  auctionData, 
  userData, 
  onSubmit, 
  txState 
}) => {
  if (!auctionData) return null;

  return (
    <div className={styles.formCard}>
      <p className={styles.formTitle}>Reveal Bid</p>
      <div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Commit Index</label>
          <input
            className={styles.formInput}
            type="number"
            value={form.commitIndex}
            onChange={(e) => setForm({ ...form, commitIndex: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Quantity (must match commit)</label>
          <input
            className={styles.formInput}
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="1000"
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Price Tick Index (must match commit)</label>
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
          <label className={styles.formLabel}>Nonce (exact same as commit)</label>
          <input
            className={`${styles.formInput} font-mono`}
            style={{ fontSize: '0.75rem' }}
            value={form.nonce}
            onChange={(e) => setForm({ ...form, nonce: e.target.value })}
            placeholder="my-secret-nonce"
          />
        </div>
        {userData && (
          <div className={styles.infoBox}>
            <p className={styles.infoLabel}>Your Reveals:</p>
            <p className={styles.infoText}>Revealed Qty: {formatToken(userData.revealedQty)}</p>
            <p className={styles.infoText}>Revealed Deposit: {formatEth(userData.revealedDeposit)} ETH</p>
          </div>
        )}
        <button
          onClick={onSubmit}
          disabled={!form.quantity || !form.nonce || txState?.status === "pending"}
          className={`${styles.submitButton} ${styles.reveal}`}
        >
          {txState?.status === "pending" ? "Submitting..." : "Reveal Bid"}
        </button>
      </div>
    </div>
  );
};

export default RevealForm;

