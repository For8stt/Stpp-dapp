import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import { getWalletProviders } from "../services/web3/provider";
import { requestAccount } from "../services/web3/wallet";

const ConnectWalletButton = ({
  onConnected,
  onWalletChange,
  selectedWalletId,
  className = ""
}) => {
  const [connecting, setConnecting] = useState(false);
  const [walletOptions, setWalletOptions] = useState([]);

  const refreshWalletOptions = useCallback(() => {
    setWalletOptions(getWalletProviders());
  }, []);

  useEffect(() => {
    refreshWalletOptions();
    const handleEthereumInitialized = () => refreshWalletOptions();
    window?.addEventListener("ethereum#initialized", handleEthereumInitialized, { once: true });

    return () => {
      window?.removeEventListener("ethereum#initialized", handleEthereumInitialized);
    };
  }, [refreshWalletOptions]);

  useEffect(() => {
    if (!selectedWalletId && walletOptions.length > 0 && onWalletChange) {
      onWalletChange(walletOptions[0].id);
    }
  }, [selectedWalletId, walletOptions, onWalletChange]);

  const handleWalletSelect = (event) => {
    const nextId = event.target.value || undefined;
    onWalletChange?.(nextId);
  };

  const connectWallet = async () => {
    setConnecting(true);
    try {
      const account = await requestAccount();
      if (account) {
        await onConnected(account);
      } else {
        toast.warn("No account returned from wallet");
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error(error?.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  };

  if (walletOptions.length === 0) {
    return <p className="muted">No injected wallets detected. Install MetaMask, Rabby, or another wallet.</p>;
  }

  return (
    <div className={`wallet-connect ${className}`}>
      {walletOptions.length > 1 ? (
        <label className="wallet-select">
          <span>Choose Wallet</span>
          <select value={selectedWalletId ?? ""} onChange={handleWalletSelect}>
            {walletOptions.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted">Detected wallet: {walletOptions[0].name}</p>
      )}
      <button className="btn primary" onClick={connectWallet} disabled={connecting}>
        {connecting ? "Connecting..." : "Connect Web3 Wallet"}
      </button>
    </div>
  );
};

export default ConnectWalletButton;
