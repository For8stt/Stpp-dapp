import React from "react";

const styles = {
  card: {
    padding: "1rem",
    borderRadius: "12px",
    backgroundColor: "#151a23",
    boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
    minWidth: "240px"
  },
  title: {
    margin: "0 0 0.5rem",
    fontSize: "1rem"
  },
  address: {
    display: "block",
    fontFamily: "monospace",
    wordBreak: "break-all",
    color: "#e0e7ff"
  },
  muted: {
    color: "rgba(255,255,255,0.6)"
  }
};

const PresaleInfoCard = ({ title, address }) => (
  <div style={styles.card}>
    <h3 style={styles.title}>{title}</h3>
    {address ? <code style={styles.address}>{address}</code> : <span style={styles.muted}>not deployed</span>}
  </div>
);

export default PresaleInfoCard;
