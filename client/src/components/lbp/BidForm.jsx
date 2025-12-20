import React from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styles from "../../pages/css/LBPView.module.css";

const BidForm = ({
  lbpData,
  bidForm,
  handleBidFormChange,
  handlePlaceBid,
  isPending,
  account,
}) => {
  const { isConnected } = useAccount();

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
            disabled={!isConnected}
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
            disabled={!isConnected}
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
        {!isConnected ? (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)', borderRadius: '8px' }}>
            <p style={{ marginBottom: '0.75rem', color: 'rgba(255, 255, 255, 0.9)', textAlign: 'center' }}>
              Connect wallet to place a bid
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ConnectButton />
            </div>
          </div>
        ) : (
          <button
            onClick={handlePlaceBid}
            disabled={
              !bidForm.ethAmount ||
              !bidForm.minTokensOut ||
              isPending ||
              !account
            }
            className={`${styles.bidButton} ${
              isPending ||
              !bidForm.ethAmount ||
              !bidForm.minTokensOut ||
              !account
                ? styles.bidButtonDisabled
                : styles.bidButtonEnabled
            }`}
          >
            {isPending ? "Placing Bid..." : "Place Bid"}
          </button>
        )}
      </div>
    </div>
  );
};

export default BidForm;

