import React from "react";
import styles from "./css/VestingPage.module.css";

const VestingLoading = () => {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingContent}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Loading vesting data…</p>
      </div>
    </div>
  );
};

export default VestingLoading;

