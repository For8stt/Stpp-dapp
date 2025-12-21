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
const MAX_STORED_TIME_AGE = 300; // 5 minutes - don't use stored time if it's older than this

class TimeService {
  constructor() {
    const storedData = this.getStoredTime();
    const systemTime = Math.floor(Date.now() / 1000);
    
    if (storedData && storedData.time && storedData.timestamp) {
      const timeSinceStored = systemTime - storedData.timestamp;
      if (timeSinceStored >= 0 && timeSinceStored < MAX_STORED_TIME_AGE) {
        const restoredTime = storedData.time + timeSinceStored;
        this.currentTime = restoredTime;
        console.log(`[TimeService] Restored: stored=${storedData.time}, elapsed=${timeSinceStored}s, restored=${restoredTime}`);
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
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.storeTime();
      });
    }
  }

  /**
   * Get stored time from localStorage (survives page refresh)
   * Use localStorage instead of sessionStorage because main.js clears sessionStorage on localhost
   */
  getStoredTime() {
    if (typeof window === "undefined") return null;
    try {
      const storedTimestamp = window.localStorage.getItem(STORAGE_TIMESTAMP_KEY);
      const storedTime = window.localStorage.getItem(STORAGE_KEY);
      const storedOffset = window.localStorage.getItem(STORAGE_OFFSET_KEY);
      const storedSyncTime = window.localStorage.getItem(STORAGE_SYNC_TIME_KEY);
      const storedBlockchainTime = window.localStorage.getItem("timeService:lastBlockchainTime");
      
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
   * Clear stored time from localStorage
   */
  clearStoredTime() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      window.localStorage.removeItem(STORAGE_OFFSET_KEY);
      window.localStorage.removeItem(STORAGE_SYNC_TIME_KEY);
      window.localStorage.removeItem("timeService:lastBlockchainTime");
    } catch (err) {
    }
  }

  /**
   * Store current time in localStorage for smooth continuation on page refresh
   * CRITICAL: Use localStorage instead of sessionStorage because main.js clears sessionStorage
   * Store the actual currentTime, not blockchain time, to preserve smooth continuation
   * This ensures time continues from where it was, not resetting to block timestamp
   */
  storeTime() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(this.currentTime));
      window.localStorage.setItem(STORAGE_TIMESTAMP_KEY, String(Date.now()));
      window.localStorage.setItem(STORAGE_OFFSET_KEY, String(this.blockchainTimeOffset));
      if (this.lastSyncTime !== null) {
        window.localStorage.setItem(STORAGE_SYNC_TIME_KEY, String(this.lastSyncTime));
      }
      if (this.lastBlockchainTime !== null) {
        window.localStorage.setItem("timeService:lastBlockchainTime", String(this.lastBlockchainTime));
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
      await this.initialSync();
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
    const previousTime = this.currentTime;

    if (activeProvider) {
      try {
        const block = await activeProvider.getBlock("latest");
        if (block?.timestamp) {
          const blockchainTime = Number(block.timestamp);
          const TIME_DIFF_THRESHOLD = 300; // 5 minutes
          if (previousTime > blockchainTime && (previousTime - blockchainTime) > TIME_DIFF_THRESHOLD) {
            console.log(`[TimeService] initialSync: Detected blockchain restart (previous=${previousTime}, block=${blockchainTime}, diff=${previousTime - blockchainTime}s). Resetting to blockchain time.`);
            this.currentTime = blockchainTime;
            this.clearStoredTime(); // Clear stale storage
          } else {
            const newTime = Math.max(previousTime, blockchainTime);
            if (newTime !== this.currentTime) {
              this.currentTime = newTime;
              console.log(`[TimeService] initialSync: previous=${previousTime}, block=${blockchainTime}, using=${newTime} (${newTime > previousTime ? 'advanced' : 'preserved'})`);
            }
          }
          
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
          const TIME_DIFF_THRESHOLD = 300; // 5 minutes
          if (previousTime > blockchainTime && (previousTime - blockchainTime) > TIME_DIFF_THRESHOLD) {
            console.log(`[TimeService] initialSync (fallback): Detected blockchain restart (previous=${previousTime}, block=${blockchainTime}, diff=${previousTime - blockchainTime}s). Resetting to blockchain time.`);
            this.currentTime = blockchainTime;
            this.clearStoredTime(); // Clear stale storage
          } else {
            const newTime = Math.max(previousTime, blockchainTime);
            
            if (newTime !== this.currentTime) {
              this.currentTime = newTime;
              console.log(`[TimeService] initialSync (fallback): previous=${previousTime}, block=${blockchainTime}, using=${newTime} (${newTime > previousTime ? 'advanced' : 'preserved'})`);
            }
          }
          
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

    const newTime = Math.max(previousTime, systemTime);
    if (newTime !== this.currentTime) {
      this.currentTime = newTime;
    }
    this.blockchainTimeOffset = 0;
    this.timeSource = TIME_SOURCE.LOCAL;
    this.storeTime();
    this.notifySubscribers();
  }

  /**
   * Sync time from blockchain
   * Updates currentTime to match blockchain time when syncing
   * CRITICAL: Always use max to ensure time never goes backward
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
            const newTime = Math.max(previousTime, blockchainTime);
            this.currentTime = newTime;
            this.blockchainTimeOffset = blockchainTime - systemTime;
            this.lastSyncTime = systemTime;
            this.timeSource = TIME_SOURCE.CHAIN;
            this.authoritativeTimeSource = TIME_SOURCE.CHAIN;
            this.lastBlockchainTime = blockchainTime;
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
            const newTime = Math.max(previousTime, blockchainTime);
            this.currentTime = newTime;
            this.blockchainTimeOffset = blockchainTime - systemTime;
            this.lastSyncTime = systemTime;
            this.timeSource = TIME_SOURCE.CHAIN;
            this.authoritativeTimeSource = TIME_SOURCE.CHAIN;
            this.lastBlockchainTime = blockchainTime;
            this.storeTime();
            this.notifySubscribers();
            
            return;
          }
        } catch (err) {
        }
      }

      this.currentTime = Math.max(previousTime, systemTime);
      this.blockchainTimeOffset = 0;
      this.timeSource = TIME_SOURCE.LOCAL;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Update time using system clock (smooth ticking)
   * Uses blockchain offset when available to ensure accuracy
   * CRITICAL: Don't cap time based on lastBlockchainTime - it might be stale
   * Allow time to advance smoothly, periodic syncs will correct any drift
   */
  updateTime() {
    const systemTime = Math.floor(Date.now() / 1000);
    if (this.timeSource === TIME_SOURCE.CHAIN && this.blockchainTimeOffset !== null && this.lastSyncTime !== null) {
      const calculatedBlockchainTime = systemTime + this.blockchainTimeOffset;
      const newTime = Math.max(calculatedBlockchainTime, this.currentTime + 1);
      this.currentTime = newTime;
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

