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
            formatter={(value) => [
              `${formatToken(BigInt(value), tokenDecimals)} ${tokenSymbol}`,
              "Vested",
            ]}
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




