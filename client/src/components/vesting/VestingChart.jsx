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
import styles from "./css/VestingChart.module.css";

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

  return (
    <div className={styles.chartPanel}>
      <h2 className={styles.sectionTitle}>Vesting Curve</h2>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={vestingCurveData}>
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
          {currentTime >= vestingStart && currentTime <= finalTime && (
            <ReferenceLine
              x={currentTime}
              stroke="rgba(255, 255, 255, 0.6)"
              strokeDasharray="5 5"
              label={{ value: "Now", position: "top" }}
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
  );
};

export default VestingChart;



