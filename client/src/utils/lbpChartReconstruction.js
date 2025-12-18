import { ethers } from "ethers";

/**
 * Calculate weight at a given timestamp using linear interpolation
 * @param {number} timestamp - Current timestamp
 * @param {number} startTime - Auction start time
 * @param {number} endTime - Auction end time
 * @param {bigint} startWeightToken - Starting token weight (in 1e18)
 * @param {bigint} endWeightToken - Ending token weight (in 1e18)
 * @returns {{tokenWeight: bigint, ethWeight: bigint}} - Current weights
 */
export function calculateWeightAtTime(timestamp, startTime, endTime, startWeightToken, endWeightToken) {
  const SCALE = 1e18;
  
  if (timestamp <= startTime) {
    return {
      tokenWeight: startWeightToken,
      ethWeight: BigInt(SCALE) - startWeightToken,
    };
  }
  
  if (timestamp >= endTime) {
    return {
      tokenWeight: endWeightToken,
      ethWeight: BigInt(SCALE) - endWeightToken,
    };
  }
  
  const elapsed = BigInt(timestamp - startTime);
  const duration = BigInt(endTime - startTime);
  
  const weightDiff = startWeightToken > endWeightToken
    ? startWeightToken - endWeightToken
    : endWeightToken - startWeightToken;
  
  const isDecreasing = startWeightToken > endWeightToken;
  
  const change = (weightDiff * elapsed) / duration;
  const tokenWeight = isDecreasing
    ? startWeightToken - change
    : startWeightToken + change;
  
  return {
    tokenWeight,
    ethWeight: BigInt(SCALE) - tokenWeight,
  };
}

/**
 * Calculate price from reserves and weights
 * Formula: price = (reserveETH * weightToken) / (reserveToken * weightETH)
 * @param {bigint} reserveETH - ETH reserve
 * @param {bigint} reserveToken - Token reserve
 * @param {bigint} weightToken - Token weight (in 1e18)
 * @param {bigint} weightETH - ETH weight (in 1e18)
 * @param {number} tokenDecimals - Token decimals
 * @returns {number} - Price in ETH per token
 */
export function calculatePriceFromReserves(reserveETH, reserveToken, weightToken, weightETH, tokenDecimals = 18) {
  if (reserveToken === 0n || reserveETH === 0n || weightToken === 0n || weightETH === 0n) {
    return 0;
  }
  
  try {
    const reserveETHNum = Number(ethers.formatEther(reserveETH));
    const reserveTokenNum = Number(ethers.formatUnits(reserveToken, tokenDecimals));
    const weightTokenNum = Number(ethers.formatEther(weightToken));
    const weightETHNum = Number(ethers.formatEther(weightETH));
    
    if (reserveTokenNum > 0 && weightETHNum > 0 && weightTokenNum > 0) {
      return (reserveETHNum * weightTokenNum) / (reserveTokenNum * weightETHNum);
    }
  } catch (err) {
    console.warn("Error calculating price:", err);
  }
  
  return 0;
}

/**
 * Reconstruct chart data deterministically from auction configuration and swap events
 * @param {Object} params - Reconstruction parameters
 * @param {number} params.startTime - Auction start time
 * @param {number} params.endTime - Auction end time
 * @param {bigint} params.startWeightToken - Starting token weight
 * @param {bigint} params.endWeightToken - Ending token weight
 * @param {bigint} params.initialReserveETH - Initial ETH reserve
 * @param {bigint} params.initialReserveToken - Initial token reserve
 * @param {number} params.currentTime - Current timestamp
 * @param {Array} params.swapEvents - Array of swap events sorted by timestamp
 * @param {number} params.tokenDecimals - Token decimals (default 18)
 * @param {number} params.points - Number of points to generate (default 200)
 * @returns {Array} - Chart data array with {timestamp, price, time, timeFormatted, timeElapsed}
 */
