import React from "react";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import styles from "./css/AllocationPanel.module.css";

const AllocationPanel = React.memo(({ userData }) => {
  if (!userData || userData.revealedQty <= 0n) return null;

  return (
    <div className={styles.allocationPanel}>
      <p className={styles.allocationTitle}>Your Allocation Preview</p>
      <div className={styles.allocationGrid}>
        <div className={styles.allocationItem}>
          <p className={styles.allocationLabel}>Estimated Allocation</p>
          <p className={styles.allocationValue}>{formatToken(userData.revealedQty)}</p>
        </div>
        <div className={styles.allocationItem}>
          <p className={styles.allocationLabel}>Estimated Payment</p>
          <p className={styles.allocationValue}>{formatEth(userData.revealedDeposit)} ETH</p>
        </div>
      </div>
      <p className={styles.allocationNote}>
        * Final allocation will be determined after auction finalization
      </p>
    </div>
  );
});

AllocationPanel.displayName = 'AllocationPanel';

export default AllocationPanel;

