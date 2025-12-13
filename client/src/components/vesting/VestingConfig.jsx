import React from "react";
import { formatTimeRemaining } from "./vesting.utils";
import styles from "./css/VestingConfig.module.css";

const VestingConfig = ({
  vestingConfigured,
  vestingStart,
  vestingCliffDuration,
  vestingFinalDuration,
  vestingCliffPercentBP,
}) => {
  if (!vestingConfigured) {
    return null;
  }

  return (
    <div className={styles.configCard}>
      <h2 className={styles.sectionTitle}>Vesting Configuration</h2>
      <div className={styles.configGrid}>
        <div className={styles.configItem}>
          <span className={styles.configLabel}>Vesting Start:</span>
          <span className={styles.configValue}>
            {new Date(vestingStart * 1000).toLocaleString()}
          </span>
        </div>
        <div className={styles.configItem}>
          <span className={styles.configLabel}>Cliff Duration:</span>
          <span className={styles.configValue}>
            {formatTimeRemaining(vestingCliffDuration)}
          </span>
        </div>
        <div className={styles.configItem}>
          <span className={styles.configLabel}>Final Duration:</span>
          <span className={styles.configValue}>
            {formatTimeRemaining(vestingFinalDuration)}
          </span>
        </div>
        <div className={styles.configItem}>
          <span className={styles.configLabel}>Cliff Percent:</span>
          <span className={styles.configValue}>
            {(vestingCliffPercentBP / 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default VestingConfig;


