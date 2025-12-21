import React from "react";
import { ethers } from "ethers";
import { formatEther, formatToken } from "../../utils/formatUtils";

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
              ? formatToken(reserves.token, lbpData.tokenInfo?.decimals || 18)
              : poolData?.reserveToken
              ? formatToken(poolData.reserveToken, lbpData.tokenInfo?.decimals || 18)
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
              ? formatToken(totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)
              : lbpData?.totalTokensAllocated
              ? formatToken(lbpData.totalTokensAllocated, lbpData.tokenInfo?.decimals || 18)
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
          <h4 className="relative z-10 mb-3 text-[0.8125rem] font-semibold uppercase tracking-wider text-[rgb(148,163,184)]">Adaptive Fee</h4>
          <p className="relative z-10 text-2xl font-extrabold leading-tight text-white text-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {adaptiveFee !== null && adaptiveFee !== undefined
              ? (Number(adaptiveFee) / 100).toFixed(2)
              : lbpData?.currentFee !== null && lbpData?.currentFee !== undefined
              ? (Number(lbpData.currentFee) / 100).toFixed(2)
              : "0.00"}%
          </p>
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
                {formatToken(
                  userData.allocation,
                  lbpData.tokenInfo?.decimals || 18
                )}{" "}
                {lbpData.tokenInfo?.symbol || "tokens"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PoolStateOverview;

