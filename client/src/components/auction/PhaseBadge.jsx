import React from "react";

const PhaseBadge = ({ phase, countdown }) => {
  const phaseClass = phase?.toLowerCase() || 'notstarted';
  
  const phaseStyles = {
    notstarted: "bg-[rgba(100,116,139,0.2)] border-[rgba(100,116,139,0.4)] text-[rgb(203,213,225)]",
    commit: "bg-[rgba(59,130,246,0.2)] border-[rgba(59,130,246,0.4)] text-[rgb(147,197,253)]",
    reveal: "bg-[rgba(147,51,234,0.2)] border-[rgba(147,51,234,0.4)] text-[rgb(196,181,253)]",
    finalized: "bg-[rgba(16,185,129,0.2)] border-[rgba(16,185,129,0.4)] text-[rgb(110,231,183)]"
  };
  
  return (
    <div className={`px-6 py-4 rounded-2xl border bg-[rgba(15,23,42,0.8)] backdrop-blur-[10px] transition-all duration-300 text-center ${phaseStyles[phaseClass] || phaseStyles.notstarted}`}>
      <p className="text-xs uppercase tracking-wider mb-1 opacity-80">Current Phase</p>
      <p className="text-xl font-bold mb-1">{phase}</p>
      {countdown && (
        <p className="text-sm opacity-90 mt-2">Next phase in: {countdown}</p>
      )}
    </div>
  );
};

export default PhaseBadge;

