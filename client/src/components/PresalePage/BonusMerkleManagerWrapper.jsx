import React from "react";
import BonusMerkleManager from "../presale/BonusMerkleManager";

const BonusMerkleManagerWrapper = ({ isOwner, auctionContract, auctionAddress, auctionData, onUpdate }) => {
  if (!isOwner || !auctionContract || !auctionAddress) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
      <BonusMerkleManager
        auctionContract={auctionContract}
        auctionAddress={auctionAddress}
        auctionData={auctionData}
        onUpdate={onUpdate}
      />
    </div>
  );
};

export default BonusMerkleManagerWrapper;

