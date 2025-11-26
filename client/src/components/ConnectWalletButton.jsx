import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const ConnectWalletButton = ({ className = "" }) => {
  return (
    <div className={`wallet-connect ${className}`}>
      <ConnectButton 
        showBalance={false}
        chainStatus="icon"
      />
    </div>
  );
};

export default ConnectWalletButton;
