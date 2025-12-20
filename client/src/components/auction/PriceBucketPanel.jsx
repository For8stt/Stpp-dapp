import React from "react";
import { formatEth, formatToken } from "../../utils/auctionUtils";
import styles from "./css/PriceBucketPanel.module.css";

const PriceBucketPanel = React.memo(({ auctionData, priceBuckets }) => {
  if (!auctionData?.priceTicks || auctionData.priceTicks.length === 0) return null;

  return (
    <div className={styles.bucketPanel}>
      <p className={styles.bucketTitle}>Price Bucket Demand</p>
      <div className={styles.bucketList}>
        {auctionData.priceTicks.map((tick, idx) => {
          const bucket = priceBuckets.find(b => b.index === idx) || { index: idx, price: tick, total: 0n };
          const maxDemand = priceBuckets.length > 0 
            ? Math.max(...priceBuckets.map(b => Number(b.total)), 1) 
            : 1;
          const height = maxDemand > 0 ? (Number(bucket.total) / maxDemand) * 100 : 0;
          const isClearing = auctionData.finalized && idx === auctionData.clearingTickIndex;
          const isUserBucket = false;
          
          return (
            <div key={idx} className={styles.bucketItem}>
              <div className={styles.bucketLabel}>Tick #{idx}</div>
              <div className={styles.bucketChart}>
                <div className={styles.bucketBarContainer}>
                  <div
                    className={`${styles.bucketBar} ${
                      isClearing
                        ? styles.clearing
                        : isUserBucket
                        ? styles.user
                        : bucket.total > 0n
                        ? styles.default
                        : styles.empty
                    }`}
                    style={{ 
                      height: `${Math.max(height, 2)}%`,
                      minHeight: bucket.total > 0n ? "8px" : "2px"
                    }}
                  />
                  {bucket.total > 0n && (
                    <div className={styles.bucketValue}>
                      {formatToken(bucket.total)}
                    </div>
                  )}
                </div>
                <div className={styles.bucketPrice}>
                  {formatEth(bucket.price)} ETH
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {auctionData.finalized && (
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
          Clearing Price: <span style={{ fontWeight: 600, color: 'rgb(110, 231, 183)' }}>{formatEth(auctionData.clearingPrice)} ETH</span> (Tick #{auctionData.clearingTickIndex})
        </p>
      )}
      {priceBuckets.length === 0 && (
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
          No demand data available yet. Commits will appear here once users start committing bids.
        </p>
      )}
    </div>
  );
});

PriceBucketPanel.displayName = 'PriceBucketPanel';

export default PriceBucketPanel;

