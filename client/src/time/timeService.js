import { JsonRpcProvider } from "ethers";
import { ensureProvider } from "../services/web3/provider";

/**
 * Time source types
 */
export const TIME_SOURCE = {
  CHAIN: "chain",
  LOCAL: "local",
};

const STORAGE_KEY = "timeService:lastTime";
const STORAGE_TIMESTAMP_KEY = "timeService:lastTimeTimestamp";
const STORAGE_OFFSET_KEY = "timeService:blockchainOffset";
const STORAGE_SYNC_TIME_KEY = "timeService:lastSyncTime";
const MAX_STORED_TIME_AGE = 300; // 5 minutes - don't use stored time if it's older than this (only for page refresh, not new session)

class TimeService {
  constructor() {
    const storedData = this.getStoredTime();
    const systemTime = Math.floor(Date.now() / 1000);
    
    if (storedData && storedData.time && storedData.timestamp) {
      const timeSinceStored = systemTime - storedData.timestamp;
      // If stored time is recent (within MAX_STORED_TIME_AGE), use it and continue from there
      if (timeSinceStored >= 0 && timeSinceStored < MAX_STORED_TIME_AGE) {
        // Continue time from stored time + elapsed time
        this.currentTime = storedData.time + timeSinceStored;
        this.blockchainTimeOffset = storedData.offset || 0;
        this.lastSyncTime = storedData.syncTime || null;
        this.lastBlockchainTime = storedData.blockchainTime || null;
      } else {
        this.currentTime = systemTime;
        this.blockchainTimeOffset = 0;
        this.lastSyncTime = null;
        this.lastBlockchainTime = null;
        if (timeSinceStored >= MAX_STORED_TIME_AGE) {
          this.clearStoredTime();
        }
      }
    } else {
      this.currentTime = systemTime;
      this.blockchainTimeOffset = 0;
      this.lastSyncTime = null;
      this.lastBlockchainTime = null;
    }
    
    this.timeSource = TIME_SOURCE.LOCAL;
    this.authoritativeTimeSource = TIME_SOURCE.LOCAL;
    this.updateInterval = 1000; // 1 second
    this.intervalId = null;
    this.syncCount = 0;
    this.provider = null;
    this.hardhatProvider = null;
    this.chainId = null;
    this.isLocalNetwork = false;
    this.subscribers = new Set();
    this.isInitialized = false;
    this.syncInProgress = false; // Guard to prevent concurrent sync calls
  }

