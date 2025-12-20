import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import loadContract from "../../services/web3/loadContract";
import styles from "./css/FinalizedPanel.module.css";

const FinalizedPanel = React.memo(({ auctionData, isOwner, onLaunchLBP, managerAddress, auctionAddress }) => {
  const [lbpAddress, setLbpAddress] = useState(null);

  useEffect(() => {
    const fetchLbpAddress = async () => {
      if (!managerAddress || !auctionData?.finalized || !auctionAddress) {
        setLbpAddress(null);
        return;
      }
      try {
        const managerContract = await loadContract("PresaleManager", managerAddress);
        const info = await managerContract.getPresaleInfo(auctionAddress);
        if (info && info.length > 2 && info[2] !== ethers.ZeroAddress) {
          setLbpAddress(info[2]);
        }
      } catch (error) {
        console.warn("Could not fetch LBP address:", error);
        setLbpAddress(null);
      }
    };
    fetchLbpAddress();
  }, [managerAddress, auctionAddress, auctionData?.finalized]);

  if (!auctionData || !auctionData.finalized) return null;

  return (
    <div className={styles.finalizedPanel}>
      <p className={styles.finalizedTitle}>Auction Finalized</p>
      <div className={styles.finalizedGrid}>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>Tokens Sold</p>
          <p className={styles.finalizedValue}>{formatToken(auctionData.tokensSold)}</p>
        </div>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>Total Raised</p>
          <p className={styles.finalizedValue}>{formatEth(auctionData.totalRaised)} ETH</p>
        </div>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>ETH for Treasury</p>
          <p className={styles.finalizedValue}>{formatEth(auctionData.ethForTreasury)} ETH</p>
        </div>
        <div className={styles.finalizedItem}>
          <p className={styles.finalizedLabel}>Clearing Price</p>
          <p className={styles.finalizedValue}>{formatEth(auctionData.clearingPrice)} ETH</p>
        </div>
      </div>
      {!auctionData.lbpLaunched && isOwner && onLaunchLBP && (
        <button
          onClick={onLaunchLBP}
          className={`${styles.actionButton} ${styles.indigo}`}
          style={{ marginTop: '1rem' }}
        >
          Launch LBP
        </button>
      )}
      {!auctionData.lbpLaunched && isOwner && !onLaunchLBP && managerAddress && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '0.75rem', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.75rem', fontWeight: '500' }}>
            Ready to Launch LBP
          </p>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.5rem' }}>
            Launch LBP from the Presale Manager page to continue.
          </p>
              <Link
                to={`/manager/${managerAddress}`}
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgb(99, 102, 241)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s',
                  marginTop: '0.5rem'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgb(79, 70, 229)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'rgb(99, 102, 241)'}
              >
                Go to Presale Manager →
              </Link>
        </div>
      )}
      {auctionData.lbpLaunched && (lbpAddress || auctionData.lbpTokenRecipient !== ethers.ZeroAddress) && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '0.75rem', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.75rem', fontWeight: '500' }}>
             LBP Successfully Launched
          </p>
          {lbpAddress && (
            <>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
                LBP Contract: {lbpAddress}
              </p>
              <Link
                to={`/manager/${managerAddress}`}
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'rgb(99, 102, 241)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s',
                  marginTop: '0.5rem'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgb(79, 70, 229)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'rgb(99, 102, 241)'}
              >
                View Presale Manager ->
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
});

FinalizedPanel.displayName = 'FinalizedPanel';

export default FinalizedPanel;

