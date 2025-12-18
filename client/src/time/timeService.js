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
const MAX_STORED_TIME_AGE = 60; // 1 minute - don't use stored time if it's older than this (only for page refresh, not new session)

class TimeService {
  constructor() {
    const storedTime = this.getStoredTime();
    const systemTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(systemTime - storedTime);
    if (storedTime && timeDiff < MAX_STORED_TIME_AGE) {
      this.currentTime = storedTime;
    } else {
      this.currentTime = systemTime;
      if (storedTime && timeDiff >= MAX_STORED_TIME_AGE) {
        this.clearStoredTime();
      }
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
    this.blockchainTimeOffset = 0; // Offset between blockchain and system time
    this.lastSyncTime = null; // Last time we synced with blockchain
    this.syncInProgress = false; // Guard to prevent concurrent sync calls
    this.lastBlockchainTime = null; // Last known blockchain time (to prevent time from advancing beyond blockchain)
  }

  /**
   * Get stored time from sessionStorage (not localStorage to avoid persisting across app restarts)
   */
  getStoredTime() {
    if (typeof window === "undefined") return null;
    try {
      const storedTimestamp = window.sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);
      if (storedTimestamp) {
        const timestamp = parseInt(storedTimestamp, 10);
        const now = Date.now();
        if (now - timestamp > 5 * 60 * 1000) {
          this.clearStoredTime();
          return null;
        }
      }
      
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const time = parseInt(stored, 10);
        if (!isNaN(time) && time > 0) {
          const systemTime = Math.floor(Date.now() / 1000);
          const timeDiff = Math.abs(systemTime - time);
          if (timeDiff > 86400) { // More than 1 day difference - invalid
            this.clearStoredTime();
            return null;
          }
          return time;
        }
      }
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
          if (blockchainTime >= previousTime) {
            this.currentTime = blockchainTime;
          }
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime;
          this.timeSource = TIME_SOURCE.CHAIN;
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
          if (blockchainTime >= previousTime) {
            this.currentTime = blockchainTime;
          }
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime;
          this.timeSource = TIME_SOURCE.CHAIN;
          this.notifySubscribers();
          return;
        }
      } catch (err) {
      }
    }

    if (systemTime >= previousTime) {
      this.currentTime = systemTime;
    }
    this.blockchainTimeOffset = 0;
    this.timeSource = TIME_SOURCE.LOCAL;
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
            if (blockchainTime >= previousTime) {
              this.currentTime = blockchainTime;
              this.storeTime();
              this.notifySubscribers();
            }

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
            if (blockchainTime >= previousTime) {
              this.currentTime = blockchainTime;
              this.storeTime();
              this.notifySubscribers();
            }
            
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

