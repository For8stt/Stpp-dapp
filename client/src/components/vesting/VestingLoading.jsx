import React from "react";

const VestingLoading = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <div className="text-center">
        <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-transparent border-t-[rgb(74,222,128)] border-r-[rgba(74,222,128,0.3)] shadow-[0_0_20px_rgba(74,222,128,0.3)]"></div>
        <p className="text-lg font-medium text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">Loading vesting data…</p>
      </div>
    </div>
  );
};

export default VestingLoading;






