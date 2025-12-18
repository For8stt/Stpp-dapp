import React from "react";
import styles from "./css/VestingPage.module.css";

const VestingEmpty = ({ message = "No vesting data available" }) => {
  return (
    <div className={styles.emptyContainer}>
      <div className={styles.emptyContent}>
        <p className={styles.emptyText}>{message}</p>
      </div>
    </div>
  );
};

export default VestingEmpty;