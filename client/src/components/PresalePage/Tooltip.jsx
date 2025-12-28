import React, { useState } from "react";

const Tooltip = ({ children, text }) => {
  const [show, setShow] = useState(false);
  
  if (!text) return children;
  
  return (
    <div className="relative inline-block">
      <div
        className="inline-flex items-center gap-1.5 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
        <svg
          className="w-4 h-4 text-white/50 hover:text-white/70 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      {show && (
        <div className="absolute z-50 w-80 p-3 text-xs leading-relaxed text-white bg-gradient-to-br from-slate-900 to-slate-800 border border-white/20 rounded-lg shadow-xl mt-2 left-0 top-full pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
};

export default Tooltip;

