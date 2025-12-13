import React from "react";
import { formatToken } from "./vesting.utils";
import styles from "./css/VestingStats.module.css";

const VestingStats = ({
  userAllocation,
  userVested,
  userClaimed,
  userClaimable,
  tokenSymbol,
  tokenDecimals,
  progressPercent,
}) => {
  return (
    <div className={styles.statsGrid}>
      <div className={`${styles.statCard} ${styles.statCardAllocation}`}>
        <h4 className={styles.statLabel}>Total Allocation</h4>
        <p className={styles.statValue}>
          {formatToken(userAllocation, tokenDecimals)} {tokenSymbol}
        </p>
      </div>
      <div className={`${styles.statCard} ${styles.statCardVested}`}>
        <h4 className={styles.statLabel}>Vested Amount</h4>
        <p className={styles.statValue}>
          {formatToken(userVested, tokenDecimals)} {tokenSymbol}
        </p>
        <p className={styles.statSubtext}>
          {progressPercent.toFixed(2)}% of allocation
        </p>
      </div>
      <div className={`${styles.statCard} ${styles.statCardClaimed}`}>
        <h4 className={styles.statLabel}>Claimed Amount</h4>
        <p className={styles.statValue}>
          {formatToken(userClaimed, tokenDecimals)} {tokenSymbol}
        </p>
      </div>
      <div className={`${styles.statCard} ${styles.statCardAvailable}`}>
        <h4 className={styles.statLabel}>Available to Claim</h4>
        <p className={styles.statValue}>
          {formatToken(userClaimable, tokenDecimals)} {tokenSymbol}
        </p>
      </div>
    </div>
  );
};

export default VestingStats;


