import { JsonRpcProvider } from "ethers";
import { ensureProvider } from "../services/web3/provider";

/**
 * Time source types
 */
export const TIME_SOURCE = {
  CHAIN: "chain",
  LOCAL: "local",
};

class TimeService {
  constructor() {
    this.currentTime = Math.floor(Date.now() / 1000);
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

    if (activeProvider) {
      try {
        const block = await activeProvider.getBlock("latest");
        if (block?.timestamp) {
          const blockchainTime = Number(block.timestamp);
          this.currentTime = blockchainTime;
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime; // Track last known blockchain time
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
          this.currentTime = blockchainTime;
          this.blockchainTimeOffset = blockchainTime - systemTime;
          this.lastSyncTime = systemTime;
          this.lastBlockchainTime = blockchainTime; // Track last known blockchain time
          this.timeSource = TIME_SOURCE.CHAIN;
          this.notifySubscribers();
          return;
        }
      } catch (err) {
        // Fall through
      }
    }

    // No blockchain sync available - use system time
    this.currentTime = systemTime;
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
          // Blockchain isn't advancing - don't let time go beyond last known blockchain time
          // But still allow smooth ticking up to the last known blockchain time
          const newTime = this.currentTime + 1;
          // Never exceed last known blockchain time
          if (newTime > this.lastBlockchainTime) {
            this.currentTime = this.lastBlockchainTime;
          } else {
            this.currentTime = newTime;
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

