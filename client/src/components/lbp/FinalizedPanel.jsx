import React from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { shortenAddress } from "../../utils/formatUtils";
import styles from "../../pages/css/LBPView.module.css";

const FinalizedPanel = ({ lbpAddress, lbpData }) => {
  if (!lbpData.finalized) {
    return null;
  }

  return (
    <div className={styles.finalizedPanel}>
      <h2 className={styles.finalizedTitle}>Finalized</h2>
      <p className={styles.finalizedText}>
        This LBP has been finalized. Trading is no longer available.
      </p>
      {lbpData.vestingEscrow &&
        lbpData.vestingEscrow !== ethers.ZeroAddress && (
          <>
            <p className={styles.finalizedSubtext}>
              Vesting Escrow: {shortenAddress(lbpData.vestingEscrow)}
            </p>
            <Link
              to={`/vesting/${lbpData.vestingEscrow}?lbp=${lbpAddress}`}
              className={styles.vestingLink}
            >
              View Vesting Page →
            </Link>
          </>
        )}
    </div>
  );
};

export default FinalizedPanel;

