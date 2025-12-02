import React from "react";
import { formatEth } from "../../utils/auctionUtils";
import styles from "./css/ReservePanel.module.css";

const ReservePanel = ({ auctionData, onDemandCheck }) => {
  if (!auctionData || auctionData.thresholdLow <= 0n) return null;

  return (
    <div className={styles.reservePanel}>
      <p className={styles.reserveTitle}>Dynamic Reserve Automation</p>
      <div className={styles.reserveGrid}>
        <div className={styles.reserveItem}>
          <p className={styles.reserveLabel}>Demand Check Time</p>
          <p className={styles.reserveValue}>Available in UpkeepController</p>
        </div>
        <div className={styles.reserveItem}>
          <p className={styles.reserveLabel}>Adjustments Triggered</p>
          <p className={styles.reserveValue}>{auctionData.dynamicAdjustmentCount}</p>
        </div>
        <div className={styles.reserveItem}>
          <p className={styles.reserveLabel}>Current Decay Multiplier</p>
          <p className={styles.reserveValue}>{formatEth(auctionData.decayMultiplier)}</p>
        </div>
        <div className={styles.reserveItem}>
          <p className={styles.reserveLabel}>Threshold Low</p>
          <p className={styles.reserveValue}>{formatEth(auctionData.thresholdLow)}</p>
        </div>
        {process.env.NODE_ENV === "development" && onDemandCheck && (
          <div style={{ gridColumn: 'span 2' }}>
            <button
              onClick={onDemandCheck}
              className={`${styles.actionButton} ${styles.amber}`}
            >
              Trigger Demand Check (Dev Only)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReservePanel;

