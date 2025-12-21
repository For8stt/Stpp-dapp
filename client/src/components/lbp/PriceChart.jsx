import React from "react";
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

const PriceChart = ({ chartData, lbpData, poolData, spotPrice, currentTime }) => {
  if (!poolData || !lbpData) {
    return null;
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 pt-10 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(168,85,247,0.8)] before:via-[rgba(6,182,212,0.8)] before:to-[rgba(168,85,247,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
        <h2 className="relative z-10 mb-8 bg-gradient-to-br from-white to-[#cbd5e1] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Price Chart (Live)</h2>
        <div className="p-8 text-center text-[rgba(255,255,255,0.6)]">
          <p>Waiting for price data...</p>
        </div>
      </div>
    );
  }

  const sortedChartData = [...chartData].sort((a, b) => a.timestamp - b.timestamp);
  let currentPrice = null;
  
  if (currentTime >= lbpData.startTime && currentTime <= lbpData.endTime && sortedChartData.length > 0) {

    let beforePoint = null;
    let afterPoint = null;
    
    for (let i = 0; i < sortedChartData.length; i++) {
      const point = sortedChartData[i];
      if (point.timestamp <= currentTime) {
        beforePoint = point;
      }
      if (point.timestamp >= currentTime && !afterPoint) {
        afterPoint = point;
        break;
      }
    }
    if (beforePoint && beforePoint.timestamp === currentTime) {
      currentPrice = beforePoint.price;
    } else if (afterPoint && afterPoint.timestamp === currentTime) {
      currentPrice = afterPoint.price;
    } else if (beforePoint && afterPoint) {

      const timeDiff = afterPoint.timestamp - beforePoint.timestamp;
      const timeRatio = (currentTime - beforePoint.timestamp) / timeDiff;
      currentPrice = beforePoint.price + (afterPoint.price - beforePoint.price) * timeRatio;
    } else if (beforePoint) {
      currentPrice = beforePoint.price;
    } else if (afterPoint) {

      currentPrice = afterPoint.price;
    } else {

      currentPrice = (spotPrice !== null && spotPrice !== undefined && spotPrice > 0) 
        ? spotPrice 
        : (poolData?.price && poolData.price > 0) 
          ? poolData.price 
          : null;
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 pt-10 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(168,85,247,0.8)] before:via-[rgba(6,182,212,0.8)] before:to-[rgba(168,85,247,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="relative z-10 mb-8 bg-gradient-to-br from-white to-[#cbd5e1] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Price Chart (Live)</h2>
      <ResponsiveContainer width="100%" height={500}>
        <LineChart 
          data={sortedChartData}
          margin={{ top: 30, right: 50, left: 20, bottom: 40 }}
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
              lbpData.startTime || 'dataMin',
              lbpData.endTime || 'dataMax'
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
            domain={['auto', 'auto']}
            label={{
              value: "Price (ETH/token)",
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
              `${Number(value).toFixed(6)} ETH/token`,
              "Price",
            ]}
            labelFormatter={(label) => {
              const date = new Date(Number(label) * 1000);
              return `Time: ${date.toLocaleTimeString()}`;
            }}
          />
          <Legend />
          <Line
            type="linear"
            dataKey="price"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
            name="Price (ETH/token)"
            connectNulls={true}
            isAnimationActive={false}
          />
          {currentTime >= lbpData.startTime &&
            currentTime <= lbpData.endTime && (
              <>
                <ReferenceLine
                  x={currentTime}
                  stroke="rgba(255, 255, 255, 0.6)"
                  strokeDasharray="5 5"
                  label={{ value: "Cur", position: "top", style: { fill: "rgba(255, 255, 255, 0.6)", fontSize: "0.75rem" } }}
                />
                {currentPrice !== null && currentPrice > 0 && (
                  <ReferenceLine
                    y={currentPrice}
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeDasharray="5 5"
                    label={{
                      value: "Cur",
                      position: "right",
                      style: { fill: "rgba(255, 255, 255, 0.6)", fontSize: "0.75rem" }
                    }}
                  />
                )}
              </>
            )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceChart;

