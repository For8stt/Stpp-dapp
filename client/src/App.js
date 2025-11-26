import React, { useCallback, useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import { useAccount, useDisconnect } from "wagmi";

import AppRouter from "./router";
import { clearConnectionState, resetConnection } from "./services/web3/contract";
import "./styles/globals.css";
import "./styles/theme.css";
import "react-toastify/dist/ReactToastify.css";

const App = () => {
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const [refreshKey, setRefreshKey] = useState(0);
  const [initializing, setInitializing] = useState(true);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleConnected = useCallback(
    async (connectedAccount) => {
      try {
        const accountToUse = connectedAccount ?? address;
        if (!accountToUse) {
          return;
        }

        // Не викликаємо resetConnection, оскільки RainbowKit сам керує підключенням
        triggerRefresh();
      } catch (error) {
        console.error("Wallet connection failed:", error);
        toast.error(error?.message || "Wallet connection failed");
      }
    },
    [triggerRefresh, address]
  );

  const handleDisconnect = useCallback(() => {
    disconnect();
    clearConnectionState();
    triggerRefresh();
    toast.info("Wallet disconnected");
  }, [disconnect, triggerRefresh]);

  useEffect(() => {
    const initialize = async () => {
      if (isConnecting) {
        return;
      }

      // Просто оновлюємо стан, не викликаємо resetConnection
      // RainbowKit сам керує підключенням
      if (isConnected && address) {
        triggerRefresh();
      }

      setInitializing(false);
    };

    initialize();
  }, [isConnected, isConnecting, address, triggerRefresh]);

  // Оновлення при зміні акаунта або мережі
  useEffect(() => {
    if (isConnected && address) {
      // Просто оновлюємо стан, не викликаємо resetConnection
      triggerRefresh();
    }
  }, [address, isConnected, triggerRefresh]);

  return (
    <>
      <AppRouter
        account={address}
        onConnect={handleConnected}
        onDisconnect={handleDisconnect}
        onWalletChange={() => {}} // RainbowKit сам керує вибором гаманця
        selectedWalletId={null} // Не потрібно для RainbowKit
        refreshKey={refreshKey}
        onActionComplete={triggerRefresh}
        initializing={initializing}
      />
      <ToastContainer position="bottom-right" />
    </>
  );
};

export default App;
