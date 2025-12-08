import React, { useMemo } from "react";
import { ethers } from "ethers";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import styles from "../../pages/css/LBPView.module.css";

const WeightScheduleChart = ({
  weightScheduleData,
  lbpData,
  poolData,
  weights,
  currentTime,
}) => {
  const currentTimePoint = useMemo(() => {
    if (
      !weightScheduleData.length ||
      currentTime < lbpData?.startTime ||
      currentTime > lbpData?.endTime
    ) {
      return null;
    }
    return weightScheduleData.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.timestamp - currentTime);
      const currDiff = Math.abs(curr.timestamp - currentTime);
      return currDiff < prevDiff ? curr : prev;
    });
  }, [weightScheduleData, currentTime, lbpData?.startTime, lbpData?.endTime]);

  if (!poolData || !lbpData) {
    return null;
  }

  if (weightScheduleData.length === 0) {
    return (
      <div className={styles.chartPanel}>
        <h2 className={styles.chartTitle}>Weight Schedule</h2>
        <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255, 255, 255, 0.6)" }}>
          <p>Loading weight schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chartPanel}>
      <h2 className={styles.chartTitle}>Weight Schedule</h2>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart 
          data={[...weightScheduleData].sort((a, b) => a.timestamp - b.timestamp)}
          margin={{ top: 60, right: 30, bottom: 20, left: 20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255, 255, 255, 0.1)"
          />
          <XAxis
            dataKey="timestamp"
            stroke="rgba(255, 255, 255, 0.6)"
            style={{ fontSize: "0.75rem" }}
            type="number"
            scale="linear"
            domain={[
              lbpData?.startTime || 'dataMin',
              lbpData?.endTime || 'dataMax'
            ]}
            tickFormatter={(value) => {
              const date = new Date(Number(value) * 1000);
              return date.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
              });
            }}
            allowDuplicatedCategory={false}
            label={{
              value: "Time",
              position: "insideBottom",
              offset: -5,
              style: { fill: "rgba(255, 255, 255, 0.6)", fontSize: "0.75rem" },
            }}
          />
          <YAxis
            stroke="rgba(255, 255, 255, 0.6)"
            style={{ fontSize: "0.75rem" }}
            label={{
              value: "Weight (%)",
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
            formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
          />
          <Legend />
          <Line
            type="linear"
            dataKey="ethWeight"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="ETH Weight (%)"
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="tokenWeight"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={false}
            name="Token Weight (%)"
            isAnimationActive={false}
          />
          {(weights?.eth !== null && weights?.eth !== undefined) || poolData ? (
            <>
              <ReferenceLine
                y={(weights?.eth !== null && weights?.eth !== undefined
                  ? Number(ethers.formatEther(weights.eth))
                  : Number(ethers.formatEther(poolData.ethWeight))) * 100}
                stroke="#8b5cf6"
                strokeDasharray="5 5"
                strokeOpacity={0.7}
                label={{
                  value: `ETH: ${((weights?.eth !== null && weights?.eth !== undefined
                    ? Number(ethers.formatEther(weights.eth))
                    : Number(ethers.formatEther(poolData.ethWeight))) * 100).toFixed(2)}%`,
                  position: "right",
                  style: { fill: "#8b5cf6", fontSize: "0.75rem", fontWeight: "bold" },
                }}
              />
              <ReferenceLine
                y={(weights?.token !== null && weights?.token !== undefined
                  ? Number(ethers.formatEther(weights.token))
                  : Number(ethers.formatEther(poolData.tokenWeight))) * 100}
                stroke="#06b6d4"
                strokeDasharray="5 5"
                strokeOpacity={0.7}
                label={{
                  value: `Token: ${((weights?.token !== null && weights?.token !== undefined
                    ? Number(ethers.formatEther(weights.token))
                    : Number(ethers.formatEther(poolData.tokenWeight))) * 100).toFixed(2)}%`,
                  position: "right",
                  style: { fill: "#06b6d4", fontSize: "0.75rem", fontWeight: "bold" },
                }}
              />
            </>
          ) : null}
          {currentTimePoint && ((weights?.eth !== null && weights?.eth !== undefined) || poolData) && (
            <>
              <ReferenceLine
                x={currentTimePoint.timestamp}
                stroke="rgba(255, 255, 255, 0.8)"
                strokeDasharray="5 5"
                strokeWidth={2}
              />
              <ReferenceLine
                x={currentTimePoint.timestamp}
                label={({ viewBox }) => {
                  if (!viewBox || viewBox.y < 50) return null;
                  const currentEthWeight = weights?.eth !== null && weights?.eth !== undefined
                    ? weights.eth
                    : poolData.ethWeight;
                  const currentTokenWeight = weights?.token !== null && weights?.token !== undefined
                    ? weights.token
                    : poolData.tokenWeight;
                  const ethWeightPercent = (Number(ethers.formatEther(currentEthWeight)) * 100).toFixed(2);
                  const tokenWeightPercent = (Number(ethers.formatEther(currentTokenWeight)) * 100).toFixed(2);
                  const blockY = Math.max(10, viewBox.y - 50);
                  return (
                    <g>
                      <rect
                        x={viewBox.x - 85}
                        y={blockY}
                        width={170}
                        height={45}
                        fill="rgba(15, 23, 42, 0.95)"
                        stroke="rgba(255, 255, 255, 0.3)"
                        strokeWidth={1}
                        rx={6}
                      />
                      <text
                        x={viewBox.x}
                        y={blockY + 18}
                        textAnchor="middle"
                        fill="#8b5cf6"
                        fontSize="0.75rem"
                        fontWeight="bold"
                      >
                        ETH Weight: {ethWeightPercent}%
                      </text>
                      <text
                        x={viewBox.x}
                        y={blockY + 33}
                        textAnchor="middle"
                        fill="#06b6d4"
                        fontSize="0.75rem"
                        fontWeight="bold"
                      >
                        Token Weight: {tokenWeightPercent}%
                      </text>
                    </g>
                  );
                }}
                alwaysShow={true}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WeightScheduleChart;

