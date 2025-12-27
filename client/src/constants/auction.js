/**
 * Auction-related constants
 */

export const REFRESH_INTERVAL_MS = 30000; // 30 seconds

/**
 * @deprecated TIME_UPDATE_INTERVAL_MS is no longer used.
 * Time updates are now handled by the unified TimeService via useTime hook.
 * This constant is kept for backward compatibility but should not be used in new code.
 */
export const TIME_UPDATE_INTERVAL_MS = 1000; // 1 second

export const PHASES = {
  NOT_STARTED: "NotStarted",
  COMMIT: "Commit",
  REVEAL: "Reveal",
  FINALIZED: "Finalized",
};

export const DEFAULT_LBP_CONFIG = {
  startTime: Math.floor(Date.now() / 1000) + 3600,
  endTime: Math.floor(Date.now() / 1000) + 86400,
  poolStartWeightToken: "0.8",
  poolEndWeightToken: "0.2",
  poolSwapFee: "0.003",
  maxContributionPerAddress: "0", // 0 means use default (5 ETH)
  vestingStartTime: Math.floor(Date.now() / 1000) + 3600,
  vestingCliffDuration: 0,
  vestingFinalDuration: 2592000, // 30 days for LBP (30 * 24 * 60 * 60 = 2592000 seconds)
  vestingCliffPercentBP: 0,
};

