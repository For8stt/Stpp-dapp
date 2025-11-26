import React from "react";
import { Link } from "react-router-dom";
import styles from "./PresaleCard.module.css";

const PresaleCard = ({ presale }) => {
  // Helper function to shorten address
  const shortenAddress = (address) => {
    if (!address) return "—";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Status configuration
  const statusConfig = {
    finalized: {
      color: 'green',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/30',
      icon: '●',
      text: 'Finalized'
    },
    active: {
      color: 'yellow',
      bgColor: 'bg-yellow-500/20',
      borderColor: 'border-yellow-500/30',
      icon: '●',
      text: 'Active'
    }
  };

  const currentStatus = presale.finalized ? statusConfig.finalized : statusConfig.active;

  return (
    <div className={styles.card}>
      {/* Status badge */}
      <div className={`${styles.statusBadge} ${currentStatus.text.toLowerCase()}`}>
        <span className={styles.statusIcon}>{currentStatus.icon}</span>
        <span>{currentStatus.text}</span>
      </div>

      <div className={styles.content}>
        {/* Header with Manager info */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.managerIcon}>
              <div className={styles.managerIconInner}></div>
            </div>
            <div className={styles.headerInfo}>
              <h3 className={styles.managerTitle}>Presale Manager</h3>
              <div className={styles.addressContainer}>
                <p className={styles.address}>{shortenAddress(presale.manager)}</p>
                <p className={styles.addressFull}>{presale.manager}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Information cards grid */}
        <div className={styles.infoGrid}>
          {/* Owner Card */}
          <div className={`${styles.infoCard} ${styles.owner}`}>
            <div className={styles.infoHeader}>
              <div className={`${styles.infoIcon} ${styles.owner}`}>
                <div className={styles.iconUser}></div>
              </div>
              <h4 className={`${styles.infoLabel} ${styles.owner}`}>Owner</h4>
            </div>
            <p className={styles.infoValue}>
              {shortenAddress(presale.owner)}
            </p>
          </div>

          {/* Auction Card */}
          <div className={`${styles.infoCard} ${styles.auction} ${!presale.auction ? styles.inactive : ''}`}>
            <div className={styles.infoHeader}>
              <div className={`${styles.infoIcon} ${styles.auction} ${!presale.auction ? styles.inactive : ''}`}>
                <div className={styles.iconTrophy}></div>
              </div>
              <h4 className={`${styles.infoLabel} ${styles.auction} ${!presale.auction ? styles.inactive : ''}`}>
                Auction
              </h4>
            </div>
            <p className={`${styles.infoValue} ${!presale.auction ? styles.inactive : ''}`}>
              {presale.auction ? shortenAddress(presale.auction) : 'Not launched'}
            </p>
          </div>

          {/* LBP Card */}
          <div className={`${styles.infoCard} ${styles.liquidity} ${!presale.lbp ? styles.inactive : ''}`}>
            <div className={styles.infoHeader}>
              <div className={`${styles.infoIcon} ${styles.liquidity} ${!presale.lbp ? styles.inactive : ''}`}>
                <div className={styles.iconWave}></div>
              </div>
              <h4 className={`${styles.infoLabel} ${styles.liquidity} ${!presale.lbp ? styles.inactive : ''}`}>
                Liquidity Pool
              </h4>
            </div>
            <p className={`${styles.infoValue} ${!presale.lbp ? styles.inactive : ''}`}>
              {presale.lbp ? shortenAddress(presale.lbp) : 'Not launched'}
            </p>
          </div>

          {/* Vesting Card */}
          <div className={`${styles.infoCard} ${styles.vesting} ${!presale.vesting ? styles.inactive : ''}`}>
            <div className={styles.infoHeader}>
              <div className={`${styles.infoIcon} ${styles.vesting} ${!presale.vesting ? styles.inactive : ''}`}>
                <div className={styles.iconClock}></div>
              </div>
              <h4 className={`${styles.infoLabel} ${styles.vesting} ${!presale.vesting ? styles.inactive : ''}`}>
                Vesting
              </h4>
            </div>
            <p className={`${styles.infoValue} ${!presale.vesting ? styles.inactive : ''}`}>
              {presale.vesting ? shortenAddress(presale.vesting) : 'Not created'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className={styles.actions}>
          <Link
            to={`/presale/${presale.manager}`}
            className={`${styles.actionButton} ${styles.primary}`}
          >
            <div className={styles.actionIcon}>
              <div className={styles.iconEye}></div>
            </div>
            <span>View Manager</span>
          </Link>

          {presale.auction && (
            <Link
              to={`/presale/${presale.manager}/auction`}
              className={`${styles.actionButton} ${styles.secondary}`}
            >
              <div className={styles.actionIcon}>
                <div className={styles.iconBolt}></div>
              </div>
              <span>Auction</span>
            </Link>
          )}
        </div>
      </div>

      {/* Decorative elements */}
      <div className={styles.decorative1}></div>
      <div className={styles.decorative2}></div>
    </div>
  );
};

export default PresaleCard;
