import { ethers } from "ethers";

/**
 * Format token amount with decimals
 */
export const formatToken = (amount, decimals = 18) => {
  if (!amount || amount === 0n) return "0";
  try {
    return ethers.formatUnits(amount, decimals);
  } catch {
    return "0";
  }
};

/**
 * Format token amount with rounding to 3 decimal places
 */
export const formatTokenRounded = (amount, decimals = 18) => {
  if (!amount || amount === 0n) return "0";
  try {
    const formatted = formatToken(amount, decimals);
    const num = parseFloat(formatted);
    if (isNaN(num)) return "0";
    // Round to 3 decimal places
    const rounded = Math.round(num * 1000) / 1000;
    // Format to show up to 3 decimal places, removing trailing zeros
    return rounded.toFixed(3).replace(/\.?0+$/, '');
  } catch {
    return "0";
  }
};

/**
 * Format time remaining
 */
export const formatTimeRemaining = (seconds) => {
  if (seconds <= 0) return "Unlocked";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

/**
 * Calculate vesting curve data points
 */
export const calculateVestingCurveData = (vestingData, currentTime, formatTokenFn) => {
  if (!vestingData || !vestingData.vestingConfigured) {
    return [];
  }

  const {
    vestingStart,
    vestingCliffDuration,
    vestingFinalDuration,
    vestingCliffPercentBP,
    userAllocation,
    tokenDecimals,
  } = vestingData;

  if (!userAllocation || userAllocation === 0n) {
    return [];
  }

  const cliffTime = vestingStart + vestingCliffDuration;
  const finalTime = vestingStart + vestingFinalDuration;
  const now = currentTime;

  const dataPoints = [];
  const startTime = Math.min(vestingStart, now);
  const endTime = Math.max(finalTime, now);
  const duration = endTime - startTime;
  const numPoints = 100;

  for (let i = 0; i <= numPoints; i++) {
    const timestamp = startTime + (duration * i) / numPoints;
    let vestedAmount = 0n;

    if (timestamp < cliffTime) {
      vestedAmount = 0n;
    } else if (timestamp >= finalTime || vestingFinalDuration === 0) {
      vestedAmount = userAllocation;
    } else {
      const cliffAmount = (userAllocation * BigInt(vestingCliffPercentBP)) / 10000n;
      const remainingAmount = userAllocation - cliffAmount;
      const vestingPeriod = finalTime - cliffTime;
      const elapsed = timestamp - cliffTime;
      
      if (vestingPeriod > 0) {
        const elapsedInt = Math.floor(elapsed);
        const vestingPeriodInt = Math.floor(vestingPeriod);
        if (vestingPeriodInt > 0) {
          const linearAmount = (remainingAmount * BigInt(elapsedInt)) / BigInt(vestingPeriodInt);
          vestedAmount = cliffAmount + linearAmount;
        } else {
          vestedAmount = cliffAmount;
        }
      } else {
        vestedAmount = cliffAmount;
      }
    }

    dataPoints.push({
      timestamp,
      time: new Date(timestamp * 1000).toISOString(),
      vested: Number(vestedAmount),
      vestedFormatted: formatTokenFn(vestedAmount, tokenDecimals),
      percent: userAllocation > 0n
        ? Number((vestedAmount * 10000n) / userAllocation) / 100
        : 0,
    });
  }

  return dataPoints;
};

