/* eslint-env es2020 */
import React, { useMemo } from "react";
import { ethers } from "ethers";
import styles from "./css/PriceDecayChart.module.css";

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
  clearingTickIndex,
  totalDepositCommitted,
  softCap,
  phase
}) => {
  // All hooks must be called before any early returns
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
  
  // Calculate current price
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
  
  // Calculate soft cap progress
  const softCapProgress = useMemo(() => {
    return softCap > 0n ? Math.min(Number(totalDepositCommitted) / Number(softCap), 1) : 0;
  }, [softCap, totalDepositCommitted]);

  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    if (currentTime >= revealEndTime) return null;
    const remaining = revealEndTime - currentTime;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return { hours, minutes, seconds };
  }, [currentTime, revealEndTime]);

  // Calculate price change percentage
  const priceChangePercent = useMemo(() => {
    if (!startPrice || currentTime < startTime) return 0;
    return ((startPrice - currentPrice) / startPrice) * 100;
  }, [currentPrice, startPrice, currentTime, startTime]);
  
  // Create smooth curve points - Fixed coordinates for SVG viewBox
  const points = useMemo(() => {
    if (!startPrice || !priceRange || !timeRange) return [];
    const pts = [];
    const numPoints = 300; // More points for smoother curve
    const svgWidth = 1200;
    const svgHeight = 400;
    const paddingTop = 40;
    const paddingBottom = 60;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const time = startTime + (t * timeRange);
      const price = startPrice - (priceRange * t);
      
      // X coordinate: from left to right (0 to svgWidth)
      const x = (t * (svgWidth - 100)) + 50; // 50px padding on left, 50px on right
      
      // Y coordinate: from top (high price = startPrice) to bottom (low price = endPrice)
      // SVG Y=0 is at top, so high price should have small Y value
      const yPercent = priceRange > 0 ? ((price - endPrice) / priceRange) : 0;
      const y = paddingTop + (chartHeight * (1 - yPercent)); // High price at top (small Y)
      
      pts.push(`${x},${y}`);
    }
    return pts;
  }, [startPrice, endPrice, priceRange, timeRange, startTime]);
  
  // Find price tick positions for markers
  const tickMarkers = useMemo(() => {
    if (!priceTicks || priceTicks.length === 0 || !startPrice || !priceRange) return [];
    return priceTicks.map((tick, idx) => {
      const price = Number(tick);
      const y = priceRange > 0 ? ((startPrice - price) / priceRange * 100) : (100 - (idx / (priceTicks.length - 1)) * 100);
      return { idx, price, y };
    });
  }, [priceTicks, startPrice, priceRange]);

  // Calculate phase progress
  const phaseProgress = useMemo(() => {
    if (!startTime || !commitEndTime || !revealEndTime) return 0;
    if (phase === "Commit") {
      return Math.min((currentTime - startTime) / (commitEndTime - startTime), 1);
    } else if (phase === "Reveal") {
      return Math.min((currentTime - commitEndTime) / (revealEndTime - commitEndTime), 1);
    }
    return 0;
  }, [phase, currentTime, startTime, commitEndTime, revealEndTime]);

  // Calculate commit end price
  const commitEndPrice = useMemo(() => {
    if (!startPrice || !priceRange || !timeRange) return 0;
    const commitEndProgress = (commitEndTime - startTime) / timeRange;
    return startPrice - (priceRange * commitEndProgress);
  }, [commitEndTime, startTime, timeRange, startPrice, priceRange]);

  // Calculate reveal end price
  const revealEndPrice = useMemo(() => {
    if (!startPrice || !priceRange || !timeRange) return 0;
    const revealEndProgress = (revealEndTime - startTime) / timeRange;
    return startPrice - (priceRange * revealEndProgress);
  }, [revealEndTime, startTime, timeRange, startPrice, priceRange]);

  const phaseClass = phase?.toLowerCase() || "notstarted";

  // Early return after all hooks
  if (!priceTicks || priceTicks.length === 0) return null;

  return (
    <div className={`${styles.container} ${styles.fadeIn}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h2>Price Decay & Market Status</h2>
          <div className={styles.phaseIndicator}>
            <div className={`${styles.phaseDot} ${styles[phaseClass]}`} />
            <p className={styles.phaseText}>
              {phase === "Commit" && `Commit Phase - Price decreasing (${priceChangePercent.toFixed(2)}% down)`}
              {phase === "Reveal" && "Reveal Phase - Price locked"}
              {phase === "Finalized" && "Auction Finalized"}
              {phase === "NotStarted" && "Auction not started yet"}
            </p>
          </div>
        </div>
        <div className={styles.currentPriceCard}>
          <p className={styles.currentPriceLabel}>Current Price</p>
          <p className={styles.currentPriceValue}>
            {formatEth(BigInt(Math.floor(currentPrice)))} ETH
          </p>
          {timeRemaining && (
            <p className={styles.timeRemaining}>
              {timeRemaining.hours}h {timeRemaining.minutes}m {timeRemaining.seconds}s remaining
            </p>
          )}
          {priceChangePercent > 0 && (
            <p className={styles.timeRemaining} style={{ color: 'rgba(96, 165, 250, 0.8)' }}>
              {priceChangePercent.toFixed(2)}% below start
            </p>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className={styles.chartContainer}>
        <svg className={styles.chartSvg} viewBox="0 0 1200 400" preserveAspectRatio="none">
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

          {/* Grid lines */}
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

          {/* Phase dividers with enhanced labels */}
          {currentTime >= startTime && (
            <>
              {/* Commit phase divider */}
              {(() => {
                const svgWidth = 1200;
                const svgHeight = 400;
                const paddingTop = 40;
                const paddingBottom = 60;
                const chartHeight = svgHeight - paddingTop - paddingBottom;
                const paddingLeft = 50;
                const chartWidth = svgWidth - paddingLeft - 50;
                
                const commitEndProgress = (commitEndTime - startTime) / timeRange;
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
              
              {/* Reveal phase divider */}
              {(() => {
                const svgWidth = 1200;
                const svgHeight = 400;
                const paddingTop = 40;
                const paddingBottom = 60;
                const chartHeight = svgHeight - paddingTop - paddingBottom;
                const paddingLeft = 50;
                const chartWidth = svgWidth - paddingLeft - 50;
                
                const revealEndProgress = (revealEndTime - startTime) / timeRange;
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
            </>
          )}

          {/* Filled area under curve */}
          {points.length > 0 && (() => {
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const startY = paddingTop + chartHeight; // Bottom of chart (lowest price)
            const endY = paddingTop; // Top of chart (highest price)
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

          {/* Price decay curve with animation */}
          {points.length > 0 && (
            <>
              {/* Secondary curve for depth/glow */}
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke="rgba(59, 130, 246, 0.4)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Main price curve with draw animation */}
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke="rgb(59, 130, 246)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                style={{
                  strokeDasharray: '2000',
                  strokeDashoffset: '2000',
                  animation: 'drawLine 2s ease-out forwards'
                }}
              />
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
            // For Y-axis: 0% = top (high price), 100% = bottom (low price)
            // So we need to invert: 0% on axis = 100% of chart height from top
            const yPercent = (100 - percent) / 100; // Invert: 0% -> 100%, 100% -> 0%
            const y = paddingTop + (chartHeight * yPercent);
            
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

          {/* Current price indicator with animation */}
          {currentTime >= startTime && currentTime <= revealEndTime && (() => {
            const svgWidth = 1200;
            const svgHeight = 400;
            const paddingTop = 40;
            const paddingBottom = 60;
            const chartHeight = svgHeight - paddingTop - paddingBottom;
            const paddingLeft = 50;
            const chartWidth = svgWidth - paddingLeft - 50;
            
            const currentX = paddingLeft + (currentProgress * chartWidth);
            const yPercent = priceRange > 0 ? ((currentPrice - endPrice) / priceRange) : 0;
            const currentY = paddingTop + (chartHeight * (1 - yPercent));
            
            return (
              <>
                {/* Animated vertical line */}
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
                {/* Current price marker with pulse animation */}
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
                {/* Pulse rings */}
                <circle
                  cx={currentX}
                  cy={currentY}
                  r="14"
                  fill="rgb(34, 197, 94)"
                  opacity="0.4"
                  className="animate-ping"
                />
                {/* Price label */}
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
                {/* Time label */}
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

          {/* Clearing price line */}
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
                    ✓ Clearing: {formatEth(clearingPrice)} ETH
                  </text>
                </g>
              </>
            );
          })()}
          
          {/* X-axis time labels */}
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
            
            if (percent === 0) {
              label = formatTime(startTime);
              phaseColor = "rgba(59, 130, 246, 0.8)";
            } else if (Math.abs(percent - ((commitEndTime - startTime) / timeRange * 100)) < 5) {
              label = formatTime(commitEndTime);
              phaseColor = "rgba(59, 130, 246, 0.8)";
            } else if (percent === 100) {
              label = formatTime(revealEndTime);
              phaseColor = "rgba(147, 51, 234, 0.8)";
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

        {/* Axis titles */}
        <div className={`${styles.axisLabel} ${styles.axisLabelY}`}>
          Price (ETH)
        </div>
        <div className={`${styles.axisLabel} ${styles.axisLabelX}`}>
          Time
        </div>
      </div>

      {/* Market Status Indicators */}
      <div className={styles.statusGrid}>
        {/* Soft Cap Progress */}
        <div className={styles.statusCard}>
          <div className={styles.statusCardHeader}>
            <p className={styles.statusCardTitle}>Soft Cap Progress</p>
            <div className={`${styles.statusBadge} ${softCapProgress >= 1 ? styles.reached : styles.inProgress}`}>
              {softCapProgress >= 1 ? "✓ REACHED" : "IN PROGRESS"}
            </div>
          </div>
          <div className={styles.softCapContent}>
            <div className={styles.softCapAmounts}>
              <span className={styles.softCapCurrent}>
                {formatEth(totalDepositCommitted)}
              </span>
              <span className={styles.softCapTotal}>
                / {formatEth(softCap)} ETH
              </span>
            </div>
            <p className={styles.softCapRemaining}>
              {softCapProgress >= 1 
                ? "Soft cap successfully reached!" 
                : `${formatEth(BigInt(Math.floor(Math.max(0, Number(softCap) - Number(totalDepositCommitted)))))} ETH remaining`
              }
            </p>
          </div>
          <div className={styles.progressBarContainer}>
            <div
              className={`${styles.progressBar} ${softCapProgress >= 1 ? styles.reached : styles.inProgress}`}
              style={{ width: `${Math.min(softCapProgress * 100, 100)}%` }}
            />
          </div>
          <div className={styles.progressFooter}>
            <p className={styles.progressText}>
              {softCapProgress >= 1 
                ? "✓ Soft cap reached" 
                : `${Math.round(softCapProgress * 100)}% complete`
              }
            </p>
            {softCapProgress < 1 && (
              <p className={styles.progressPercent}>
                {Math.round(softCapProgress * 100)}%
              </p>
            )}
          </div>
        </div>

        {/* Price Range */}
        <div className={styles.statusCard}>
          <p className={styles.statusCardTitle}>Price Range</p>
          <div className={styles.priceRangeContent}>
            <div className={styles.priceRangeItem}>
              <span className={styles.priceRangeLabel}>High:</span>
              <span className={`${styles.priceRangeValue} ${styles.high}`}>
                {formatEth(BigInt(Math.floor(startPrice)))} ETH
              </span>
            </div>
            <div className={styles.priceRangeItem}>
              <span className={styles.priceRangeLabel}>Low:</span>
              <span className={`${styles.priceRangeValue} ${styles.low}`}>
                {formatEth(BigInt(Math.floor(endPrice)))} ETH
              </span>
            </div>
            <div className={`${styles.priceRangeItem} ${styles.range}`}>
              <span className={styles.priceRangeLabel}>Range:</span>
              <span className={`${styles.priceRangeValue} ${styles.range}`}>
                {formatEth(BigInt(Math.floor(priceRange)))} ETH
              </span>
            </div>
            <div className={styles.priceRangeItem}>
              <span className={styles.priceRangeLabel}>Change:</span>
              <span className={`${styles.priceRangeValue} ${styles.range}`}>
                {priceChangePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Time Status */}
        <div className={styles.statusCard}>
          <p className={styles.statusCardTitle}>Time Status</p>
          <div className={styles.timeStatusContent}>
            <div className={styles.timeStatusItem}>
              <span className={styles.timeStatusLabel}>Phase:</span>
              <span className={`${styles.timeStatusValue} ${styles[phaseClass]}`}>
                {phase}
              </span>
            </div>
            {timeRemaining && (
              <div className={styles.timeStatusItem}>
                <span className={styles.timeStatusLabel}>Time Remaining:</span>
                <span className={`${styles.timeStatusValue} ${styles.white}`}>
                  {timeRemaining.hours}h {timeRemaining.minutes}m
                </span>
              </div>
            )}
            {phase === "Commit" && (
              <div className={styles.timeStatusItem}>
                <span className={styles.timeStatusLabel}>Commit Ends:</span>
                <span className={`${styles.timeStatusValue} ${styles.white}`}>
                  {formatDateTime(commitEndTime)}
                </span>
              </div>
            )}
            {phase === "Reveal" && (
              <div className={styles.timeStatusItem}>
                <span className={styles.timeStatusLabel}>Reveal Ends:</span>
                <span className={`${styles.timeStatusValue} ${styles.white}`}>
                  {formatDateTime(revealEndTime)}
                </span>
              </div>
            )}
            {finalized && (
              <div className={`${styles.timeStatusItem} ${styles.finalized}`}>
                <span className={styles.timeStatusLabel}>Status:</span>
                <span className={`${styles.timeStatusValue} ${styles.green}`}>
                  ✓ Finalized
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceDecayChart;
