import React from "react";

const VestingEmpty = ({ message = "No vesting data available" }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <div className="text-center">
        <p className="text-lg font-medium text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">{message}</p>
      </div>
    </div>
  );
};

export default VestingEmpty;




