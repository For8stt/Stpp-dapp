import React, { useCallback, useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";

import AppRouter from "./router";
import { clearConnectionState, resetConnection } from "./services/web3/contract";
import { getCurrentWalletInfo, selectWalletProvider } from "./services/web3/provider";
import { requestAccount, subscribeWalletEvents } from "./services/web3/wallet";
import "./styles/globals.css";
import "./styles/theme.css";
import "react-toastify/dist/ReactToastify.css";

const AUTO_CONNECT_KEY = "lockdapp:autoConnect";

const getStoredAutoConnect = () => {
  if (typeof window === "undefined") {
    return true;
  }
  const stored = window.localStorage.getItem(AUTO_CONNECT_KEY);
  return stored !== "false";
};

const persistAutoConnect = (enabled) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(AUTO_CONNECT_KEY, enabled ? "true" : "false");
};

const App = () => {
  const [account, setAccount] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [walletId, setWalletId] = useState(() => getCurrentWalletInfo()?.id ?? null);
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(getStoredAutoConnect);

  useEffect(() => {
    const syncWallet = () => {
      const info = getCurrentWalletInfo();
      if (info?.id && info.id !== walletId) {
        setWalletId(info.id);
      }
    };

    syncWallet();
    window?.addEventListener("ethereum#initialized", syncWallet, { once: true });
    return () => {
      window?.removeEventListener("ethereum#initialized", syncWallet);
    };
  }, [walletId]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleConnected = useCallback(
    async (connectedAccount) => {
      try {
        if (!walletId) {
          toast.error("Select a wallet before connecting.");
          return;
        }
        const accountToUse = connectedAccount ?? (await requestAccount());
        if (!accountToUse) {
          return;
        }

        setAccount(accountToUse);
        await resetConnection();
        triggerRefresh();
        setAutoConnectEnabled(true);
        persistAutoConnect(true);
      } catch (error) {
        console.error("Wallet connection failed:", error);
        toast.error(error?.message || "Wallet connection failed");
      }
    },
    [triggerRefresh, walletId]
  );

  const handleDisconnect = useCallback(() => {
    clearConnectionState();
    setAccount(null);
    triggerRefresh();
    toast.info("Wallet disconnected");
    setAutoConnectEnabled(false);
    persistAutoConnect(false);
  }, [triggerRefresh]);

  useEffect(() => {
    const initialize = async () => {
      if (!autoConnectEnabled) {
        setInitializing(false);
        return;
      }

      if (!walletId) {
        setInitializing(false);
        return;
      }

      try {
        const acc = await requestAccount();
        if (acc) {
          setAccount(acc);
          await resetConnection();
          triggerRefresh();
          persistAutoConnect(true);
          setAutoConnectEnabled(true);
        }
      } catch (error) {
        console.warn("Initial wallet connection skipped:", error);
      } finally {
        setInitializing(false);
      }
    };

    initialize();
  }, [autoConnectEnabled, triggerRefresh, walletId]);

  useEffect(() => {
    if (!walletId) {
      return () => {};
    }

    const unsubscribe = subscribeWalletEvents({
      onAccountsChanged: async (accounts) => {
        const nextAccount = accounts?.[0] ?? null;
        if (!autoConnectEnabled && !account) {
          return;
        }
        setAccount(nextAccount);
        try {
          await resetConnection();
          triggerRefresh();
        } catch (error) {
          console.error("Failed to reset connection after account change:", error);
        }
      },
      onChainChanged: async () => {
        try {
          await resetConnection();
          triggerRefresh();
        } catch (error) {
          console.error("Failed to reset connection after chain change:", error);
        }
      }
    });

    return () => unsubscribe();
  }, [triggerRefresh, autoConnectEnabled, account, walletId]);

  const handleWalletSelection = useCallback(
    (nextWalletId) => {
      const meta = selectWalletProvider(nextWalletId);
      setWalletId(meta?.id ?? null);
      clearConnectionState();
      setAccount(null);
      setAutoConnectEnabled(false);
      persistAutoConnect(false);
      triggerRefresh();
      if (meta) {
        toast.info(`Selected ${meta.name}. Please connect to continue.`);
      }
    },
    [triggerRefresh]
  );

  return (
    <>
      <AppRouter
        account={account}
        onConnect={handleConnected}
        onDisconnect={handleDisconnect}
        onWalletChange={handleWalletSelection}
        selectedWalletId={walletId}
        refreshKey={refreshKey}
        onActionComplete={triggerRefresh}
        initializing={initializing}
      />
      <ToastContainer position="bottom-right" />
    </>
  );
};

export default App;
