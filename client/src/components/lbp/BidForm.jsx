import React from "react";
import styles from "../../pages/css/LBPView.module.css";

const BidForm = ({
  lbpData,
  bidForm,
  handleBidFormChange,
  handlePlaceBid,
  isPending,
  account,
}) => {
  return (
    <div className={styles.bidPanel}>
      <h2 className={styles.bidTitle}>Place Bid</h2>
      <div className={styles.bidForm}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            ETH Amount
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={bidForm.ethAmount}
            onChange={(e) => handleBidFormChange("ethAmount", e.target.value)}
            placeholder="0.0"
            className={styles.formInput}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            Slippage Tolerance (%)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={bidForm.slippage}
            onChange={(e) => handleBidFormChange("slippage", e.target.value)}
            placeholder="1"
            className={styles.formInput}
          />
        </div>
        {bidForm.minTokensOut && (
          <div className={styles.expectedTokens}>
            <p className={styles.expectedTokensLabel}>
              Expected Tokens (min):
            </p>
            <p className={styles.expectedTokensValue}>
              {bidForm.minTokensOut} {lbpData.tokenInfo?.symbol || "tokens"}
            </p>
          </div>
        )}
        <button
          onClick={handlePlaceBid}
          disabled={
            !bidForm.ethAmount ||
            !bidForm.minTokensOut ||
            isPending
          }
          className={`${styles.bidButton} ${
            isPending ||
            !bidForm.ethAmount ||
            !bidForm.minTokensOut
              ? styles.bidButtonDisabled
              : styles.bidButtonEnabled
          }`}
        >
          {isPending ? "Placing Bid..." : "Place Bid"}
        </button>
        {!account && (
          <p className={styles.walletMessage}>
            Please connect your wallet to place a bid
          </p>
        )}
      </div>
    </div>
  );
};

export default BidForm;

