import React from "react";
import { formatToken, formatTimeRemaining } from "./vesting.utils";
import styles from "./css/VestingTimeline.module.css";

const VestingTimeline = ({
  vestingConfigured,
  progressPercent,
  userVested,
  userAllocation,
  tokenSymbol,
  tokenDecimals,
  cliffProgress,
  timeUntilCliff,
  cliffTime,
  currentTime,
  finalProgress,
  timeUntilFinal,
  finalTime,
  vestingFinalDuration,
}) => {
  return (
    <div className={styles.progressSection}>
      <h2 className={styles.sectionTitle}>Vesting Progress</h2>

      <div className={styles.progressCard}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>Overall Vesting</span>
          <span className={styles.progressPercent}>{progressPercent.toFixed(2)}%</span>
        </div>
        <div className={styles.progressBarContainer}>
          <div
            className={styles.progressBar}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        <div className={styles.progressInfo}>
          <span>{formatToken(userVested, tokenDecimals)} / {formatToken(userAllocation, tokenDecimals)} {tokenSymbol}</span>
        </div>
      </div>

      {vestingConfigured && (
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>Cliff Progress</span>
            <span className={styles.progressPercent}>
              {timeUntilCliff > 0 ? formatTimeRemaining(timeUntilCliff) : "Unlocked"}
            </span>
          </div>
          <div className={styles.progressBarContainer}>
            <div
              className={`${styles.progressBar} ${styles.progressBarCliff}`}
              style={{ width: `${Math.min(cliffProgress, 100)}%` }}
            />
          </div>
          <div className={styles.progressInfo}>
            <span>
              {currentTime >= cliffTime
                ? "Cliff unlocked"
                : `Cliff unlocks: ${new Date(cliffTime * 1000).toLocaleString()}`}
            </span>
          </div>
        </div>
      )}

      {vestingConfigured && vestingFinalDuration > 0 && (
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>Full Unlock Progress</span>
            <span className={styles.progressPercent}>
              {timeUntilFinal > 0 ? formatTimeRemaining(timeUntilFinal) : "Fully Unlocked"}
            </span>
          </div>
          <div className={styles.progressBarContainer}>
            <div
              className={`${styles.progressBar} ${styles.progressBarFinal}`}
              style={{ width: `${Math.min(finalProgress, 100)}%` }}
            />
          </div>
          <div className={styles.progressInfo}>
            <span>
              {currentTime >= finalTime
                ? "Fully unlocked"
                : `Full unlock: ${new Date(finalTime * 1000).toLocaleString()}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VestingTimeline;


