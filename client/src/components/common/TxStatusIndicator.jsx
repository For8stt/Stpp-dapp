import React from "react";

const statusStyles = {
  pending: "bg-blue-500/10 text-blue-400 border-blue-500/40",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40",
  error: "bg-rose-500/10 text-rose-400 border-rose-500/40",
};

const TxStatusIndicator = ({ status, message, hash, onClear }) => {
  if (!status) return null;
  const style = statusStyles[status] || statusStyles.pending;

  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${style}`}>
      <div className="flex w-full items-center justify-between gap-4">
        <div>
          <p className="font-semibold capitalize">{status}</p>
          {message && <p className="text-xs opacity-80">{message}</p>}
          {hash && (
            <p className="mt-1 text-[13px] font-mono break-all">
              {hash}
            </p>
          )}
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="rounded-lg border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/80 transition hover:border-white/30 hover:bg-white/5"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
};

export default TxStatusIndicator;
