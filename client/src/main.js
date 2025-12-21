import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

import App from "./App";
import { config } from "./config/wagmi";

if (typeof window !== "undefined") {
  const isLocalhost = window.location.hostname === "localhost" || 
                      window.location.hostname === "127.0.0.1" ||
                      window.location.hostname === "";
  
  if (isLocalhost) {
    try {
      const SESSION_FLAG = "sttp:session-initialized";
      const isFreshSession = !window.sessionStorage.getItem(SESSION_FLAG);
      
      if (isFreshSession) {
        const timeServiceKeys = [
          "timeService:lastTime",
          "timeService:lastTimeTimestamp",
          "timeService:blockchainOffset",
          "timeService:lastSyncTime",
          "timeService:lastBlockchainTime",
        ];

        timeServiceKeys.forEach((key) => {
          window.localStorage.removeItem(key);
        });

        window.sessionStorage.setItem(SESSION_FLAG, "true");
        
        console.log("Cleared auction time storage for fresh browser session (localhost)");
      } else {
        console.log("Preserving storage - page refresh detected (localhost)");
      }
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