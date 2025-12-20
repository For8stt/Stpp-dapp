import React from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { formatTime, shortenAddress } from "../../utils/formatUtils";
import styles from "../../pages/css/LBPView.module.css";

const LBPHeader = ({ lbpAddress, lbpData, status, timeUntilEnd }) => {
  return (
    <div className={styles.headerPanel}>
      <div className={styles.headerTop}>
        <div>
          <h1 className={styles.headerTitle}>
            Liquidity Bootstrapping Pool
          </h1>
          <p className={styles.headerSubtitle}>
            LBP: {shortenAddress(lbpAddress)}
          </p>
        </div>
        <div
          className={`${styles.statusBadge} ${
            status === "Active"
              ? styles.statusBadgeActive
              : status === "Finalized"
              ? styles.statusBadgeFinalized
              : status === "Paused"
              ? styles.statusBadgePaused
              : styles.statusBadgeDefault
          }`}
        >
          <span
            className={`${styles.statusDot} ${
              status === "Active"
                ? styles.statusDotActive
                : status === "Finalized"
                ? styles.statusDotFinalized
                : status === "Paused"
                ? styles.statusDotPaused
                : styles.statusDotDefault
            }`}
          ></span>
          <span className={styles.statusText}>{status}</span>
        </div>
      </div>

      <div className={styles.navigation}>
        {lbpData.auction && lbpData.auction !== ethers.ZeroAddress && (
          <Link
            to={`/presale/${lbpData.presaleManager}/auction`}
            className={styles.navLink}
          >
            ← Back to Auction
          </Link>
        )}
      </div>

      <div className={styles.headerGrid}>
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>LBP Contract</h3>
          <p className={styles.infoValue}>{lbpAddress}</p>
        </div>
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>Presale Manager</h3>
          <p className={styles.infoValue}>
            {shortenAddress(lbpData.presaleManager)}
          </p>
        </div>
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>Sale Token</h3>
          <p className={styles.infoValueBold}>
            {lbpData.tokenInfo?.symbol || "N/A"}
          </p>
          <p className={styles.infoValueSmall}>
            {shortenAddress(lbpData.token)}
          </p>
        </div>
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>Trading Token</h3>
          <p className={styles.infoValueBold}>ETH</p>
        </div>
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>Start Time</h3>
          <p className={styles.infoValue}>{formatTime(lbpData.startTime)}</p>
        </div>
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>End Time</h3>
          <p className={styles.infoValue}>{formatTime(lbpData.endTime)}</p>
        </div>
        {timeUntilEnd && (
          <div className={styles.infoCard}>
            <h3 className={styles.infoLabel}>Time Until End</h3>
            <p className={styles.infoValueBold}>
              {timeUntilEnd.hours}h {timeUntilEnd.minutes}m {timeUntilEnd.seconds}s
            </p>
          </div>
        )}
        <div className={styles.infoCard}>
          <h3 className={styles.infoLabel}>Oracle Pause</h3>
          <p className={styles.infoValue}>{lbpData.oraclePaused ? "Yes" : "No"}</p>
        </div>
      </div>
    </div>
  );
};

export default LBPHeader;

