import React from "react";
import { Link } from "react-router-dom";
import styles from "./css/VestingWarnings.module.css";

const VestingWarnings = ({
  escrowAddress,
  lbpAddressToCheck,
  secureLBPAddress,
  correctEscrowAddress,
  checkingEscrow,
  lbpFinalized,
}) => {
  if (!lbpAddressToCheck || lbpAddressToCheck.toLowerCase() === secureLBPAddress.toLowerCase()) {
    return null;
  }

  return (
    <div className={styles.warningContainer}>
      <h3 className={styles.warningTitle}>
          Wrong Escrow Address Detected
      </h3>
      <p className={styles.warningText}>
        This escrow ({escrowAddress.slice(0, 8)}...{escrowAddress.slice(-6)}) is linked to a different LBP contract ({secureLBPAddress.slice(0, 8)}...{secureLBPAddress.slice(-6)}).
        <br />
        The expected LBP ({lbpAddressToCheck.slice(0, 8)}...{lbpAddressToCheck.slice(-6)}) {lbpFinalized ? "has" : "will have"} a different escrow address.
      </p>
      {correctEscrowAddress ? (
        <div className={styles.warningActions}>
          <Link
            to={`/vesting/${correctEscrowAddress}?lbp=${lbpAddressToCheck}`}
            className={styles.correctEscrowLink}
          >
            Go to Correct Escrow →
          </Link>
          <span className={styles.correctEscrowText}>
            Correct Escrow: {correctEscrowAddress.slice(0, 8)}...{correctEscrowAddress.slice(-6)}
          </span>
        </div>
      ) : (
        <div className={styles.checkingContainer}>
          {checkingEscrow 
            ? "Checking escrow address..."
            : lbpFinalized 
              ? "LBP is finalized but escrow address is not set yet. Please check the LBP contract."
              : "LBP is not finalized yet. Escrow will be set after finalization."}
        </div>
      )}
    </div>
  );
};

export default VestingWarnings;



