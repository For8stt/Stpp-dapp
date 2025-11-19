import React from "react";

const styles = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem"
  },
  textarea: {
    width: "100%",
    minHeight: "160px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.2)",
    padding: "0.75rem",
    backgroundColor: "#0f131b",
    color: "#f5f5f5",
    fontFamily: "monospace",
    fontSize: "0.9rem"
  },
  button: {
    alignSelf: "flex-start",
    padding: "0.75rem 1.5rem",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
    backgroundColor: "#6366f1",
    color: "#fff",
    fontSize: "1rem"
  }
};

const PresaleCreateForm = ({
  auctionJSON,
  lbpJSON,
  onAuctionChange,
  onLbpChange,
  onSubmit,
  submitting,
  disabled
}) => (
  <div style={styles.form}>
    <label>
      Auction Input JSON
      <textarea
        style={styles.textarea}
        value={auctionJSON}
        onChange={(event) => onAuctionChange(event.target.value)}
        placeholder='{"saleToken":"0x...","treasury":"0x...","priceTicks":["1000000000000000000"]}'
      />
    </label>
    <label>
      LBP Config JSON
      <textarea
        style={styles.textarea}
        value={lbpJSON}
        onChange={(event) => onLbpChange(event.target.value)}
        placeholder='{"startTime":1690000000,"endTime":1690003600,"poolSwapFee":3000000000000000,...}'
      />
    </label>
    <button style={styles.button} onClick={onSubmit} disabled={submitting || disabled}>
      {submitting ? "Creating..." : "Create Presale"}
    </button>
  </div>
);

export default PresaleCreateForm;
