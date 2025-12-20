import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const ConnectWalletButton = ({ className = "" }) => {
  return (
    <div className={`flex flex-col items-start gap-3 ${className}`.trim()}>
      <ConnectButton 
        showBalance={false}
        chainStatus="icon"
      />
    </div>
  );
};

export default ConnectWalletButton;
