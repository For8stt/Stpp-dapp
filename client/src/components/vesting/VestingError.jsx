import React from "react";
import styles from "./css/VestingPage.module.css";

const VestingError = ({ error, onRetry }) => {
  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorCard}>
        <h2 className={styles.errorTitle}>Error Loading Vesting Data</h2>
        <p className={styles.errorMessage}>{error}</p>
        <button
          onClick={onRetry}
          className={styles.retryButton}
        >
          Retry
        </button>
      </div>
    </div>
  );
};

export default VestingError;