export function reconstructChartData({
  startTime,
  endTime,
  startWeightToken,
  endWeightToken,
  initialReserveETH,
  initialReserveToken,
  currentTime,
  swapEvents = [],
  tokenDecimals = 18,
  points = 200,
}) {
  if (!startTime || !endTime || startTime >= endTime) {
    return [];
  }
  
  // Determine the time range to generate points for
  // Always show from startTime to currentTime (or endTime if ended)
  // Ensure currentTime is within valid range
  const clampedCurrentTime = Math.max(startTime, Math.min(currentTime, endTime));
  const timeEnd = Math.min(clampedCurrentTime, endTime);
  const timeStart = startTime;
  const duration = timeEnd - timeStart;
  
  if (duration <= 0 || timeStart >= timeEnd) {
    // If auction hasn't started yet, return empty array
    // If duration is invalid, return empty array
    return [];
  }
  
  // Sort swap events by timestamp
  const sortedEvents = [...swapEvents].sort((a, b) => {
    const timeA = a.timestamp || a.blockTimestamp || 0;
    const timeB = b.timestamp || b.blockTimestamp || 0;
    return timeA - timeB;
  });
  
  // Create a map of reserves at each event timestamp
  const reservesAtTime = new Map();
  let currentReserveETH = initialReserveETH;
  let currentReserveToken = initialReserveToken;
  
  // Process swap events to build reserve history
  for (const event of sortedEvents) {
    const eventTime = event.timestamp || event.blockTimestamp || 0;
    if (eventTime < startTime || eventTime > timeEnd) {
      continue;
    }
    
    // Apply swap event to reserves
    // SwapETHForToken: ETH increases, Token decreases
    // SwapTokenForETH: Token increases, ETH decreases
    if (event.eventName === "SwapETHForToken" || event.name === "SwapETHForToken") {
      const ethIn = event.args?.ethIn || event.ethIn || 0n;
      const tokenOut = event.args?.tokenOut || event.tokenOut || 0n;
      currentReserveETH += ethIn;
      currentReserveToken -= tokenOut;
    } else if (event.eventName === "SwapTokenForETH" || event.name === "SwapTokenForETH") {
      const tokenIn = event.args?.tokenIn || event.tokenIn || 0n;
      const ethOut = event.args?.ethOut || event.ethOut || 0n;
      currentReserveToken += tokenIn;
      currentReserveETH -= ethOut;
    }
    
    // Store reserves at this event time
    reservesAtTime.set(eventTime, {
      reserveETH: currentReserveETH,
      reserveToken: currentReserveToken,
    });
  }
  
  // Generate chart points
  const chartData = [];
  
  // Collect all important timestamps: start, end, swap events, and regular intervals
  const importantTimestamps = new Set();
  importantTimestamps.add(timeStart);
  importantTimestamps.add(timeEnd);
  
  // Add all swap event timestamps
  for (const eventTime of reservesAtTime.keys()) {
    importantTimestamps.add(eventTime);
  }
  
  // Add regular interval points
  const timeStep = duration / points;
  for (let i = 0; i <= points; i++) {
    const timestamp = Math.floor(timeStart + (i * timeStep));
    if (timestamp <= timeEnd) {
      importantTimestamps.add(timestamp);
    }
  }
  
  // Sort all timestamps
  const sortedTimestamps = Array.from(importantTimestamps).sort((a, b) => a - b);
  
  // Ensure we always have start point
  if (sortedTimestamps.length === 0 || sortedTimestamps[0] !== timeStart) {
    sortedTimestamps.unshift(timeStart);
  }
  
  // Ensure we always have end point (timeEnd, which is min(currentTime, endTime))
  // This ensures the chart always shows from start to current moment
  const lastTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
  if (lastTimestamp < timeEnd) {
    sortedTimestamps.push(timeEnd);
  }
  
  // Generate chart points for each timestamp
  for (const timestamp of sortedTimestamps) {
    // Skip if beyond current time (but include timeEnd)
    if (timestamp > timeEnd) {
      break;
    }
    
    // Calculate weight at this timestamp
    const { tokenWeight, ethWeight } = calculateWeightAtTime(
      timestamp,
      startTime,
      endTime,
      startWeightToken,
      endWeightToken
    );
    
    // Find reserves at this timestamp
    // Use the most recent swap event before or at this timestamp
    let reserveETH = initialReserveETH;
    let reserveToken = initialReserveToken;
    
    // Find the most recent event that happened at or before this timestamp
    let mostRecentEventTime = null;
    for (const eventTime of reservesAtTime.keys()) {
      if (eventTime <= timestamp && (mostRecentEventTime === null || eventTime > mostRecentEventTime)) {
        mostRecentEventTime = eventTime;
      }
    }
    
    if (mostRecentEventTime !== null) {
      const reserves = reservesAtTime.get(mostRecentEventTime);
      reserveETH = reserves.reserveETH;
      reserveToken = reserves.reserveToken;
    }
    
    // Calculate price
    const price = calculatePriceFromReserves(
      reserveETH,
      reserveToken,
      tokenWeight,
      ethWeight,
      tokenDecimals
    );
    
    // Check if this timestamp corresponds to a swap event (for marking purchases)
    const isSwapEvent = reservesAtTime.has(timestamp);
    
    chartData.push({
      timestamp,
      price,
      time: new Date(timestamp * 1000).toLocaleTimeString(),
      timeFormatted: new Date(timestamp * 1000).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      timeElapsed: timestamp - startTime,
      isPurchase: isSwapEvent, // Mark purchase points
    });
  }
  
  // Always add current time point to show the latest state
  // This ensures the chart extends to the current moment
  // Use the same clampedCurrentTime that was calculated above
  if (clampedCurrentTime >= timeStart && clampedCurrentTime <= timeEnd) {
    const lastPoint = chartData[chartData.length - 1];
    // Add current time point if it's different from the last point
    if (!lastPoint || lastPoint.timestamp !== clampedCurrentTime) {
      const { tokenWeight, ethWeight } = calculateWeightAtTime(
        clampedCurrentTime,
        startTime,
        endTime,
        startWeightToken,
        endWeightToken
      );
      
      // Use current reserves (from the most recent event or initial)
      let reserveETH = initialReserveETH;
      let reserveToken = initialReserveToken;
      
      // Find the most recent event that happened at or before clampedCurrentTime
      let mostRecentEventTime = null;
      for (const eventTime of reservesAtTime.keys()) {
        if (eventTime <= clampedCurrentTime && (mostRecentEventTime === null || eventTime > mostRecentEventTime)) {
          mostRecentEventTime = eventTime;
        }
      }
      
      if (mostRecentEventTime !== null) {
        const reserves = reservesAtTime.get(mostRecentEventTime);
        reserveETH = reserves.reserveETH;
        reserveToken = reserves.reserveToken;
      }
      
      const price = calculatePriceFromReserves(
        reserveETH,
        reserveToken,
        tokenWeight,
        ethWeight,
        tokenDecimals
      );
      
      chartData.push({
        timestamp: clampedCurrentTime,
        price,
        time: new Date(clampedCurrentTime * 1000).toLocaleTimeString(),
        timeFormatted: new Date(clampedCurrentTime * 1000).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        timeElapsed: clampedCurrentTime - startTime,
      });
    }
  }
  
  // Sort by timestamp and remove duplicates
  const sorted = chartData.sort((a, b) => a.timestamp - b.timestamp);
  const deduplicated = sorted.reduce((acc, point) => {
    if (acc.length === 0 || acc[acc.length - 1].timestamp !== point.timestamp) {
      acc.push(point);
    }
    return acc;
  }, []);
  
  return deduplicated;
}
