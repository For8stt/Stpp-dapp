import React from "react";

const LoadingErrorState = ({ loading, error }) => {
  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 text-center text-lg text-white/70 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-900/20 to-red-800/15 p-8 text-red-100 shadow-[0_20px_50px_rgba(239,68,68,0.15),0_0_0_1px_rgba(239,68,68,0.2)_inset] sm:p-6 sm:p-5">
        {error}
      </div>
    );
  }

  return null;
};

export default LoadingErrorState;

