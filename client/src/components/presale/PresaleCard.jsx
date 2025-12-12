import React from "react";
import { Link } from "react-router-dom";
import styles from "./css/PresaleCard.module.css";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PresaleCard = ({ presale }) => {
  const shortenAddress = (address) => {
    if (!address) return "—";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const statusConfig = {
    lbp: {
      color: "blue",
      bgColor: "bg-blue-500/20",
      borderColor: "border-blue-500/30",
      icon: "●",
      text: "LBP",
    },
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

  const hasLBP = presale.lbp && presale.lbp !== ZERO_ADDRESS;
  const currentStatus = presale.finalized
    ? hasLBP
      ? statusConfig.lbp
      : statusConfig.finalized
    : statusConfig.active;

  return (
    <div className={styles.card}>
      <div className={`${styles.statusBadge} ${currentStatus.text.toLowerCase()}`}>
        <span className={styles.statusIcon}>{currentStatus.icon}</span>
        <span>{currentStatus.text}</span>
      </div>

      <div className={styles.content}>
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

        <div className={styles.infoGrid}>
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

        <div className={styles.actions}>
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
          {presale.lbp && presale.lbp !== "0x0000000000000000000000000000000000000000" && (
            <Link
              to={`/lbp/${presale.lbp}`}
              className={`${styles.actionButton} ${styles.primary}`}
            >
              <div className={styles.actionIcon}>
                <div className={styles.iconWave}></div>
              </div>
              <span>LBP</span>
            </Link>
          )}
        </div>
      </div>

      <div className={styles.decorative1}></div>
      <div className={styles.decorative2}></div>
    </div>
  );
};

export default PresaleCard;
