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
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 pt-10 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(168,85,247,0.8)] before:via-[rgba(6,182,212,0.8)] before:to-[rgba(168,85,247,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
        <h2 className="relative z-10 mb-8 bg-gradient-to-br from-white to-[#cbd5e1] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Weight Schedule</h2>
        <div className="p-8 text-center text-[rgba(255,255,255,0.6)]">
          <p>Loading weight schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 pt-10 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(168,85,247,0.8)] before:via-[rgba(6,182,212,0.8)] before:to-[rgba(168,85,247,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="relative z-10 mb-8 bg-gradient-to-br from-white to-[#cbd5e1] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Weight Schedule</h2>
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

