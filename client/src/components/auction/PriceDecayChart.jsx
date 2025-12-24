/* eslint-env es2020 */
import React, { useMemo } from "react";
import { ethers } from "ethers";

const formatEth = (value) => {
  if (!value || value === 0n) return "0";
  try {
    return ethers.formatEther(value);
  } catch {
    return "0";
  }
};

const formatTime = (timestamp) => {
  if (!timestamp || timestamp === 0) return "—";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (timestamp) => {
  if (!timestamp || timestamp === 0) return "—";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatDateTime = (timestamp) => {
  if (!timestamp || timestamp === 0) return "—";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString("en-US", { 
    month: "short", 
    day: "numeric", 
    hour: "2-digit", 
    minute: "2-digit" 
  });
};

const PriceDecayChart = ({ 
  priceTicks, 
  startTime, 
  commitEndTime, 
  revealEndTime, 
  currentTime,
  finalized,
  clearingPrice,
  totalDepositCommitted,
  totalDepositsRevealed,
  softCap,
  phase,
  initialCommitEndTime,
  demandCheckTime,
  earlyBonusWindow,
  earlyBonusPct
}) => {
  const startPrice = useMemo(() => {
    return priceTicks && priceTicks.length > 0 ? Number(priceTicks[0]) : 0;
  }, [priceTicks]);

  const endPrice = useMemo(() => {
    return priceTicks && priceTicks.length > 0 ? Number(priceTicks[priceTicks.length - 1]) : 0;
  }, [priceTicks]);

  const priceRange = useMemo(() => {
    return startPrice - endPrice;
  }, [startPrice, endPrice]);

  const timeRange = useMemo(() => {
    return revealEndTime - startTime;
  }, [revealEndTime, startTime]);

  const isShortened = useMemo(() => {
    if (!initialCommitEndTime || initialCommitEndTime === 0) return false;
    return commitEndTime < initialCommitEndTime;
  }, [commitEndTime, initialCommitEndTime]);

  const originalRevealEndTime = useMemo(() => {
    if (!isShortened || !initialCommitEndTime) return revealEndTime;
    const revealDuration = revealEndTime - commitEndTime;
    return initialCommitEndTime + revealDuration;
  }, [isShortened, initialCommitEndTime, revealEndTime, commitEndTime]);

  const originalTimeRange = useMemo(() => {
    if (!isShortened || !originalRevealEndTime) return timeRange;
    return originalRevealEndTime - startTime;
  }, [isShortened, originalRevealEndTime, startTime, timeRange]);
  const { currentPrice, currentProgress } = useMemo(() => {
    if (!startPrice || !endPrice || !timeRange) {
      return { currentPrice: 0, currentProgress: 0 };
    }
    let price = startPrice;
    let progress = 0;
    if (currentTime >= startTime && currentTime <= revealEndTime) {
      progress = (currentTime - startTime) / timeRange;
      price = startPrice - (priceRange * progress);
    } else if (currentTime > revealEndTime) {
      price = endPrice;
      progress = 1;
    }
    return { currentPrice: price, currentProgress: progress };
  }, [currentTime, startTime, revealEndTime, timeRange, startPrice, priceRange, endPrice]);
  const softCapProgress = useMemo(() => {
    const depositsToCheck = totalDepositsRevealed !== undefined ? totalDepositsRevealed : totalDepositCommitted;
    return softCap > 0n ? Math.min(Number(depositsToCheck) / Number(softCap), 1) : 0;
  }, [softCap, totalDepositsRevealed, totalDepositCommitted]);

  const timeRemaining = useMemo(() => {
    if (currentTime >= revealEndTime) return null;
    const remaining = revealEndTime - currentTime;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return { hours, minutes, seconds };
  }, [currentTime, revealEndTime]);

  const priceChangePercent = useMemo(() => {
    if (!startPrice || currentTime < startTime) return 0;
    return ((startPrice - currentPrice) / startPrice) * 100;
  }, [currentPrice, startPrice, currentTime, startTime]);
  const points = useMemo(() => {
    if (!startPrice || !priceRange || !timeRange) return [];
    const pts = [];
    const numPoints = 300; // More points for smoother curve
    const svgWidth = 1200;
    const svgHeight = 400;
    const paddingTop = 40;
    const paddingBottom = 60;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    const paddingLeft = 50;
    const chartWidth = svgWidth - paddingLeft - 50;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      
      if (isShortened && originalTimeRange) {
        const time = startTime + (t * timeRange); // Actual time in shortened timeline
        const timeProgressInShortened = (time - startTime) / timeRange;
        const price = startPrice - (priceRange * timeProgressInShortened);
        const timeProgressOnOriginal = (time - startTime) / originalTimeRange;
        const x = paddingLeft + (timeProgressOnOriginal * chartWidth);
        const yPercent = priceRange > 0 ? ((price - endPrice) / priceRange) : 0;
        const y = paddingTop + (chartHeight * (1 - yPercent));
        
        pts.push(`${x},${y}`);
      } else {
        const time = startTime + (t * timeRange);
        const price = startPrice - (priceRange * t);
        const x = paddingLeft + (t * chartWidth);
        const yPercent = priceRange > 0 ? ((price - endPrice) / priceRange) : 0;
        const y = paddingTop + (chartHeight * (1 - yPercent));
        
        pts.push(`${x},${y}`);
      }
    }
    return pts;
  }, [startPrice, endPrice, priceRange, timeRange, startTime, isShortened, originalTimeRange]);

  const originalPoints = useMemo(() => {
    if (!isShortened || !startPrice || !priceRange || !originalTimeRange) return [];
    const pts = [];
    const numPoints = 300;
    const svgWidth = 1200;
    const svgHeight = 400;
    const paddingTop = 40;
    const paddingBottom = 60;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const time = startTime + (t * originalTimeRange);
      const price = startPrice - (priceRange * t);
      const x = (t * (svgWidth - 100)) + 50;
      const yPercent = priceRange > 0 ? ((price - endPrice) / priceRange) : 0;
      const y = paddingTop + (chartHeight * (1 - yPercent));
      
      pts.push(`${x},${y}`);
    }
    return pts;
  }, [isShortened, startPrice, endPrice, priceRange, originalTimeRange, startTime]);

  const tickMarkers = useMemo(() => {
    if (!priceTicks || priceTicks.length === 0 || !startPrice || !priceRange) return [];
    return priceTicks.map((tick, idx) => {
      const price = Number(tick);
      const y = priceRange > 0 ? ((startPrice - price) / priceRange * 100) : (100 - (idx / (priceTicks.length - 1)) * 100);
      return { idx, price, y };
    });
  }, [priceTicks, startPrice, priceRange]);

  const phaseProgress = useMemo(() => {
    if (!startTime || !commitEndTime || !revealEndTime) return 0;
    if (phase === "Commit") {
      return Math.min((currentTime - startTime) / (commitEndTime - startTime), 1);
    } else if (phase === "Reveal") {
      return Math.min((currentTime - commitEndTime) / (revealEndTime - commitEndTime), 1);
    }
    return 0;
  }, [phase, currentTime, startTime, commitEndTime, revealEndTime]);

  const commitEndPrice = useMemo(() => {
    if (!startPrice || !priceRange || !timeRange) return 0;
    const commitEndProgress = (commitEndTime - startTime) / timeRange;
    return startPrice - (priceRange * commitEndProgress);
  }, [commitEndTime, startTime, timeRange, startPrice, priceRange]);

  const revealEndPrice = useMemo(() => {
    if (!startPrice || !priceRange || !timeRange) return 0;
    const revealEndProgress = (revealEndTime - startTime) / timeRange;
    return startPrice - (priceRange * revealEndProgress);
  }, [revealEndTime, startTime, timeRange, startPrice, priceRange]);

  const phaseClass = phase?.toLowerCase() || "notstarted";

  if (!priceTicks || priceTicks.length === 0) return null;

  const phaseDotColors = {
    commit: "bg-[rgb(96,165,250)] animate-pulse",
    reveal: "bg-[rgb(196,181,253)] animate-pulse",
    finalized: "bg-[rgb(52,211,153)]",
    notstarted: "bg-[rgb(148,163,184)]"
  };

  return (
    <div className="mb-8 animate-fadeIn rounded-2xl border border-[rgba(255,255,255,0.1)] bg-gradient-to-br from-[rgba(15,23,42,0.7)] to-[rgba(30,41,59,0.7)] p-6 backdrop-blur-[10px] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2)]">

      {/* Adjustment Alert Banner */}
      {isShortened && (
        <div className="mb-6 animate-fadeIn rounded-xl border-2 border-[rgba(245,158,11,0.4)] bg-gradient-to-br from-[rgba(245,158,11,0.15)] to-[rgba(217,119,6,0.15)] p-4 shadow-[0_10px_15px_-3px_rgba(245,158,11,0.2)]">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-[rgb(251,191,36)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="mb-2 text-base font-bold text-[rgb(251,191,36)]">
                Low participation detected. The auction timeline has been shortened.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-[rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-2">
                  <span className="line-through text-[rgba(255,255,255,0.5)]">
                    Original commit end: {formatDateTime(initialCommitEndTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[rgb(251,191,36)]">
                    New commit end: {formatDateTime(commitEndTime)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="mb-1 text-xl font-bold text-white">Price Decay & Market Status</h2>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${phaseDotColors[phaseClass] || phaseDotColors.notstarted}`} />
            <p className="text-sm text-[rgba(255,255,255,0.7)]">
              {phase === "Commit" && `Commit Phase - Price decreasing (${priceChangePercent.toFixed(2)}% down)`}
              {phase === "Reveal" && "Reveal Phase - Price locked"}
              {phase === "Finalized" && "Auction Finalized"}
              {phase === "NotStarted" && "Auction not started yet"}
            </p>
            {isShortened ? (
              <span className="ml-2 rounded px-2 py-0.5 text-xs font-semibold bg-[rgba(245,158,11,0.2)] text-[rgb(251,191,36)] border border-[rgba(245,158,11,0.4)]">
                Adjusted
              </span>
            ) : initialCommitEndTime > 0 && currentTime < initialCommitEndTime && demandCheckTime > 0 && currentTime >= demandCheckTime ? (
              <span className="ml-2 rounded px-2 py-0.5 text-xs font-semibold bg-[rgba(59,130,246,0.2)] text-[rgb(147,197,253)] border border-[rgba(59,130,246,0.4)]">
                Eligible for Adjustment
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border-2 border-[rgba(59,130,246,0.3)] bg-gradient-to-br from-[rgba(59,130,246,0.2)] to-[rgba(37,99,235,0.2)] p-4 text-right shadow-[0_10px_15px_-3px_rgba(0,0,0,0.3)]">
          <p className="mb-1 text-xs uppercase tracking-wider text-[rgba(255,255,255,0.7)]">Current Price</p>
          <p className="text-2xl font-bold text-[rgb(147,197,253)]">
            {formatEth(BigInt(Math.floor(currentPrice)))} ETH
          </p>
          {timeRemaining && (
            <p className="mt-1 text-xs text-[rgba(96,165,250,0.8)]">
              {timeRemaining.hours}h {timeRemaining.minutes}m {timeRemaining.seconds}s remaining
            </p>
          )}
          {priceChangePercent > 0 && (
            <p className="mt-1 text-xs text-[rgba(96,165,250,0.8)]">
              {priceChangePercent.toFixed(2)}% below start
            </p>
          )}
        </div>
      </div>


      <div className="relative mb-4 h-96 rounded-xl border-2 border-[rgba(255,255,255,0.1)] bg-gradient-to-br from-[rgba(30,41,59,0.6)] via-[rgba(30,41,59,0.4)] to-[rgba(15,23,42,0.6)] p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
        <svg className="h-full w-full" viewBox="0 0 1200 400" preserveAspectRatio="none">
          <defs>
            <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.25" />
              <stop offset="50%" stopColor="rgb(59, 130, 246)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>


          {[0, 20, 40, 60, 80, 100].map((percent) => (
            <line
              key={`grid-y-${percent}`}
              x1="0"
              y1={`${percent}%`}
              x2="100%"
              y2={`${percent}%`}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}
          {[0, 25, 50, 75, 100].map((percent) => (
            <line
              key={`grid-x-${percent}`}
              x1={`${percent}%`}
              y1="0"
              x2={`${percent}%`}
              y2="100%"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}


          {/* Original timeline (dashed) if shortened */}
          {isShortened && originalPoints.length > 0 && (
            <>
              <polyline
                points={originalPoints.join(" ")}
                fill="none"
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth="4"
                strokeDasharray="12,8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
              />
            </>
          )}

          {/* Early Bonus Window Overlay */}
          {(() => {
            if (!earlyBonusWindow || earlyBonusWindow <= 0 || !startTime) return null;
            
            const svgWidth = 1200;
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const paddingLeft = 50;
            const chartWidth = svgWidth - paddingLeft - 50;
            const effectiveTimeRange = isShortened ? originalTimeRange : timeRange;
            const effectiveRevealEnd = isShortened ? originalRevealEndTime : revealEndTime;
            
            const earlyBonusEndTime = startTime + earlyBonusWindow;
            if (earlyBonusEndTime > effectiveRevealEnd) return null;
            
            const earlyBonusStartProgress = 0; // Always starts at auction start
            const earlyBonusEndProgress = Math.min((earlyBonusEndTime - startTime) / effectiveTimeRange, 1);
            
            const earlyBonusStartX = paddingLeft;
            const earlyBonusEndX = paddingLeft + (earlyBonusEndProgress * chartWidth);
            const earlyBonusWidth = earlyBonusEndX - earlyBonusStartX;
            
            return (
              <g key="early-bonus-window">
                {/* Semi-transparent overlay */}
                <rect
                  x={earlyBonusStartX}
                  y={paddingTop}
                  width={earlyBonusWidth}
                  height={chartHeight}
                  fill="rgb(251, 191, 36)"
                  opacity="0.15"
                />
                {/* Border */}
                <rect
                  x={earlyBonusStartX}
                  y={paddingTop}
                  width={earlyBonusWidth}
                  height={chartHeight}
                  fill="none"
                  stroke="rgb(251, 191, 36)"
                  strokeWidth="2"
                  strokeDasharray="8,4"
                  opacity="0.6"
                />
                {/* Label */}
                <text
                  x={earlyBonusStartX + earlyBonusWidth / 2}
                  y={paddingTop + 20}
                  textAnchor="middle"
                  fill="rgb(251, 191, 36)"
                  fontSize="12"
                  fontWeight="bold"
                  opacity="0.9"
                >
                  Early Incentives Window
                  {earlyBonusPct > 0n && ` (${Number(earlyBonusPct) / 100}%)`}
                </text>
              </g>
            );
          })()}

          {/* Demand checkpoint marker - rendered AFTER blue line */}
          {(() => {
            if (!demandCheckTime || demandCheckTime <= 0 || demandCheckTime < startTime) return null;
            
            const svgWidth = 1200;
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const paddingLeft = 50;
            const chartWidth = svgWidth - paddingLeft - 50;
            const effectiveTimeRange = isShortened ? originalTimeRange : timeRange;
            const effectiveRevealEnd = isShortened ? originalRevealEndTime : revealEndTime;
            if (demandCheckTime > effectiveRevealEnd) return null;
            
            const demandCheckProgress = (demandCheckTime - startTime) / effectiveTimeRange;
            const demandCheckX = paddingLeft + (demandCheckProgress * chartWidth);
            const demandCheckPrice = startPrice - (priceRange * demandCheckProgress);
            const yPercent = priceRange > 0 ? ((demandCheckPrice - endPrice) / priceRange) : 0;
            const demandCheckY = paddingTop + (chartHeight * (1 - yPercent));
            
            return (
              <g key="demand-check-marker">
                <line
                  x1={demandCheckX}
                  y1={paddingTop}
                  x2={demandCheckX}
                  y2={svgHeight - paddingBottom}
                  stroke="rgb(245, 158, 11)"
                  strokeWidth="3"
                  strokeDasharray="10,6"
                  opacity="0.8"
                />
                <circle
                  cx={demandCheckX}
                  cy={demandCheckY}
                  r="8"
                  fill="rgb(245, 158, 11)"
                  stroke="white"
                  strokeWidth="2.5"
                  filter="url(#glow)"
                />
                <g>
                  <rect
                    x={demandCheckX - 60}
                    y={demandCheckY - 30}
                    width="120"
                    height="22"
                    rx="5"
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke="rgb(245, 158, 11)"
                    strokeWidth="2"
                  />
                  <text
                    x={demandCheckX}
                    y={demandCheckY - 15}
                    fill="rgb(251, 191, 36)"
                    fontSize="11"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {formatEth(BigInt(Math.floor(demandCheckPrice)))} ETH
                  </text>
                </g>
                <g>
                  <rect
                    x={demandCheckX - 70}
                    y={svgHeight - paddingBottom + 10}
                    width="140"
                    height="32"
                    rx="5"
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke="rgb(245, 158, 11)"
                    strokeWidth="2"
                  />
                  <text
                    x={demandCheckX}
                    y={svgHeight - paddingBottom + 25}
                    fill="rgb(251, 191, 36)"
                    fontSize="12"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {formatTime(demandCheckTime)}
                  </text>
                  <text
                    x={demandCheckX}
                    y={svgHeight - paddingBottom + 38}
                    fill="rgba(251, 191, 36, 0.8)"
                    fontSize="10"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    Demand Check
                  </text>
                </g>
                {/* Tooltip on hover */}
                <title>
                  At this time, the protocol evaluates participation and may shorten the auction if demand is low.
                </title>
              </g>
            );
          })()}

          {/* Shaded area for accelerated phase (if shortened) */}
          {isShortened && originalPoints.length > 0 && points.length > 0 && (() => {
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const startY = paddingTop + chartHeight;
            const svgWidth = 1200;
            const paddingLeft = 50;
            const chartWidth = svgWidth - paddingLeft - 50;
            const revealEndProgress = (revealEndTime - startTime) / originalTimeRange;
            const revealEndX = paddingLeft + (revealEndProgress * chartWidth);
            const originalRevealEndProgress = (originalRevealEndTime - startTime) / originalTimeRange;
            const originalRevealEndX = paddingLeft + (originalRevealEndProgress * chartWidth);
            const lastShortenedPoint = points[points.length - 1].split(',');
            const shortenedEndX = parseFloat(lastShortenedPoint[0]);
            const shortenedEndY = parseFloat(lastShortenedPoint[1]);
            const originalAtShortenedEnd = originalPoints.find(pt => {
              const [x] = pt.split(',');
              return Math.abs(parseFloat(x) - shortenedEndX) < 1;
            });
            
            let originalYAtShortenedEnd = startY;
            if (originalAtShortenedEnd) {
              originalYAtShortenedEnd = parseFloat(originalAtShortenedEnd.split(',')[1]);
            } else {
              for (let i = 0; i < originalPoints.length - 1; i++) {
                const [x1, y1] = originalPoints[i].split(',').map(Number);
                const [x2, y2] = originalPoints[i + 1].split(',').map(Number);
                if (shortenedEndX >= x1 && shortenedEndX <= x2) {
                  const t = (shortenedEndX - x1) / (x2 - x1);
                  originalYAtShortenedEnd = y1 + (y2 - y1) * t;
                  break;
                }
              }
            }
            const demandCheckProgress = demandCheckTime > 0 ? (demandCheckTime - startTime) / originalTimeRange : 0;
            const divergenceX = paddingLeft + (demandCheckProgress * chartWidth);
            const divergencePrice = startPrice - (priceRange * demandCheckProgress);
            const divergenceYPercent = priceRange > 0 ? ((divergencePrice - endPrice) / priceRange) : 0;
            const divergenceY = paddingTop + (chartHeight * (1 - divergenceYPercent));
            const shortenedCurvePoints = points.filter(pt => {
              const [x] = pt.split(',');
              const xNum = parseFloat(x);
              return xNum >= divergenceX && xNum <= shortenedEndX;
            });
            const originalCurvePoints = originalPoints.filter(pt => {
              const [x] = pt.split(',');
              const xNum = parseFloat(x);
              return xNum >= divergenceX && xNum <= shortenedEndX;
            });
            
            if (shortenedCurvePoints.length > 0 && originalCurvePoints.length > 0) {
              const shortenedPoints = shortenedCurvePoints.map(pt => pt);
              const originalPointsReversed = [...originalCurvePoints].reverse().map(pt => pt);
              const polygonPoints = [
                `${divergenceX},${divergenceY}`, // Start at divergence
                ...shortenedPoints, // Follow shortened curve
                `${shortenedEndX},${originalYAtShortenedEnd}`, // End of shortened curve, but at original curve Y
                ...originalPointsReversed, // Follow original curve backwards
                `${divergenceX},${divergenceY}` // Close back to start
              ].join(" ");
              
              return (
                <g>
                  <polygon
                    points={polygonPoints}
                    fill="rgba(245, 158, 11, 0.15)"
                    stroke="rgba(245, 158, 11, 0.3)"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                </g>
              );
            }
            
            return null;
          })()}

          {/* Area gradient for current timeline (only if not shortened, or show both) */}
          {points.length > 0 && !isShortened && (() => {
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const startY = paddingTop + chartHeight; // Bottom of chart (lowest price)
            const firstPoint = points[0].split(',');
            const lastPoint = points[points.length - 1].split(',');
            const areaPoints = `50,${startY} ${points.join(" ")} ${lastPoint[0]},${startY}`;
            
            return (
              <polygon
                points={areaPoints}
                fill="url(#areaGradient)"
              />
            );
          })()}

          {/* Current (shortened) timeline - solid line, rendered BEFORE markers */}
          {points.length > 0 && (
            <>
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke="rgba(59, 130, 246, 0.4)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke="rgb(59, 130, 246)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                style={!isShortened ? {
                  strokeDasharray: '2000',
                  strokeDashoffset: '2000',
                  animation: 'drawLine 2s ease-out forwards'
                } : {}}
              />
            </>
          )}

          {currentTime >= startTime && (
            <>

              {(() => {
                const svgWidth = 1200;
                const svgHeight = 400;
                const paddingTop = 40;
                const paddingBottom = 60;
                const chartHeight = svgHeight - paddingTop - paddingBottom;
                const paddingLeft = 50;
                const chartWidth = svgWidth - paddingLeft - 50;
                const effectiveTimeRangeForX = isShortened ? originalTimeRange : timeRange;
                const commitEndProgress = (commitEndTime - startTime) / effectiveTimeRangeForX;
                const commitEndX = paddingLeft + (commitEndProgress * chartWidth);
                const yPercent = priceRange > 0 ? ((commitEndPrice - endPrice) / priceRange) : 0;
                const commitEndY = paddingTop + (chartHeight * (1 - yPercent));
                
                return (
                  <g>
                    <line
                      x1={commitEndX}
                      y1={paddingTop}
                      x2={commitEndX}
                      y2={svgHeight - paddingBottom}
                      stroke="rgb(59, 130, 246)"
                      strokeWidth="3"
                      strokeDasharray="8,6"
                      opacity="0.6"
                    />
                    <circle
                      cx={commitEndX}
                      cy={commitEndY}
                      r="8"
                      fill="rgb(59, 130, 246)"
                      stroke="white"
                      strokeWidth="2.5"
                      filter="url(#glow)"
                    />
                    <g>
                      <rect
                        x={commitEndX - 40}
                        y={commitEndY - 30}
                        width="80"
                        height="22"
                        rx="5"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="rgb(59, 130, 246)"
                        strokeWidth="2"
                      />
                      <text
                        x={commitEndX}
                        y={commitEndY - 15}
                        fill="rgb(147, 197, 253)"
                        fontSize="11"
                        textAnchor="middle"
                        fontWeight="bold"
                      >
                        {formatEth(BigInt(Math.floor(commitEndPrice)))} ETH
                      </text>
                    </g>
                    <g>
                      <rect
                        x={commitEndX - 50}
                        y={svgHeight - paddingBottom + 10}
                        width="100"
                        height="24"
                        rx="5"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="rgb(59, 130, 246)"
                        strokeWidth="2"
                      />
                      <text
                        x={commitEndX}
                        y={svgHeight - paddingBottom + 25}
                        fill="rgb(147, 197, 253)"
                        fontSize="12"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {formatTime(commitEndTime)}
                      </text>
                      <text
                        x={commitEndX}
                        y={svgHeight - paddingBottom + 38}
                        fill="rgba(147, 197, 253, 0.8)"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        Commit End
                      </text>
                    </g>
                  </g>
                );
              })()}

              {(() => {
                const svgWidth = 1200;
                const svgHeight = 400;
                const paddingTop = 40;
                const paddingBottom = 60;
                const chartHeight = svgHeight - paddingTop - paddingBottom;
                const paddingLeft = 50;
                const chartWidth = svgWidth - paddingLeft - 50;
                const effectiveTimeRangeForX = isShortened ? originalTimeRange : timeRange;
                const revealEndProgress = (revealEndTime - startTime) / effectiveTimeRangeForX;
                const revealEndX = paddingLeft + (revealEndProgress * chartWidth);
                const yPercent = priceRange > 0 ? ((revealEndPrice - endPrice) / priceRange) : 0;
                const revealEndY = paddingTop + (chartHeight * (1 - yPercent));
                
                return (
                  <g>
                    <line
                      x1={revealEndX}
                      y1={paddingTop}
                      x2={revealEndX}
                      y2={svgHeight - paddingBottom}
                      stroke="rgb(147, 51, 234)"
                      strokeWidth="3"
                      strokeDasharray="8,6"
                      opacity="0.6"
                    />
                    <circle
                      cx={revealEndX}
                      cy={revealEndY}
                      r="8"
                      fill="rgb(147, 51, 234)"
                      stroke="white"
                      strokeWidth="2.5"
                      filter="url(#glow)"
                    />
                    <g>
                      <rect
                        x={revealEndX - 40}
                        y={revealEndY - 30}
                        width="80"
                        height="22"
                        rx="5"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="rgb(147, 51, 234)"
                        strokeWidth="2"
                      />
                      <text
                        x={revealEndX}
                        y={revealEndY - 15}
                        fill="rgb(196, 181, 253)"
                        fontSize="11"
                        textAnchor="middle"
                        fontWeight="bold"
                      >
                        {formatEth(BigInt(Math.floor(revealEndPrice)))} ETH
                      </text>
                    </g>
                    <g>
                      <rect
                        x={revealEndX - 50}
                        y={svgHeight - paddingBottom + 10}
                        width="100"
                        height="24"
                        rx="5"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="rgb(147, 51, 234)"
                        strokeWidth="2"
                      />
                      <text
                        x={revealEndX}
                        y={svgHeight - paddingBottom + 25}
                        fill="rgb(196, 181, 253)"
                        fontSize="12"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {formatTime(revealEndTime)}
                      </text>
                      <text
                        x={revealEndX}
                        y={svgHeight - paddingBottom + 38}
                        fill="rgba(196, 181, 253, 0.8)"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        Reveal End
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* Original Reveal End marker on dashed line (if shortened) */}
              {isShortened && originalRevealEndTime && originalPoints.length > 0 && (() => {
                const svgWidth = 1200;
                const svgHeight = 400;
                const paddingTop = 40;
                const paddingBottom = 60;
                const chartHeight = svgHeight - paddingTop - paddingBottom;
                const paddingLeft = 50;
                const chartWidth = svgWidth - paddingLeft - 50;
                const originalRevealEndProgress = (originalRevealEndTime - startTime) / originalTimeRange;
                const originalRevealEndX = paddingLeft + (originalRevealEndProgress * chartWidth);
                const originalRevealEndPrice = startPrice - (priceRange * originalRevealEndProgress);
                const yPercent = priceRange > 0 ? ((originalRevealEndPrice - endPrice) / priceRange) : 0;
                const originalRevealEndY = paddingTop + (chartHeight * (1 - yPercent));
                
                return (
                  <g>
                    <line
                      x1={originalRevealEndX}
                      y1={paddingTop}
                      x2={originalRevealEndX}
                      y2={svgHeight - paddingBottom}
                      stroke="rgba(148, 163, 184, 0.5)"
                      strokeWidth="2"
                      strokeDasharray="8,6"
                      opacity="0.5"
                    />
                    <circle
                      cx={originalRevealEndX}
                      cy={originalRevealEndY}
                      r="6"
                      fill="rgba(148, 163, 184, 0.6)"
                      stroke="rgba(255, 255, 255, 0.5)"
                      strokeWidth="2"
                    />
                    <g>
                      <rect
                        x={originalRevealEndX - 50}
                        y={svgHeight - paddingBottom - 40}
                        width="100"
                        height="24"
                        rx="5"
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="rgba(148, 163, 184, 0.6)"
                        strokeWidth="2"
                      />
                      <text
                        x={originalRevealEndX}
                        y={svgHeight - paddingBottom - 25}
                        fill="rgba(148, 163, 184, 0.9)"
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {formatTime(originalRevealEndTime)}
                      </text>
                      <text
                        x={originalRevealEndX}
                        y={svgHeight - paddingBottom - 12}
                        fill="rgba(148, 163, 184, 0.7)"
                        fontSize="9"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        Original Reveal End
                      </text>
                    </g>
                  </g>
                );
              })()}
            </>
          )}

          {/* Y-axis price labels */}
          {[0, 20, 40, 60, 80, 100].map((percent) => {
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const paddingLeft = 50;
            
            const price = startPrice - (priceRange * (percent / 100));
            const yPercent = priceRange > 0 ? ((price - endPrice) / priceRange) : 0;
        
            const y = paddingTop + (chartHeight * (1 - yPercent));
            
            return (
              <g key={`y-label-${percent}`}>
                <line
                  x1={paddingLeft - 5}
                  y1={y}
                  x2={paddingLeft}
                  y2={y}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2"
                />
                <rect
                  x={5}
                  y={y - 8}
                  width="38"
                  height="16"
                  rx="3"
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke="rgba(59, 130, 246, 0.3)"
                  strokeWidth="1"
                />
                <text
                  x={24}
                  y={y}
                  fill="rgba(255,255,255,0.9)"
                  fontSize="11"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="600"
                  className="font-mono"
                >
                  {formatEth(BigInt(Math.floor(price)))}
                </text>
              </g>
            );
          })}


          {currentTime >= startTime && currentTime <= revealEndTime && (() => {
            const svgWidth = 1200;
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const paddingLeft = 50;
            const chartWidth = svgWidth - paddingLeft - 50;
            const effectiveTimeRangeForX = isShortened ? originalTimeRange : timeRange;
            const currentProgressForX = effectiveTimeRangeForX > 0 ? (currentTime - startTime) / effectiveTimeRangeForX : 0;
            const currentX = paddingLeft + (currentProgressForX * chartWidth);
            const yPercent = priceRange > 0 ? ((currentPrice - endPrice) / priceRange) : 0;
            const currentY = paddingTop + (chartHeight * (1 - yPercent));
            
            return (
              <>
                <line
                  x1={currentX}
                  y1={paddingTop}
                  x2={currentX}
                  y2={svgHeight - paddingBottom}
                  stroke="rgb(34, 197, 94)"
                  strokeWidth="4"
                  strokeDasharray="10,8"
                  opacity="0.7"
                  style={{
                    animation: 'fadeIn 0.5s ease-out'
                  }}
                />

                <circle
                  cx={currentX}
                  cy={currentY}
                  r="14"
                  fill="rgb(34, 197, 94)"
                  stroke="white"
                  strokeWidth="3.5"
                  filter="url(#glow)"
                  style={{
                    animation: 'pricePulse 2s ease-in-out infinite'
                  }}
                />
                <circle
                  cx={currentX}
                  cy={currentY}
                  r="14"
                  fill="rgb(34, 197, 94)"
                  opacity="0.4"
                  className="animate-ping"
                />
                <g>
                  <rect
                    x={currentX - 60}
                    y={currentY - 40}
                    width="120"
                    height="32"
                    rx="7"
                    fill="rgba(15, 23, 42, 0.98)"
                    stroke="rgb(34, 197, 94)"
                    strokeWidth="2.5"
                  />
                  <text
                    x={currentX}
                    y={currentY - 20}
                    fill="rgb(34, 197, 94)"
                    fontSize="13"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {formatEth(BigInt(Math.floor(currentPrice)))} ETH
                  </text>
                  <text
                    x={currentX}
                    y={currentY - 8}
                    fill="rgba(34, 197, 94, 0.8)"
                    fontSize="10"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    Current Price
                  </text>
                </g>

                <g>
                  <rect
                    x={currentX - 45}
                    y={svgHeight - paddingBottom + 5}
                    width="90"
                    height="20"
                    rx="5"
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke="rgb(34, 197, 94)"
                    strokeWidth="2"
                  />
                  <text
                    x={currentX}
                    y={svgHeight - paddingBottom + 18}
                    fill="rgb(34, 197, 94)"
                    fontSize="11"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {formatTime(currentTime)}
                  </text>
                </g>
              </>
            );
          })()}

          {finalized && clearingPrice > 0n && (() => {
            const svgWidth = 1200;
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const paddingLeft = 50;
            
            const yPercent = priceRange > 0 ? ((Number(clearingPrice) - endPrice) / priceRange) : 0;
            const clearingY = paddingTop + (chartHeight * (1 - yPercent));
            
            return (
              <>
                <line
                  x1={paddingLeft}
                  y1={clearingY}
                  x2={svgWidth - 50}
                  y2={clearingY}
                  stroke="rgb(34, 197, 94)"
                  strokeWidth="4"
                  strokeDasharray="10,6"
                  opacity="0.8"
                />
                <g>
                  <rect
                    x={paddingLeft + 10}
                    y={clearingY - 14}
                    width="180"
                    height="28"
                    rx="6"
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke="rgb(34, 197, 94)"
                    strokeWidth="2"
                  />
                  <text
                    x={paddingLeft + 100}
                    y={clearingY + 4}
                    fill="rgb(34, 197, 94)"
                    fontSize="13"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    Clearing: {formatEth(clearingPrice)} ETH
                  </text>
                </g>
              </>
            );
          })()}
          

          {[0, 25, 50, 75, 100].map((percent) => {
            const svgWidth = 1200;
            const svgHeight = 400;
            const paddingBottom = 60;
            const paddingLeft = 50;
            const chartWidth = svgWidth - paddingLeft - 50;
            
            const time = startTime + (timeRange * (percent / 100));
            const x = paddingLeft + (percent / 100 * chartWidth);
            let label = "";
            let phaseColor = "rgba(255,255,255,0.5)";
            const commitEndPercent = ((commitEndTime - startTime) / timeRange * 100);
            const revealEndPercent = ((revealEndTime - startTime) / timeRange * 100);
            if (Math.abs(percent - commitEndPercent) < 5) {
              return null;
            }
            if (Math.abs(percent - revealEndPercent) < 5) {
              if (!isShortened) {
                return null;
              }
            }
            
            if (percent === 0) {
              label = formatTime(startTime);
              phaseColor = "rgba(59, 130, 246, 0.8)";
            }
            
            if (label) {
              return (
                <g key={`x-label-${percent}`}>
                  <line
                    x1={x}
                    y1={svgHeight - paddingBottom}
                    x2={x}
                    y2={svgHeight - paddingBottom + 10}
                    stroke={phaseColor}
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y={svgHeight - paddingBottom + 25}
                    fill={phaseColor}
                    fontSize="11"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {label}
                  </text>
                </g>
              );
            }
            return null;
          })}
        </svg>


        <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-semibold text-[rgba(255,255,255,0.6)]">
          Price (ETH)
        </div>
        <div className="absolute bottom-0 left-1/2 translate-x-1/2 translate-y-8 text-xs font-semibold text-[rgba(255,255,255,0.6)]">
          Time
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        <div className="rounded-xl border-2 border-[rgba(255,255,255,0.1)] bg-gradient-to-br from-[rgba(30,41,59,0.6)] to-[rgba(15,23,42,0.6)] p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_20px_-3px_rgba(0,0,0,0.4)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[rgba(255,255,255,0.8)]">Soft Cap Progress</p>
            <div className={`rounded-md px-2 py-1 text-xs font-bold ${softCapProgress >= 1 ? 'bg-[rgba(16,185,129,0.2)] text-[rgb(110,231,183)] border border-[rgba(16,185,129,0.4)]' : 'bg-[rgba(59,130,246,0.2)] text-[rgb(147,197,253)] border border-[rgba(59,130,246,0.4)]'}`}>
              {softCapProgress >= 1 ? "REACHED" : "IN PROGRESS"}
            </div>
          </div>
          <div className="mb-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-white">
                {formatEth(totalDepositsRevealed !== undefined ? totalDepositsRevealed : totalDepositCommitted)}
              </span>
              <span className="text-sm text-[rgba(255,255,255,0.6)]">
                / {formatEth(softCap)} ETH
              </span>
            </div>
            <p className="text-xs text-[rgba(255,255,255,0.5)]">
              {softCapProgress >= 1 
                ? "Soft cap successfully reached!" 
                : `${formatEth(BigInt(Math.floor(Math.max(0, Number(softCap) - Number(totalDepositsRevealed !== undefined ? totalDepositsRevealed : totalDepositCommitted)))))} ETH remaining`
              }
            </p>
          </div>
          <div className="mb-2 h-4 w-full overflow-hidden rounded-full bg-[rgba(51,65,85,0.5)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${softCapProgress >= 1 ? 'bg-gradient-to-r from-[rgb(16,185,129)] to-[rgb(5,150,105)] shadow-[0_10px_15px_-3px_rgba(16,185,129,0.5)]' : 'bg-gradient-to-r from-[rgb(59,130,246)] to-[rgb(37,99,235)] shadow-[0_10px_15px_-3px_rgba(59,130,246,0.5)]'}`}
              style={{ width: `${Math.min(softCapProgress * 100, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-[rgba(255,255,255,0.6)]">
              {softCapProgress >= 1 
                ? "Soft cap reached"
                : `${Math.round(softCapProgress * 100)}% complete`
              }
            </p>
            {softCapProgress < 1 && (
              <p className="text-xs font-semibold text-[rgb(96,165,250)]">
                {Math.round(softCapProgress * 100)}%
              </p>
            )}
          </div>
        </div>


        <div className="rounded-xl border-2 border-[rgba(255,255,255,0.1)] bg-gradient-to-br from-[rgba(30,41,59,0.6)] to-[rgba(15,23,42,0.6)] p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_20px_-3px_rgba(0,0,0,0.4)]">
          <p className="mb-3 text-sm font-semibold text-[rgba(255,255,255,0.8)]">Price Range</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">High:</span>
              <span className="text-lg font-bold text-[rgb(248,113,113)]">
                {formatEth(BigInt(Math.floor(startPrice)))} ETH
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">Low:</span>
              <span className="text-lg font-bold text-[rgb(74,222,128)]">
                {formatEth(BigInt(Math.floor(endPrice)))} ETH
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.1)] p-2">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">Range:</span>
              <span className="text-lg font-bold text-[rgb(96,165,250)]">
                {formatEth(BigInt(Math.floor(priceRange)))} ETH
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">Change:</span>
              <span className="text-lg font-bold text-[rgb(96,165,250)]">
                {priceChangePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-[rgba(255,255,255,0.1)] bg-gradient-to-br from-[rgba(30,41,59,0.6)] to-[rgba(15,23,42,0.6)] p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_20px_-3px_rgba(0,0,0,0.4)]">
          <p className="mb-3 text-sm font-semibold text-[rgba(255,255,255,0.8)]">Time Status</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">Phase:</span>
              <span className={`rounded px-2 py-1 text-base font-bold ${
                phaseClass === 'commit' ? 'bg-[rgba(59,130,246,0.2)] text-[rgb(147,197,253)] border border-[rgba(59,130,246,0.4)]' :
                phaseClass === 'reveal' ? 'bg-[rgba(147,51,234,0.2)] text-[rgb(196,181,253)] border border-[rgba(147,51,234,0.4)]' :
                phaseClass === 'finalized' ? 'bg-[rgba(16,185,129,0.2)] text-[rgb(110,231,183)] border border-[rgba(16,185,129,0.4)]' :
                'bg-[rgba(71,85,105,0.2)] text-[rgb(148,163,184)] border border-[rgba(71,85,105,0.4)]'
              }`}>
                {phase}
              </span>
            </div>
            {timeRemaining && (
              <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
                <span className="text-sm text-[rgba(255,255,255,0.7)]">Time Remaining:</span>
                <span className="rounded px-2 py-1 text-base font-bold text-white">
                  {timeRemaining.hours}h {timeRemaining.minutes}m
                </span>
              </div>
            )}
            {phase === "Commit" && (
              <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
                <span className="text-sm text-[rgba(255,255,255,0.7)]">Commit Ends:</span>
                <span className="rounded px-2 py-1 text-base font-bold text-white">
                  {formatDateTime(commitEndTime)}
                </span>
              </div>
            )}
            {phase === "Reveal" && (
              <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.4)] p-2">
                <span className="text-sm text-[rgba(255,255,255,0.7)]">Reveal Ends:</span>
                <span className="rounded px-2 py-1 text-base font-bold text-white">
                  {formatDateTime(revealEndTime)}
                </span>
              </div>
            )}
            {finalized && (
              <div className="flex items-center justify-between rounded-lg border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] p-2">
                <span className="text-sm text-[rgba(255,255,255,0.7)]">Status:</span>
                <span className="rounded px-2 py-1 text-base font-bold text-[rgb(52,211,153)]">
                  Finalized
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 rounded-lg border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.05)] p-3">
        <p className="text-xs text-[rgba(255,255,255,0.6)] leading-relaxed">
          <strong className="text-[rgba(255,255,255,0.8)]">Note:</strong> This chart visualizes auction timing and urgency. 
          Final price is determined by clearing logic, not by the curve.
        </p>
      </div>
    </div>
  );
};

export default PriceDecayChart;
