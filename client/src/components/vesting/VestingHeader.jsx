import React from "react";
import { Link } from "react-router-dom";
import styles from "./css/VestingHeader.module.css";

const VestingHeader = ({ lbpAddress, secureLBPAddress }) => {
  return (
    <div className={styles.header}>
      <div className={styles.headerTop}>
        <h1 className={styles.title}>Token Vesting</h1>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link 
            to={`/lbp/${lbpAddress || secureLBPAddress}`} 
            className={styles.backLink}
          >
            ← Back to LBP
          </Link>
        </div>
      </div>
      <p className={styles.subtitle}>
        View and claim your vested tokens from the LBP sale
      </p>
    </div>
  );
};

export default VestingHeader;

