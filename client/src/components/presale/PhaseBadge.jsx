import React from "react";
import styles from "./css/PhaseBadge.module.css";

const PhaseBadge = ({ phase, countdown }) => {
  const phaseClass = phase?.toLowerCase() || 'notstarted';
  
  return (
    <div className={`${styles.phaseBadge} ${styles[phaseClass]}`}>
      <p className={styles.phaseLabel}>Current Phase</p>
      <p className={styles.phaseValue}>{phase}</p>
      {countdown && (
        <p className={styles.phaseCountdown}>Next phase in: {countdown}</p>
      )}
    </div>
  );
};

export default PhaseBadge;

