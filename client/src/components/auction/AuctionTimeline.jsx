import React from "react";
import { toDate } from "../../utils/auctionUtils";
import styles from "./css/AuctionTimeline.module.css";

const AuctionTimeline = ({ auctionData, phase }) => {
  if (!auctionData) return null;

  return (
    <div className={styles.timelinePanel}>
      <p className={styles.timelineTitle}>Auction Timeline</p>
      <div className={styles.timelineContent}>
        <div className={styles.timelinePhases}>
          <div className={styles.timelinePhase}>
            <p className={styles.timelinePhaseTitle}>Commit Phase</p>
            <p className={styles.timelinePhaseDate}>{toDate(auctionData.startTime)}</p>
            <p className={styles.timelinePhaseDate}>{toDate(auctionData.commitEndTime)}</p>
          </div>
          <div className={styles.timelinePhase}>
            <p className={styles.timelinePhaseTitle}>Reveal Phase</p>
            <p className={styles.timelinePhaseDate}>{toDate(auctionData.commitEndTime)}</p>
            <p className={styles.timelinePhaseDate}>{toDate(auctionData.revealEndTime)}</p>
          </div>
          <div className={styles.timelinePhase}>
            <p className={styles.timelinePhaseTitle}>Finalization</p>
            <p className={styles.timelinePhaseDate}>{toDate(auctionData.revealEndTime)}</p>
          </div>
        </div>
        <div className={styles.progressBarContainer}>
          <div
            className={`${styles.progressBar} ${
              phase === "Commit" ? styles.commit : phase === "Reveal" ? styles.reveal : styles.finalized
            }`}
            style={{
              width: phase === "Finalized" ? "100%" : phase === "Reveal" ? "66%" : phase === "Commit" ? "33%" : "0%",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AuctionTimeline;

