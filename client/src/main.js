import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

import App from "./App";
import { config } from "./config/wagmi";

// Clear auction-related storage on app start (especially for local networks)
// This ensures a fresh start when restarting the application
if (typeof window !== "undefined") {
  const isLocalhost = window.location.hostname === "localhost" || 
                      window.location.hostname === "127.0.0.1" ||
                      window.location.hostname === "";
  
  if (isLocalhost) {
    try {
      const timeServiceKeys = [
        "timeService:lastTime",
        "timeService:lastTimeTimestamp",
        "timeService:blockchainOffset",
        "timeService:lastSyncTime",
        "timeService:lastBlockchainTime",
      ];

      timeServiceKeys.forEach((key) => {
        window.sessionStorage.removeItem(key);
      });

      console.log("Cleared auction time storage for fresh start (localhost)");
    } catch (error) {
      console.warn("Failed to clear storage:", error);
    }
  }
}

const queryClient = new QueryClient();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider locale="en">
        <App />
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
