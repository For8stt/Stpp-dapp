import React from "react";

const PresaleInfoCard = ({ title, address }) => (
  <div className="min-w-[240px] rounded-xl bg-surface p-4 shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
    <h3 className="m-0 mb-2 text-base font-semibold text-text">{title}</h3>
    {address ? (
      <code className="block break-all font-mono text-[#e0e7ff]">{address}</code>
    ) : (
      <span className="text-text-muted">not deployed</span>
    )}
  </div>
);

export default PresaleInfoCard;
