import React from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import styles from "./css/FinalizedPanel.module.css";

const FinalizedPanel = ({ auctionData, isOwner, onLaunchLBP }) => {
  if (!auctionData || !auctionData.finalized) return null;

  return (
    <div className={styles.finalizedPanel}>
      <p className={styles.finalizedTitle}>Auction Finalized</p>
      <div className={styles.finalizedGrid}>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>Tokens Sold</p>
          <p className={styles.finalizedValue}>{formatToken(auctionData.tokensSold)}</p>
        </div>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>Total Raised</p>
          <p className={styles.finalizedValue}>{formatEth(auctionData.totalRaised)} ETH</p>
        </div>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>ETH for Treasury</p>
          <p className={styles.finalizedValue}>{formatEth(auctionData.ethForTreasury)} ETH</p>
        </div>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>Clearing Price</p>
          <p className={styles.finalizedValue}>{formatEth(auctionData.clearingPrice)} ETH</p>
        </div>
      </div>
      {!auctionData.lbpLaunched && isOwner && (
        <button
          onClick={onLaunchLBP}
          className={`${styles.actionButton} ${styles.indigo}`}
          style={{ marginTop: '1rem' }}
        >
          Launch LBP
        </button>
      )}
      {auctionData.lbpLaunched && auctionData.lbpTokenRecipient !== ethers.ZeroAddress && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>LBP Launched:</p>
          <Link
            to={`/lbp/${auctionData.lbpTokenRecipient}`}
            style={{ color: 'rgb(110, 231, 183)', fontFamily: 'monospace', fontSize: '0.875rem' }}
          >
            {auctionData.lbpTokenRecipient}
          </Link>
        </div>
      )}
    </div>
  );
};

export default FinalizedPanel;

