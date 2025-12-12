import React from "react";
import PhaseBadge from "./PhaseBadge";
import styles from "./css/AuctionHeader.module.css";

const AuctionHeader = ({ address, auctionAddress, auctionData, phase, countdown, onRefresh, refreshing }) => {
  return (
    <div className={styles.headerPanel}>
      <div className={styles.headerContent}>
        <div className={styles.headerInfo}>
          <p className={styles.headerLabel}>Presale Manager</p>
          <h1 className={styles.headerTitle}>{address}</h1>
          <div className={styles.headerDetails}>
            <div className={styles.headerDetail}>
              <span className={styles.headerDetailLabel}>Auction:</span>
              <span className={styles.headerDetailValue}>{auctionAddress}</span>
            </div>
            {auctionData && (
              <>
                <div className={styles.headerDetail}>
                  <span className={styles.headerDetailLabel}>Sale Token:</span>
                  <span className={styles.headerDetailValue}>{auctionData.tokenSymbol} ({auctionData.saleToken.slice(0, 10)}...)</span>
                </div>
                <div className={styles.headerDetail}>
                  <span className={styles.headerDetailLabel}>Treasury:</span>
                  <span className={styles.headerDetailValue}>{auctionData.treasury}</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          <PhaseBadge phase={phase} countdown={countdown} />
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className={styles.refreshButton}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuctionHeader;

