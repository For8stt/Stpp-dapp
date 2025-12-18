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
import styles from "../../pages/css/LBPView.module.css";

const PriceChart = ({ chartData, lbpData, poolData, spotPrice, currentTime }) => {
  if (!poolData || !lbpData) {
    return null;
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className={styles.chartPanel}>
        <h2 className={styles.chartTitle}>Price Chart (Live)</h2>
        <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255, 255, 255, 0.6)" }}>
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
    <div className={styles.chartPanel}>
      <h2 className={styles.chartTitle}>Price Chart (Live)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart 
          data={sortedChartData}
          margin={{ top: 10, right: 40, left: 20, bottom: 40 }}
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

