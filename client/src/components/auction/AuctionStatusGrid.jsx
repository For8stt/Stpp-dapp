import React from "react";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import styles from "./css/AuctionStatusGrid.module.css";

const AuctionStatusGrid = ({ auctionData }) => {
  if (!auctionData) return null;

  return (
    <div className={styles.statusGrid}>
      <div className={styles.statusItem}>
        <p className={styles.statusLabel}>Tokens for Sale</p>
        <p className={styles.statusValue}>{formatToken(auctionData.tokensForSale)}</p>
      </div>
      <div className={styles.statusItem}>
        <p className={styles.statusLabel}>Total Committed</p>
        <p className={styles.statusValue}>{formatEth(auctionData.totalDepositCommitted)} ETH</p>
      </div>
      <div className={styles.statusItem}>
        <p className={styles.statusLabel}>Total Revealed Qty</p>
        <p className={styles.statusValue}>{formatToken(auctionData.totalQtyRevealed)}</p>
      </div>
      <div className={styles.statusItem}>
        <p className={styles.statusLabel}>Total Revealed Deposit</p>
        <p className={styles.statusValue}>{formatEth(auctionData.totalDepositsRevealed)} ETH</p>
      </div>
      <div className={styles.statusItem}>
        <p className={styles.statusLabel}>Bonus Reserve Remaining</p>
        <p className={styles.statusValue}>{formatToken(auctionData.bonusReserveRemaining)}</p>
      </div>
      <div className={styles.statusItem}>
        <p className={styles.statusLabel}>Soft Cap</p>
        <p className={`${styles.statusValue} ${auctionData.totalDepositCommitted >= auctionData.softCap ? styles.success : ''}`}>
          {formatEth(auctionData.softCap)}
          {auctionData.totalDepositCommitted >= auctionData.softCap && (
            <span style={{ marginLeft: '0.5rem' }}>Reached</span>
          )}
        </p>
      </div>
      {auctionData.finalized && (
        <>
          <div className={styles.statusItem}>
            <p className={styles.statusLabel}>Clearing Price</p>
            <p className={styles.statusValue}>{formatEth(auctionData.clearingPrice)} ETH</p>
          </div>
          <div className={styles.statusItem}>
            <p className={styles.statusLabel}>Tokens Sold</p>
            <p className={styles.statusValue}>{formatToken(auctionData.tokensSold)}</p>
          </div>
          <div className={styles.statusItem}>
            <p className={styles.statusLabel}>Total Raised</p>
            <p className={styles.statusValue}>{formatEth(auctionData.totalRaised)} ETH</p>
          </div>
        </>
      )}
    </div>
  );
};

export default AuctionStatusGrid;

