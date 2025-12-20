import React from "react";
import { Link } from "react-router-dom";
import styles from "./css/VestingInfoCards.module.css";

const VestingInfoCards = ({
  escrowAddress,
  secureLBPAddress,
  tokenAddress,
  tokenSymbol,
  finalized,
  lbpAddressToCheck,
  correctEscrowAddress,
}) => {
  const hasLbpMismatch = lbpAddressToCheck && 
    lbpAddressToCheck.toLowerCase() !== secureLBPAddress.toLowerCase();

  return (
    <div className={styles.infoGrid}>
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>Escrow Contract</div>
        <div className={styles.infoValue}>{escrowAddress}</div>
      </div>
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>LBP Contract</div>
        <div className={styles.infoValue}>{secureLBPAddress}</div>
        {hasLbpMismatch && (
          <div className={styles.lbpMismatchWarning}>
            <div className={styles.mismatchText}>
                Expected LBP: {lbpAddressToCheck.slice(0, 8)}...{lbpAddressToCheck.slice(-6)}
            </div>
            {correctEscrowAddress && (
              <div className={styles.correctEscrowSection}>
                <div className={styles.correctEscrowLabel}>
                  Correct Escrow for this LBP:
                </div>
                <div className={styles.correctEscrowAddress}>
                  {correctEscrowAddress}
                </div>
                <Link
                  to={`/vesting/${correctEscrowAddress}?lbp=${lbpAddressToCheck}`}
                  className={styles.correctEscrowLink}
                >
                  Go to Correct Escrow →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>Token</div>
        <div className={styles.infoValueBold}>
          {tokenSymbol} ({tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)})
        </div>
      </div>
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>Status</div>
        <div className={styles.infoValueBold}>
          {finalized ? "Finalized" : "Not Finalized"}
        </div>
        {!finalized && (
          <div className={styles.infoValueSmall}>
            SecureLBP: {secureLBPAddress.slice(0, 8)}...{secureLBPAddress.slice(-6)}
          </div>
        )}
      </div>
    </div>
  );
};

export default VestingInfoCards;






