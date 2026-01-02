import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatToken } from "./vesting.utils";

/**
 * Format large numbers for Y-axis display
 * Converts wei/smallest unit to readable format
 */
const formatYAxisValue = (value, tokenDecimals = 18) => {
  if (!value || value === 0 || isNaN(value)) return "0";
  
  try {
    // Convert to BigInt to handle large numbers safely
    // Use Math.floor to avoid precision issues with very large numbers
    let bigIntValue;
    if (typeof value === 'bigint') {
      bigIntValue = value;
    } else {
      // For very large numbers, we need to be careful with conversion
      const valueStr = value.toString();
      if (valueStr.includes('e') || valueStr.includes('E')) {
        // Handle scientific notation
        const [base, exp] = valueStr.split(/[eE]/);
        const exponent = parseInt(exp, 10);
        const baseNum = parseFloat(base);
        bigIntValue = BigInt(Math.floor(baseNum * Math.pow(10, exponent)));
      } else {
        bigIntValue = BigInt(Math.floor(Number(value)));
      }
    }
    
    // Format using ethers to get proper decimal formatting
    const formatted = formatToken(bigIntValue, tokenDecimals);
    const num = parseFloat(formatted);
    
    if (isNaN(num) || num === 0) return "0";
    
    // For very large numbers, use compact notation
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    
    // For numbers less than 1000, show up to 2 decimals, but remove trailing zeros
    const fixed = num.toFixed(2);
    return parseFloat(fixed).toString();
  } catch (error) {
    // Fallback: try to format as number with locale string
    try {
      const num = Number(value);
      if (isNaN(num)) return "0";
      return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    } catch {
      return "0";
    }
  }
};

const VestingChart = ({
  vestingCurveData,
  vestingStart,
  finalTime,
  currentTime,
  userVested,
  tokenSymbol,
  tokenDecimals,
}) => {
  if (!vestingCurveData || vestingCurveData.length === 0) {
    return null;
  }

  // Filter data to only show up to finalTime
  const filteredData = vestingCurveData.filter((point) => {
    const timestamp = Number(point.timestamp);
    return timestamp <= finalTime;
  });

  // Ensure the last point is exactly at finalTime with the final vested amount
  const lastPoint = filteredData[filteredData.length - 1];
  if (lastPoint && Number(lastPoint.timestamp) < finalTime) {
    // Find the final vested amount (should be the max value)
    const maxVested = Math.max(...filteredData.map(p => Number(p.vested)));
    filteredData.push({
      timestamp: finalTime,
      vested: maxVested,
    });
  }

  return (
    <div className="relative overflow-visible rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-8 pt-10 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2)] backdrop-blur-[12px] backdrop-saturate-[180%] before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-purple-500/80 before:via-cyan-500/80 before:to-purple-500/80 before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="mb-6 bg-gradient-to-br from-white to-slate-300 bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Vesting Curve</h2>
      <div className="overflow-visible pt-8 pb-4">
        <ResponsiveContainer width="100%" height={400}>
        <AreaChart 
          data={filteredData}
          margin={{ top: 30, right: 30, bottom: 20, left: 20 }}
        >
          <defs>
            <linearGradient id="vestingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
          <XAxis
            dataKey="timestamp"
            stroke="rgba(255, 255, 255, 0.6)"
            style={{ fontSize: "0.75rem" }}
            type="number"
            scale="linear"
            domain={[vestingStart, finalTime]}
            tickFormatter={(value) => {
              const date = new Date(Number(value) * 1000);
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }}
          />
          <YAxis
            stroke="rgba(255, 255, 255, 0.6)"
            style={{ fontSize: "0.75rem" }}
            tickFormatter={(value) => formatYAxisValue(value, tokenDecimals)}
            allowDecimals={false}
            domain={['auto', 'auto']}
            label={{
              value: `Vested Amount (${tokenSymbol})`,
              angle: -90,
              position: "insideLeft",
              style: { fill: "rgba(255, 255, 255, 0.6)" },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "0.5rem",
              color: "white",
            }}
            formatter={(value) => {
              try {
                // Handle both Number and BigInt values
                let bigIntValue;
                if (typeof value === 'bigint') {
                  bigIntValue = value;
                } else {
                  const numValue = Number(value);
                  if (isNaN(numValue)) return ["0", "Vested"];
                  bigIntValue = BigInt(Math.floor(numValue));
                }
                return [
                  `${formatToken(bigIntValue, tokenDecimals)} ${tokenSymbol}`,
                  "Vested",
                ];
              } catch (error) {
                return ["0", "Vested"];
              }
            }}
            labelFormatter={(label) => {
              const date = new Date(Number(label) * 1000);
              return `Time: ${date.toLocaleString()}`;
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="vested"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#vestingGradient)"
            name={`Vested ${tokenSymbol}`}
          />
          {currentTime >= vestingStart && (
            <ReferenceLine
              x={currentTime <= finalTime ? currentTime : finalTime}
              stroke="rgba(255, 255, 255, 0.6)"
              strokeDasharray="5 5"
              label={{ 
                value: currentTime <= finalTime ? "Now" : "Vesting Complete", 
                position: "insideTop",
                offset: 25,
                style: { fill: "rgba(255, 255, 255, 0.9)", fontSize: "0.75rem", fontWeight: 600, textAnchor: "middle" }
              }}
            />
          )}
          {userVested > 0n && (
            <ReferenceLine
              y={Number(userVested)}
              stroke="rgba(16, 185, 129, 0.6)"
              strokeDasharray="5 5"
              label={{
                value: `Current: ${formatToken(userVested, tokenDecimals)} ${tokenSymbol}`,
                position: "right",
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
};

export default VestingChart;




