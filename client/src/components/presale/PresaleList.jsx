import React from "react";
import { Link } from "react-router-dom";

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "1rem"
};

const thStyle = {
  textAlign: "left",
  padding: "0.5rem",
  borderBottom: "1px solid rgba(255,255,255,0.15)"
};

const tdStyle = {
  padding: "0.5rem",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  wordBreak: "break-all"
};

const buttonStyle = {
  border: "none",
  backgroundColor: "#0fa392",
  color: "#0f172a",
  padding: "0.55rem 1.1rem",
  borderRadius: "8px",
  cursor: "pointer",
  textDecoration: "none",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  gap: "0.35rem",
  boxShadow: "0 10px 20px rgba(15,163,146,0.3)",
  transition: "transform 120ms ease, box-shadow 120ms ease"
};

const PresaleList = ({ items }) => {
  if (!items?.length) {
    return <p>No presales detected. Create one above to get started.</p>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Owner</th>
          <th style={thStyle}>Manager</th>
          <th style={thStyle}>Auction</th>
          <th style={thStyle}>LBP</th>
          <th style={thStyle}>Vesting</th>
          <th style={thStyle}>Block</th>
          <th style={thStyle}>Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.manager}-${index}`}>
            <td style={tdStyle}>{item.owner}</td>
            <td style={tdStyle}>{item.manager}</td>
            <td style={tdStyle}>{item.auction}</td>
            <td style={tdStyle}>{item.lbp}</td>
            <td style={tdStyle}>{item.vesting}</td>
            <td style={tdStyle}>{item.blockNumber}</td>
            <td style={tdStyle}>
              <Link style={buttonStyle} to={`/presale/${item.manager}`}>
                Open Presale
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default PresaleList;
