import { useState, useEffect, useRef, useCallback } from "react";
import { useChainId } from "wagmi";
import { getTimeService, TIME_SOURCE } from "./timeService";
import { ensureProvider } from "../services/web3/provider";

/**
 * useTime - React hook for unified time access
 * 
 * Provides:
 * - currentTime: Current timestamp in seconds
 * - timeSource: Source of time (chain | local)
 * - refreshTime: Manual refresh function
 * - setProvider: Function to set provider from external source
 */
export const useTime = () => {
  const chainId = useChainId();
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));
  const [timeSource, setTimeSource] = useState(TIME_SOURCE.LOCAL);
  const serviceRef = useRef(null);
  const providerRef = useRef(null);

  useEffect(() => {
    const service = getTimeService();
    serviceRef.current = service;

    const initService = async () => {
      try {
        let provider = providerRef.current;
        if (!provider) {
          try {
            provider = ensureProvider();
          } catch (err) {
          }
        }

        await service.initialize(chainId, provider);
        
        setCurrentTime(service.getTime());
        setTimeSource(service.getTimeSource());
      } catch (err) {
        console.warn("Time service initialization error:", err);
      }
    };

    initService();

    const unsubscribe = service.subscribe(({ currentTime: time, timeSource: source }) => {
      setCurrentTime(time);
      setTimeSource(source);
    });

    return () => {
      unsubscribe();
    };
  }, [chainId]);

  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;

    const updateProvider = async () => {
      try {
        let provider = providerRef.current;
        if (!provider) {
          try {
            provider = ensureProvider();
          } catch (err) {
          }
        }
        await service.updateProvider(chainId, provider);
      } catch (err) {
        console.warn("Time service provider update error:", err);
      }
    };

    updateProvider();
  }, [chainId]);

  const refreshTime = useCallback(async () => {
    const service = serviceRef.current;
    if (service) {
      await service.refresh();
    }
  }, []);

  const setProvider = useCallback((provider) => {
    providerRef.current = provider;
    const service = serviceRef.current;
    if (service) {
      service.updateProvider(chainId, provider);
    }
  }, [chainId]);

  return {
    currentTime,
    timeSource,
    refreshTime,
    setProvider,
  };
};

export default useTime;

