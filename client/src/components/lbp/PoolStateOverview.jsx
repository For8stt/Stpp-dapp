import React from "react";
import { CheckIcon, XIcon, WarningIcon } from "../common/Icons";
import { ethers } from "ethers";
import { formatEther, formatToken } from "../../utils/formatUtils";

// Volatility Indicator Component
const VolatilityIndicator = ({ lbpData }) => {
  if (!lbpData?.priceChangeBP) {
    return (
      <div 
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/20 border border-green-500/30"
        title="Transaction fees temporarily increase during periods of rapid price movement to discourage speculative trades. Fees automatically return to normal when volatility subsides."
      >
        <div className="w-2 h-2 rounded-full bg-green-400"></div>
        <span className="text-xs font-medium text-green-300">Low volatility</span>
      </div>
    );
  }

  const priceChangePercent = Number(lbpData.priceChangeBP) / 100;
  const thresholdLow = 5; // 5%
  const thresholdHigh = 10; // 10%

  let bgColor = "bg-green-500/20";
  let borderColor = "border-green-500/30";
  let dotColor = "bg-green-400";
  let textColor = "text-green-300";
  let text = "Low volatility";

  if (priceChangePercent >= thresholdHigh) {
    bgColor = "bg-red-500/20";
    borderColor = "border-red-500/30";
    dotColor = "bg-red-400";
    textColor = "text-red-300";
    text = "High volatility";
  } else if (priceChangePercent >= thresholdLow) {
    bgColor = "bg-yellow-500/20";
    borderColor = "border-yellow-500/30";
    dotColor = "bg-yellow-400";
    textColor = "text-yellow-300";
    text = "Elevated volatility";
  }

  return (
    <div 
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${bgColor} ${borderColor}`}
      title="Transaction fees temporarily increase during periods of rapid price movement to discourage speculative trades. Fees automatically return to normal when volatility subsides."
    >
      <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
      <span className={`text-xs font-medium ${textColor}`}>{text}</span>
    </div>
  );
};

const PoolStateOverview = ({
  lbpData,
  poolData,
  reserves,
  weights,
  spotPrice,
  adaptiveFee,
  totalTokensAllocated,
  totalEthRaised,
  userData,
}) => {
  if (!poolData && (!lbpData?.poolInitialized || !lbpData?.amm || lbpData.amm === ethers.ZeroAddress)) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(51,65,85,0.6)] bg-gradient-to-br from-[rgba(30,41,59,0.8)] to-[rgba(15,23,42,0.9)] p-8 backdrop-blur-[12px] backdrop-saturate-[180%] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_10px_10px_-5px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-[rgba(6,182,212,0.8)] before:via-[rgba(34,197,94,0.8)] before:to-[rgba(6,182,212,0.8)] before:bg-[length:200%_100%] before:animate-shimmer">
      <h2 className="relative z-10 mb-8 bg-gradient-to-br from-white to-[#cbd5e1] bg-clip-text text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-transparent">Pool State Overview</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="relative overflow-hidden rounded-xl border border-[rgba(34,197,94,0.3)] bg-gradient-to-br from-[rgba(34,197,94,0.15)] to-[rgba(22,163,74,0.08)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(34,197,94,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Token Reserve</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {reserves?.token !== null && reserves?.token !== undefined
              ? Number(formatToken(reserves.token, lbpData.tokenInfo?.decimals || 18)).toFixed(4)
              : poolData?.reserveToken
              ? Number(formatToken(poolData.reserveToken, lbpData.tokenInfo?.decimals || 18)).toFixed(4)
              : "0"}{" "}
            {lbpData.tokenInfo?.symbol || "tokens"}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(59,130,246,0.3)] bg-gradient-to-br from-[rgba(59,130,246,0.15)] to-[rgba(37,99,235,0.08)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(59,130,246,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">ETH Reserve</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {reserves?.eth !== null && reserves?.eth !== undefined
              ? formatEther(reserves.eth)
              : poolData?.reserveETH
              ? formatEther(poolData.reserveETH)
              : "0"} ETH
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(168,85,247,0.3)] bg-gradient-to-br from-[rgba(168,85,247,0.15)] to-[rgba(147,51,234,0.08)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(168,85,247,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Current Token Weight</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {weights?.token !== null && weights?.token !== undefined
              ? (Number(ethers.formatEther(weights.token)) * 100).toFixed(2)
              : poolData?.tokenWeight
              ? (Number(ethers.formatEther(poolData.tokenWeight)) * 100).toFixed(2)
              : "0.00"}%
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(236,72,153,0.3)] bg-gradient-to-br from-[rgba(236,72,153,0.15)] to-[rgba(219,39,119,0.08)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(236,72,153,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Current ETH Weight</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {weights?.eth !== null && weights?.eth !== undefined
              ? (Number(ethers.formatEther(weights.eth)) * 100).toFixed(2)
              : poolData?.ethWeight
              ? (Number(ethers.formatEther(poolData.ethWeight)) * 100).toFixed(2)
              : "0.00"}%
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(6,182,212,0.3)] bg-gradient-to-br from-[rgba(6,182,212,0.15)] to-[rgba(8,145,178,0.08)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(6,182,212,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Current Price</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {(spotPrice !== null && spotPrice !== undefined && spotPrice > 0)
              ? spotPrice.toFixed(6)
              : poolData?.price && poolData.price > 0
              ? poolData.price.toFixed(6)
              : "N/A"}{" "}
            ETH/{lbpData.tokenInfo?.symbol || "token"}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.4)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Total Tokens Allocated</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {totalTokensAllocated !== null && totalTokensAllocated !== undefined
              ? Number(formatToken(totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)).toFixed(4)
              : lbpData?.totalTokensAllocated
              ? Number(formatToken(lbpData.totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)).toFixed(4)
              : "0"}{" "}
            {lbpData.tokenInfo?.symbol || "tokens"}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.4)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Total ETH Raised</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {totalEthRaised !== null && totalEthRaised !== undefined
              ? formatEther(totalEthRaised)
              : lbpData?.totalEthRaised
              ? formatEther(lbpData.totalEthRaised)
              : "0"} ETH
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.4)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <div className="relative z-10 flex items-center justify-between mb-3">
            <h4 className="text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Transaction Fee</h4>
            <VolatilityIndicator lbpData={lbpData} />
          </div>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {adaptiveFee !== null && adaptiveFee !== undefined
              ? (Number(adaptiveFee) / 100).toFixed(2)
              : lbpData?.currentFee !== null && lbpData?.currentFee !== undefined
              ? (Number(lbpData.currentFee) / 100).toFixed(2)
              : "0.00"}%
            {(lbpData?.volatilityFeeBP && Number(lbpData.volatilityFeeBP) > 0) || (lbpData?.postPauseDecayFeeBP && Number(lbpData.postPauseDecayFeeBP) > 0) ? (
              <span className="ml-2 text-sm font-normal text-yellow-400">(volatility-adjusted)</span>
            ) : null}
          </p>
          {(lbpData?.volatilityFeeBP && Number(lbpData.volatilityFeeBP) > 0) || (lbpData?.postPauseDecayFeeBP && Number(lbpData.postPauseDecayFeeBP) > 0) ? (
            <p className="relative z-10 mt-2 text-xs text-[rgb(148,163,184)]">
              Base: {(Number(lbpData.baseFeeBP || 0) / 100).toFixed(2)}%
              {lbpData?.volatilityFeeBP && Number(lbpData.volatilityFeeBP) > 0 && (
                <> | Volatility: {(Number(lbpData.volatilityFeeBP) / 100).toFixed(2)}%</>
              )}
              {lbpData?.postPauseDecayFeeBP && Number(lbpData.postPauseDecayFeeBP) > 0 && (
                <> | Post-Pause: {(Number(lbpData.postPauseDecayFeeBP) / 100).toFixed(2)}%</>
              )}
            </p>
          ) : null}
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.4)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Max Contribution Per Address</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {formatEther(lbpData.maxContributionPerAddress)} ETH
          </p>
        </div>
        {userData && (
          <>
            <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.4)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
              <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Your Contribution</h4>
              <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                {formatEther(userData.totalContributed)} ETH
              </p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-[rgba(71,85,105,0.4)] bg-gradient-to-br from-[rgba(51,65,85,0.4)] to-[rgba(30,41,59,0.5)] p-6 backdrop-blur-[8px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.2)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.4),0_10px_10px_-5px_rgba(0,0,0,0.3)] hover:before:opacity-100">
              <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Your Allocation</h4>
              <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                {Number(formatToken(
                  userData.allocation,
                  lbpData.tokenInfo?.decimals || 18
                )).toFixed(4)}{" "}
                {lbpData.tokenInfo?.symbol || "tokens"}
              </p>
            </div>
          </>
        )}
        {/* Debug Panel for Post-Pause Decay - Show if we have any debug data or postPauseDecayFeeBP */}
        {(lbpData?.postPauseDecayDebug || (lbpData?.postPauseDecayFeeBP && Number(lbpData.postPauseDecayFeeBP) > 0)) && (
            <div className="relative z-10 mt-3 p-3 bg-[rgba(0,0,0,0.3)] rounded border border-[rgba(255,255,255,0.1)]">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-yellow-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Post-Pause Decay Debug:
              </p>
              <div className="text-xs text-[rgb(148,163,184)] space-y-1">
                {lbpData?.postPauseDecayDebug ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[rgb(100,116,139)]">lastUnpauseTime:</div>
                        <div className="font-mono">{lbpData.postPauseDecayDebug.lastUnpauseTime || "0"}</div>
                      </div>
                      <div>
                        <div className="text-[rgb(100,116,139)]">elapsedTime:</div>
                        <div className="font-mono">{lbpData.postPauseDecayDebug.elapsedTime || "0"}s</div>
                      </div>
                      <div>
                        <div className="text-[rgb(100,116,139)]">lastPausedUntil:</div>
                        <div className="font-mono">{lbpData.postPauseDecayDebug.lastPausedUntil || "0"}</div>
                      </div>
                      <div>
                        <div className="text-[rgb(100,116,139)]">pausedUntil (oracle):</div>
                        <div className="font-mono">{lbpData.postPauseDecayDebug.pausedUntil || "0"}</div>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.1)]">
                      <div>postPauseDecayFeeBP: <span className="font-mono">{lbpData.postPauseDecayDebug.postPauseDecayFeeBP || "0"}</span> ({((Number(lbpData.postPauseDecayDebug.postPauseDecayFeeBP || 0) / 100).toFixed(2))}%)</div>
                      <div>currentStep: <span className="font-mono">{lbpData.postPauseDecayDebug.currentStep || "0"}</span> (1=10%, 2=6%, 3=3%)</div>
                    </div>
                    {lbpData.postPauseDecayDebug.lastUnpauseTime && Number(lbpData.postPauseDecayDebug.lastUnpauseTime) > 0 ? (
                      <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.1)]">
                        <div className="flex items-center gap-2 text-yellow-300">
                          <CheckIcon className="h-4 w-4" />
                          Decay Active
                        </div>
                        <div>Time since unpause: {Math.floor(Number(lbpData.postPauseDecayDebug.elapsedTime || 0) / 60)}m {Number(lbpData.postPauseDecayDebug.elapsedTime || 0) % 60}s</div>
                        {lbpData.postPauseDecayDebug.lastPausedUntil && Number(lbpData.postPauseDecayDebug.lastPausedUntil) > 0 && (
                          <div className="mt-1 text-[rgb(100,116,139)]">
                            Pause ended at: {new Date(Number(lbpData.postPauseDecayDebug.lastPausedUntil) * 1000).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.1)]">
                        <div className="flex items-center gap-2 text-red-300">
                          <XIcon className="h-4 w-4" />
                          Decay NOT Active
                        </div>
                        <div className="text-[rgb(100,116,139)]">lastUnpauseTime is 0 - decay not initialized</div>
                        {lbpData.postPauseDecayDebug.lastPausedUntil && Number(lbpData.postPauseDecayDebug.lastPausedUntil) > 0 && (
                          <div className="mt-1 text-[rgb(100,116,139)]">
                            Last pause ended at: {new Date(Number(lbpData.postPauseDecayDebug.lastPausedUntil) * 1000).toLocaleTimeString()}
                            {Number(lbpData.postPauseDecayDebug.lastPausedUntil) > 0 && (
                              <span className="ml-2">
                                ({Math.floor((Date.now() / 1000 - Number(lbpData.postPauseDecayDebug.lastPausedUntil)) / 60)}m ago)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-red-300">
                      <WarningIcon className="h-4 w-4" />
                      Debug data not available
                    </div>
                    <div className="text-[rgb(100,116,139)] mt-1">
                      postPauseDecayFeeBP: {lbpData?.postPauseDecayFeeBP ? (Number(lbpData.postPauseDecayFeeBP) / 100).toFixed(2) + "%" : "0%"}
                    </div>
                    <div className="text-[rgb(100,116,139)] mt-1">
                      Contract may not have getPostPauseDecayDebug() function. Try reading lastUnpauseTime and lastPausedUntil directly.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default PoolStateOverview;

