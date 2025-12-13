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
    // Try to restore last known time from sessionStorage to prevent rollback on page refresh
    // Use sessionStorage instead of localStorage so time doesn't persist between app restarts
    const storedTime = this.getStoredTime();
    const systemTime = Math.floor(Date.now() / 1000);
    
    // Use stored time if it's recent (within 1 minute), otherwise use system time
    // This ensures time persists across page refreshes but not across app restarts
    if (storedTime && (systemTime - storedTime) < MAX_STORED_TIME_AGE) {
      this.currentTime = storedTime;
    } else {
      this.currentTime = systemTime;
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
      // Check if we have a stored timestamp - if it's too old, ignore stored time
      const storedTimestamp = window.sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);
      if (storedTimestamp) {
        const timestamp = parseInt(storedTimestamp, 10);
        const now = Date.now();
        // If stored timestamp is older than 5 minutes, it's from a previous session - ignore it
        if (now - timestamp > 5 * 60 * 1000) {
          // Clear old storage
          window.sessionStorage.removeItem(STORAGE_KEY);
          window.sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
          return null;
        }
      }
      
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const time = parseInt(stored, 10);
        if (!isNaN(time) && time > 0) {
          return time;
        }
      }
    } catch (err) {
      // sessionStorage might not be available
    }
    return null;
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
      // sessionStorage might not be available or full
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
          // Only update time if blockchain time is ahead - never roll back
          // This prevents time from going backward after page refresh
          if (blockchainTime >= previousTime) {
            this.currentTime = blockchainTime;
          }
          // Always update offset and tracking, even if time didn't change
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

    // Fallback: try ensureProvider
    if (!activeProvider) {
      try {
        const fallbackProvider = ensureProvider();
        const block = await fallbackProvider.getBlock("latest");
        if (block?.timestamp) {
          const blockchainTime = Number(block.timestamp);
          // Only update time if blockchain time is ahead - never roll back
          // This prevents time from going backward after page refresh
          if (blockchainTime >= previousTime) {
            this.currentTime = blockchainTime;
          }
          // Always update offset and tracking, even if time didn't change
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime;
          this.timeSource = TIME_SOURCE.CHAIN;
          this.notifySubscribers();
          return;
        }
      } catch (err) {
        // Fall through
      }
    }

    // No blockchain sync available - use system time (but don't go backward)
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
            
            // Calculate offset between blockchain and system time
            this.blockchainTimeOffset = blockchainTime - systemTime;
            this.lastSyncTime = systemTime;
            this.timeSource = TIME_SOURCE.CHAIN;
            this.authoritativeTimeSource = TIME_SOURCE.CHAIN;
            
            // Always update currentTime to blockchain time when syncing
            // This ensures time stays in sync after fast-forward
            // Only move forward, never backward
            this.lastBlockchainTime = blockchainTime; // Track last known blockchain time
            if (blockchainTime >= previousTime) {
              this.currentTime = blockchainTime;
              // Store time immediately after important update (e.g., after fast-forward)
              this.storeTime();
              this.notifySubscribers();
            }
            // If blockchain time is behind (shouldn't happen, but be safe),
            // keep currentTime but update offset for future calculations
            
            return;
          }
        } catch (err) {
          // Fall through to system time
        }
      }

      // Fallback: try ensureProvider
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
            
            // Always update currentTime to blockchain time when syncing
            this.lastBlockchainTime = blockchainTime; // Track last known blockchain time
            if (blockchainTime >= previousTime) {
              this.currentTime = blockchainTime;
              // Store time immediately after important update (e.g., after fast-forward)
              this.storeTime();
              this.notifySubscribers();
            }
            
            return;
          }
        } catch (err) {
          // Fall through
        }
      }

      // No blockchain sync available - use system time
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
    
    // If we have a blockchain offset, use it to calculate accurate time
    if (this.timeSource === TIME_SOURCE.CHAIN && this.blockchainTimeOffset !== null && this.lastSyncTime !== null) {
      // Calculate time based on blockchain offset: blockchainTime = systemTime + offset
      const calculatedBlockchainTime = systemTime + this.blockchainTimeOffset;
      
      // If we have a last known blockchain time, use it to cap the maximum time
      // This prevents time from advancing beyond blockchain when blocks aren't being mined
      if (this.lastBlockchainTime !== null) {
        // If calculated blockchain time equals or is less than last known, blockchain isn't advancing
        if (calculatedBlockchainTime <= this.lastBlockchainTime) {
          // Blockchain isn't advancing
          // If currentTime is already ahead of lastBlockchainTime, allow it to continue ticking forward
          // This prevents time from rolling back when syncTime() gets old blockchain time
          if (this.currentTime >= this.lastBlockchainTime) {
            // We're ahead of blockchain time - allow smooth ticking forward
            this.currentTime = this.currentTime + 1;
          } else {
            // We're behind or at lastBlockchainTime - normal ticking up to the limit
            const newTime = this.currentTime + 1;
            this.currentTime = Math.min(newTime, this.lastBlockchainTime);
          }
        } else {
          // Blockchain is advancing, use calculated time
          const newTime = Math.max(calculatedBlockchainTime, this.currentTime + 1);
          this.currentTime = newTime;
        }
      } else {
        // No last known blockchain time yet, use calculated time
        const newTime = Math.max(calculatedBlockchainTime, this.currentTime + 1);
        this.currentTime = newTime;
      }
    } else {
      // No blockchain sync - just increment by 1 second
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
      
      // Update time every interval (smooth ticking)
      this.updateTime();

      // Sync with blockchain periodically
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
        // Silently fail
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
    // Store time in localStorage whenever it updates
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

