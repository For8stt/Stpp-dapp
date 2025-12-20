import React from "react";
import { formatToken } from "./vesting.utils";
import styles from "./css/ClaimPanel.module.css";

const ClaimPanel = ({
  userClaimable,
  tokenSymbol,
  tokenDecimals,
  canClaim,
  isPending,
  onClaim,
}) => {
  return (
    <div className={styles.claimSection}>
      <h2 className={styles.sectionTitle}>Claim Tokens</h2>
      <div className={styles.claimCard}>
        <div className={styles.claimInfo}>
          <p className={styles.claimLabel}>Available to Claim:</p>
          <p className={styles.claimAmount}>
            {formatToken(userClaimable, tokenDecimals)} {tokenSymbol}
          </p>
        </div>
        <button
          onClick={onClaim}
          disabled={!canClaim || isPending}
          className={`${styles.claimButton} ${!canClaim ? styles.claimButtonDisabled : ""}`}
        >
          {isPending ? "Claiming…" : "Claim Tokens"}
        </button>
      </div>
    </div>
  );
};

export default ClaimPanel;