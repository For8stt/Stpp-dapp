import { useState, useEffect, useRef } from "react";
import { useChainId } from "wagmi";
import { JsonRpcProvider } from "ethers";

/**
 * Hook to get current time, updating every second
 * On local networks, uses system time but syncs with blockchain periodically
 * On public networks, uses system time
 * @param {Object} provider - Optional ethers provider to fetch blockchain time
 * @param {number} updateInterval - Update interval in milliseconds (default: 1000ms)
 * @returns {Object} { currentTime, refreshTime } - Current timestamp in seconds and refresh function
 */
export const useNow = (provider = null, updateInterval = 1000) => {
  const chainId = useChainId();
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));
  const intervalRef = useRef(null);
  const providerRef = useRef(provider);
  const isLocalNetworkRef = useRef(chainId === 31337 || chainId === 1337);
  const hardhatProviderRef = useRef(null);
  const refreshTimeRef = useRef(null);
  
  // Store blockchain time offset for local networks
  const blockchainTimeOffsetRef = useRef(0);
  const syncCountRef = useRef(0);

  // Update refs when values change
  useEffect(() => {
    providerRef.current = provider;
    isLocalNetworkRef.current = chainId === 31337 || chainId === 1337;
    
    // On local networks, create direct connection to Hardhat node
    if (isLocalNetworkRef.current && !hardhatProviderRef.current) {
      try {
        hardhatProviderRef.current = new JsonRpcProvider("http://127.0.0.1:8545");
        console.log("Created Hardhat provider for time updates");
      } catch (err) {
        console.warn("Could not create Hardhat provider:", err);
      }
    }
  }, [provider, chainId]);

  // Set up interval for automatic updates
  useEffect(() => {
    const updateTime = () => {
      const systemTime = Math.floor(Date.now() / 1000);
      
      // On local networks, use system time + offset
      // Offset is synced periodically from blockchain
      const adjustedTime = isLocalNetworkRef.current 
        ? systemTime + blockchainTimeOffsetRef.current 
        : systemTime;
      
      // Always update to ensure smooth ticking
      setCurrentTime(adjustedTime);
    };

    // Sync with blockchain periodically (every 5 seconds on local networks)
    const syncWithBlockchain = async () => {
      if (isLocalNetworkRef.current) {
        syncCountRef.current++;
        // Sync every 5 seconds
        if (syncCountRef.current % 5 === 0) {
          const prov = hardhatProviderRef.current || providerRef.current;
          if (prov) {
            try {
              const block = await prov.getBlock("latest");
              if (block?.timestamp) {
                const blockchainTime = Number(block.timestamp);
                const systemTime = Math.floor(Date.now() / 1000);
                blockchainTimeOffsetRef.current = blockchainTime - systemTime;
                console.log("Synced with blockchain:", blockchainTime, "offset:", blockchainTimeOffsetRef.current);
                // Update immediately with blockchain time
                setCurrentTime(blockchainTime);
              }
            } catch (err) {
              console.warn("Could not sync blockchain time:", err);
            }
          }
        }
      }
    };

    // Store refresh function in ref
    refreshTimeRef.current = async () => {
      // Force refresh from blockchain on local networks
      if (isLocalNetworkRef.current) {
        const prov = hardhatProviderRef.current || providerRef.current;
        if (prov) {
          try {
            const block = await prov.getBlock("latest");
            if (block?.timestamp) {
              const newTime = Number(block.timestamp);
              const systemTime = Math.floor(Date.now() / 1000);
              blockchainTimeOffsetRef.current = newTime - systemTime;
              console.log("Manual refresh - blockchain time:", newTime, "offset:", blockchainTimeOffsetRef.current);
              setCurrentTime(newTime);
              return;
            }
          } catch (err) {
            console.warn("Could not refresh blockchain time:", err);
          }
        }
      }
      // Fallback to system time
      const systemTime = Math.floor(Date.now() / 1000);
      const adjustedTime = isLocalNetworkRef.current 
        ? systemTime + blockchainTimeOffsetRef.current 
        : systemTime;
      setCurrentTime(adjustedTime);
    };

    // Initial blockchain time fetch to set offset
    const initTime = async () => {
      if (isLocalNetworkRef.current) {
        const prov = hardhatProviderRef.current || providerRef.current;
        if (prov) {
          try {
            const block = await prov.getBlock("latest");
            if (block?.timestamp) {
              const blockchainTime = Number(block.timestamp);
              const systemTime = Math.floor(Date.now() / 1000);
              blockchainTimeOffsetRef.current = blockchainTime - systemTime;
              console.log("Initial blockchain time:", blockchainTime, "offset:", blockchainTimeOffsetRef.current);
              setCurrentTime(blockchainTime);
              return;
            }
          } catch (err) {
            console.warn("Could not fetch initial blockchain time:", err);
          }
        }
      }
      updateTime();
    };

    // Initialize time
    initTime();

    // Update time every second
    intervalRef.current = setInterval(() => {
      updateTime();
      syncWithBlockchain();
    }, updateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [updateInterval, chainId]);

  // Function to manually refresh time (useful after fast-forwarding)
  const refreshTime = async () => {
    if (refreshTimeRef.current) {
      await refreshTimeRef.current();
    }
  };

  return { currentTime, refreshTime };
};

export default useNow;
