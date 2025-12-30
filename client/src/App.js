import React, { useCallback, useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import { useAccount } from "wagmi";

import AppRouter from "./router";
import "./styles/globals.css";
import "./styles/theme.css";
import "./styles/tailwind.css";
import "react-toastify/dist/ReactToastify.css";

const App = () => {
  const { address, isConnected, isConnecting } = useAccount();
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

        triggerRefresh();
      } catch (error) {
        console.error("Wallet connection failed:", error);
        toast.error(error?.message || "Wallet connection failed");
      }
    },
    [triggerRefresh, address]
  );

  useEffect(() => {
    const initialize = async () => {
      if (isConnecting) {
        setTimeout(() => {
          setInitializing(false);
        }, 500);
        return;
      }

      if (isConnected && address) {
        triggerRefresh();
      }

      setInitializing(false);
    };

    initialize();
  }, [isConnected, isConnecting, address, triggerRefresh]);

  useEffect(() => {
    if (isConnected && address) {
      triggerRefresh();
    }
  }, [address, isConnected, triggerRefresh]);

  return (
    <>
      <AppRouter
        account={address}
        onConnect={handleConnected}
        refreshKey={refreshKey}
        onActionComplete={triggerRefresh}
        initializing={initializing}
      />
      <ToastContainer position="bottom-right" />
    </>
  );
};

export default App;
