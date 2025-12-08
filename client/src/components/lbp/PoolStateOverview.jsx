import React from "react";
import { ethers } from "ethers";
import { formatEther, formatToken } from "../../utils/formatUtils";
import styles from "../../pages/css/LBPView.module.css";

const PoolStateOverview = ({
  lbpData,
  poolData,
  reserves,
  weights,
  spotPrice,
  adaptiveFee,
  totalTokensAllocated,
  totalEthRaised,
  userData,
}) => {
  if (!poolData && (!lbpData?.poolInitialized || !lbpData?.amm || lbpData.amm === ethers.ZeroAddress)) {
    return null;
  }

  return (
    <div className={styles.poolPanel}>
      <h2 className={styles.poolTitle}>Pool State Overview</h2>
      <div className={styles.poolGrid}>
        <div className={`${styles.statCard} ${styles.statCardToken}`}>
          <h4 className={styles.statLabel}>Token Reserve</h4>
          <p className={styles.statValue}>
            {reserves?.token !== null && reserves?.token !== undefined
              ? formatToken(reserves.token, lbpData.tokenInfo?.decimals || 18)
              : poolData?.reserveToken
              ? formatToken(poolData.reserveToken, lbpData.tokenInfo?.decimals || 18)
              : "0"}{" "}
            {lbpData.tokenInfo?.symbol || "tokens"}
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardETH}`}>
          <h4 className={styles.statLabel}>ETH Reserve</h4>
          <p className={styles.statValue}>
            {reserves?.eth !== null && reserves?.eth !== undefined
              ? formatEther(reserves.eth)
              : poolData?.reserveETH
              ? formatEther(poolData.reserveETH)
              : "0"} ETH
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardTokenWeight}`}>
          <h4 className={styles.statLabel}>Current Token Weight</h4>
          <p className={styles.statValue}>
            {weights?.token !== null && weights?.token !== undefined
              ? (Number(ethers.formatEther(weights.token)) * 100).toFixed(2)
              : poolData?.tokenWeight
              ? (Number(ethers.formatEther(poolData.tokenWeight)) * 100).toFixed(2)
              : "0.00"}%
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardETHWeight}`}>
          <h4 className={styles.statLabel}>Current ETH Weight</h4>
          <p className={styles.statValue}>
            {weights?.eth !== null && weights?.eth !== undefined
              ? (Number(ethers.formatEther(weights.eth)) * 100).toFixed(2)
              : poolData?.ethWeight
              ? (Number(ethers.formatEther(poolData.ethWeight)) * 100).toFixed(2)
              : "0.00"}%
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPrice}`}>
          <h4 className={styles.statLabel}>Current Price</h4>
          <p className={styles.statValue}>
            {(spotPrice !== null && spotPrice !== undefined && spotPrice > 0)
              ? spotPrice.toFixed(6)
              : poolData?.price && poolData.price > 0
              ? poolData.price.toFixed(6)
              : "N/A"}{" "}
            ETH/{lbpData.tokenInfo?.symbol || "token"}
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardDefault}`}>
          <h4 className={styles.statLabel}>Total Tokens Allocated</h4>
          <p className={styles.statValue}>
            {totalTokensAllocated !== null && totalTokensAllocated !== undefined
              ? formatToken(totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)
              : lbpData?.totalTokensAllocated
              ? formatToken(lbpData.totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)
              : "0"}{" "}
            {lbpData.tokenInfo?.symbol || "tokens"}
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardDefault}`}>
          <h4 className={styles.statLabel}>Total ETH Raised</h4>
          <p className={styles.statValue}>
            {totalEthRaised !== null && totalEthRaised !== undefined
              ? formatEther(totalEthRaised)
              : lbpData?.totalEthRaised
              ? formatEther(lbpData.totalEthRaised)
              : "0"} ETH
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardDefault}`}>
          <h4 className={styles.statLabel}>Adaptive Fee</h4>
          <p className={styles.statValue}>
            {adaptiveFee !== null && adaptiveFee !== undefined
              ? (Number(adaptiveFee) / 100).toFixed(2)
              : lbpData?.currentFee !== null && lbpData?.currentFee !== undefined
              ? (Number(lbpData.currentFee) / 100).toFixed(2)
              : "0.00"}%
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardDefault}`}>
          <h4 className={styles.statLabel}>Max Contribution Per Address</h4>
          <p className={styles.statValue}>
            {formatEther(lbpData.maxContributionPerAddress)} ETH
          </p>
        </div>
        {userData && (
          <>
            <div className={`${styles.statCard} ${styles.statCardDefault}`}>
              <h4 className={styles.statLabel}>Your Contribution</h4>
              <p className={styles.statValue}>
                {formatEther(userData.totalContributed)} ETH
              </p>
            </div>
            <div className={`${styles.statCard} ${styles.statCardDefault}`}>
              <h4 className={styles.statLabel}>Your Allocation</h4>
              <p className={styles.statValue}>
                {formatToken(
                  userData.allocation,
                  lbpData.tokenInfo?.decimals || 18
                )}{" "}
                {lbpData.tokenInfo?.symbol || "tokens"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PoolStateOverview;

