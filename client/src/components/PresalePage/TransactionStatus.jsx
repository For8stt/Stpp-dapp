import React from "react";
import { shortenHash } from "./utils";

const TransactionStatus = ({ txStatus }) => {
  if (!txStatus) return null;

  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl border px-6 py-4 text-base font-medium backdrop-blur-[10px] shadow-[0_4px_12px] animate-slideIn sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-4 ${
      txStatus.status === "success" 
        ? "border-green-500/50 bg-green-500/15 text-green-100 shadow-green-500/20" 
        : txStatus.status === "error"
        ? "border-red-500/50 bg-red-500/12 text-red-100 shadow-red-500/15"
        : "border-blue-500/40 bg-blue-500/12 text-blue-100 shadow-blue-500/15"
    }`}>
      <span>{txStatus.message}</span>
      {txStatus.hash && (
        <span className={`font-mono text-sm rounded-lg border px-3 py-1.5 ${
          txStatus.status === "success"
            ? "border-green-500/30 bg-green-500/15 text-green-500/95"
            : txStatus.status === "error"
            ? "border-red-500/30 bg-red-500/15 text-red-500/95"
            : "border-yellow-500/20 bg-yellow-500/10 text-yellow-500/95"
        }`}>
          {shortenHash(txStatus.hash)}
        </span>
      )}
    </div>
  );
};

export default TransactionStatus;