  /**
   * Get stored time from sessionStorage (not localStorage to avoid persisting across app restarts)
   */
  getStoredTime() {
    if (typeof window === "undefined") return null;
    try {
      const storedTimestamp = window.sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);
      const storedTime = window.sessionStorage.getItem(STORAGE_KEY);
      const storedOffset = window.sessionStorage.getItem(STORAGE_OFFSET_KEY);
      const storedSyncTime = window.sessionStorage.getItem(STORAGE_SYNC_TIME_KEY);
      const storedBlockchainTime = window.sessionStorage.getItem("timeService:lastBlockchainTime");
      
      if (!storedTimestamp || !storedTime) {
        return null;
      }
      
      const timestamp = parseInt(storedTimestamp, 10);
      const time = parseInt(storedTime, 10);
      
      if (isNaN(timestamp) || isNaN(time) || time <= 0) {
        return null;
      }
      
      const now = Date.now();
      if (now - timestamp > MAX_STORED_TIME_AGE * 1000) {
        this.clearStoredTime();
        return null;
      }
      
      const systemTime = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(systemTime - time);
      if (timeDiff > 86400) { // More than 1 day difference - invalid
        this.clearStoredTime();
        return null;
      }
      
      return {
        time,
        timestamp: Math.floor(timestamp / 1000), // Convert to seconds
        offset: storedOffset ? parseInt(storedOffset, 10) : 0,
        syncTime: storedSyncTime ? parseInt(storedSyncTime, 10) : null,
        blockchainTime: storedBlockchainTime ? parseInt(storedBlockchainTime, 10) : null,
      };
    } catch (err) {
    }
    return null;
  }

  /**
   * Clear stored time from sessionStorage
   */
  clearStoredTime() {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      window.sessionStorage.removeItem(STORAGE_OFFSET_KEY);
      window.sessionStorage.removeItem(STORAGE_SYNC_TIME_KEY);
      window.sessionStorage.removeItem("timeService:lastBlockchainTime");
    } catch (err) {
    }
  }

  /**
   * Store current time in sessionStorage (not localStorage to avoid persisting across app restarts)
   */
  storeTime() {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(this.currentTime));
      window.sessionStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
      window.sessionStorage.setItem(STORAGE_OFFSET_KEY, String(this.blockchainTimeOffset));
      if (this.lastSyncTime !== null) {
        window.sessionStorage.setItem(STORAGE_SYNC_TIME_KEY, String(this.lastSyncTime));
      }
      if (this.lastBlockchainTime !== null) {
        window.sessionStorage.setItem("timeService:lastBlockchainTime", String(this.lastBlockchainTime));
      }
    } catch (err) {
    }
  }

  /**
   * Initialize the time service
   */
  async initialize(chainId, provider = null) {
    if (this.isInitialized && this.chainId === chainId) {
      if (provider) {
        this.provider = provider;
      }
      return;
    }

    this.stopPolling();

    this.chainId = chainId;
    this.provider = provider;
    this.isLocalNetwork = chainId === 31337 || chainId === 1337;

    if (this.isLocalNetwork) {
      this.clearStoredTime();
      const systemTime = Math.floor(Date.now() / 1000);
      this.currentTime = systemTime;
      this.blockchainTimeOffset = 0;
      this.lastSyncTime = null;
      this.lastBlockchainTime = null;
      this.timeSource = TIME_SOURCE.LOCAL;
    }

    if (this.isLocalNetwork && !this.hardhatProvider) {
      try {
        this.hardhatProvider = new JsonRpcProvider("http://127.0.0.1:8545");
      } catch (err) {
      }
    }

    await this.initialSync();
    this.startPolling();
    this.isInitialized = true;
  }

  async initialSync() {
    const activeProvider = this.hardhatProvider || this.provider;
    const systemTime = Math.floor(Date.now() / 1000);
    const previousTime = this.currentTime; // Store current time to prevent rollback

    if (activeProvider) {
      try {
        const block = await activeProvider.getBlock("latest");
        if (block?.timestamp) {
          const blockchainTime = Number(block.timestamp);
          // Only update if blockchain time is ahead of current time
          // This preserves the stored time continuation if it's more recent
          if (blockchainTime > previousTime) {
            this.currentTime = blockchainTime;
          }
          // Always update offset and sync info for accurate future calculations
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime;
          this.timeSource = TIME_SOURCE.CHAIN;
          this.storeTime();
          this.notifySubscribers();
          return;
        }
      } catch (err) {
      }
    }

    if (!activeProvider) {
      try {
        const fallbackProvider = ensureProvider();
        const block = await fallbackProvider.getBlock("latest");
        if (block?.timestamp) {
          const blockchainTime = Number(block.timestamp);
          // Only update if blockchain time is ahead of current time
          if (blockchainTime > previousTime) {
            this.currentTime = blockchainTime;
          }
          // Always update offset and sync info for accurate future calculations
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime;
          this.timeSource = TIME_SOURCE.CHAIN;
          this.storeTime();
          this.notifySubscribers();
          return;
        }
      } catch (err) {
      }
    }

    // Fallback to system time only if it's ahead of current time
    if (systemTime > previousTime) {
      this.currentTime = systemTime;
    }
    this.blockchainTimeOffset = 0;
    this.timeSource = TIME_SOURCE.LOCAL;
    this.storeTime();
    this.notifySubscribers();
  }

  /**
   * Sync time from blockchain
   * Updates currentTime to match blockchain time when syncing
   * Ensures time never goes backward
   */
  async syncTime() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      const activeProvider = this.hardhatProvider || this.provider;
      const systemTime = Math.floor(Date.now() / 1000);
      const previousTime = this.currentTime;

      if (activeProvider) {
        try {
          const block = await activeProvider.getBlock("latest");
          if (block?.timestamp) {
            const blockchainTime = Number(block.timestamp);
            this.blockchainTimeOffset = blockchainTime - systemTime;
            this.lastSyncTime = systemTime;
            this.timeSource = TIME_SOURCE.CHAIN;
            this.authoritativeTimeSource = TIME_SOURCE.CHAIN;
            this.lastBlockchainTime = blockchainTime; // Track last known blockchain time
            // Only update time forward, never backward
            if (blockchainTime > previousTime) {
              this.currentTime = blockchainTime;
            }
            this.storeTime();
            this.notifySubscribers();

            return;
          }
        } catch (err) {
        }
      }

      if (!activeProvider) {
        try {
          const fallbackProvider = ensureProvider();
          const block = await fallbackProvider.getBlock("latest");
          if (block?.timestamp) {
            const blockchainTime = Number(block.timestamp);
            this.blockchainTimeOffset = blockchainTime - systemTime;
            this.lastSyncTime = systemTime;
            this.timeSource = TIME_SOURCE.CHAIN;
            this.authoritativeTimeSource = TIME_SOURCE.CHAIN;
            this.lastBlockchainTime = blockchainTime; // Track last known blockchain time
            // Only update time forward, never backward
            if (blockchainTime > previousTime) {
              this.currentTime = blockchainTime;
            }
            this.storeTime();
            this.notifySubscribers();
            
            return;
          }
        } catch (err) {
        }
      }

      this.blockchainTimeOffset = 0;
      this.timeSource = TIME_SOURCE.LOCAL;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Update time using system clock (smooth ticking)
   * Uses blockchain offset when available to ensure accuracy
   */
  updateTime() {
    const systemTime = Math.floor(Date.now() / 1000);
    if (this.timeSource === TIME_SOURCE.CHAIN && this.blockchainTimeOffset !== null && this.lastSyncTime !== null) {
      const calculatedBlockchainTime = systemTime + this.blockchainTimeOffset;
      if (this.lastBlockchainTime !== null) {
        if (calculatedBlockchainTime <= this.lastBlockchainTime) {
          if (this.currentTime >= this.lastBlockchainTime) {
            this.currentTime = this.currentTime + 1;
          } else {
            const newTime = this.currentTime + 1;
            this.currentTime = Math.min(newTime, this.lastBlockchainTime);
          }
        } else {
          const newTime = Math.max(calculatedBlockchainTime, this.currentTime + 1);
          this.currentTime = newTime;
        }
      } else {
        const newTime = Math.max(calculatedBlockchainTime, this.currentTime + 1);
        this.currentTime = newTime;
      }
    } else {
      this.currentTime = this.currentTime + 1;
    }
    
    this.notifySubscribers();
  }

  /**
   * Start polling
   */
  startPolling() {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.syncCount++;
      this.updateTime();

      if (this.syncCount % 5 === 0) {
        this.syncTime();
      }
    }, this.updateInterval);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Manual refresh
   */
  async refresh() {
    await this.syncTime();
  }

  async updateProvider(chainId, provider) {
    const chainChanged = this.chainId !== chainId;
    this.chainId = chainId;
    this.provider = provider;
    this.isLocalNetwork = chainId === 31337 || chainId === 1337;

    if (this.isLocalNetwork && !this.hardhatProvider) {
      try {
        this.hardhatProvider = new JsonRpcProvider("http://127.0.0.1:8545");
      } catch (err) {
      }
    }

    if (chainChanged) {
      await this.syncTime();
    }
  }

  /**
   * Subscribe to time updates
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notifySubscribers() {
    this.storeTime();
    
    this.subscribers.forEach((callback) => {
      try {
        callback({
          currentTime: this.currentTime,
          timeSource: this.timeSource,
        });
      } catch (err) {
        console.warn("Time subscriber error:", err);
      }
    });
  }
  getTime() {
    return this.currentTime;
  }

  getTimeSource() {
    return this.timeSource;
  }
}

let timeServiceInstance = null;

export const getTimeService = () => {
  if (!timeServiceInstance) {
    timeServiceInstance = new TimeService();
  }
  return timeServiceInstance;
};

export default getTimeService;

