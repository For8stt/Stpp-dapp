import React, { useState } from "react";
import { ethers } from "ethers";
import Tooltip from "./Tooltip";

const PostLbpSettlement = ({
  lbpState,
  currentTime,
  settlementForm,
  onSettlementFormChange,
  onSetMax,
  onSetPercentage,
  onUnwindLiquidity,
  onConfigureUniswapV3,
  onExecuteSettlement,
  unwindingLiquidity,
  uniswapConfiguring,
  settlementExecuting,
  settlementStep,
  settlementResults,
  onCloseResults
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!lbpState.finalized) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 to-slate-900/85 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-[20px] transition-all duration-300 hover:border-white/15 hover:shadow-[0_25px_60px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:p-6 sm:p-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Post-LBP Settlement</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10 transition-colors flex items-center gap-2"
          title={isExpanded ? "Collapse panel" : "Expand panel"}
        >
          <span className="text-lg">{isExpanded ? "▼" : "▶"}</span>
          <span>{isExpanded ? "Collapse" : "Expand"}</span>
        </button>
      </div>
      
      {isExpanded && (
        <>
          {/* Status Section */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Status</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span className="text-sm text-white/70">SecureLBP ETH Balance:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {ethers.formatEther(lbpState.ethBalance ?? 0n)} ETH
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">SecureLBP Token Balance:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {ethers.formatEther(lbpState.tokenBalance ?? 0n)} tokens
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">Finalized:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {lbpState.finalized ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">End Time:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {lbpState.endTime ? new Date(lbpState.endTime * 1000).toLocaleString() : "N/A"}
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">Current Time:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {new Date(currentTime * 1000).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">Uniswap Migration:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {lbpState.uniswapLiquidityCreated ? "Completed" : "Not started"}
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">LP Balance in Pool:</span>
                <p className="m-0 mt-1 font-mono text-base font-medium text-white">
                  {ethers.formatEther(lbpState.lpBalance ?? 0n)} LP tokens
                </p>
              </div>
            </div>
          </div>

          {/* Unwind Liquidity Section */}
          {(lbpState.lpBalance ?? 0n) > 0n && (
            <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-6">
              <h3 className="mb-3 text-lg font-semibold text-white">Unwind Liquidity</h3>
              <p className="mb-4 text-sm text-white/70">
                You have {ethers.formatEther(lbpState.lpBalance ?? 0n)} LP tokens in the LBP pool. 
                Unwind them first to retrieve ETH and tokens before migration or withdrawal.
              </p>
              <button
                onClick={onUnwindLiquidity}
                disabled={unwindingLiquidity || settlementExecuting}
                className="w-full rounded-xl border-0 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100"
              >
                {unwindingLiquidity ? "Unwinding Liquidity…" : "Unwind Liquidity from Pool"}
              </button>
            </div>
          )}

          {/* Asset Split Section */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Asset Split</h3>
            
            {/* ETH Split */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-white/90">
                ETH to Uniswap
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={settlementForm.ethToUniswap}
                  onChange={(e) => onSettlementFormChange("ethToUniswap", e.target.value)}
                  placeholder="0.0"
                  disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 pr-24 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onSetPercentage("eth", 25)}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetPercentage("eth", 50)}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetPercentage("eth", 75)}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetMax("eth")}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-semibold text-white hover:text-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 rounded border border-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-white/60">
                ETH to Treasury: {ethers.formatEther(
                  (lbpState.ethBalance ?? 0n) - (settlementForm.ethToUniswap ? ethers.parseEther(settlementForm.ethToUniswap) : 0n)
                )} ETH
              </p>
            </div>

            {/* Token Split */}
            <div>
              <label className="mb-2 block text-sm font-medium text-white/90">
                Tokens to Uniswap
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={settlementForm.tokensToUniswap}
                  onChange={(e) => onSettlementFormChange("tokensToUniswap", e.target.value)}
                  placeholder="0.0"
                  disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 pr-24 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onSetPercentage("tokens", 25)}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetPercentage("tokens", 50)}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetPercentage("tokens", 75)}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetMax("tokens")}
                    disabled={settlementExecuting || lbpState.uniswapLiquidityCreated}
                    className="px-2 py-1 text-xs font-semibold text-white hover:text-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 rounded border border-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-white/60">
                Tokens to Treasury: {ethers.formatEther(
                  (lbpState.tokenBalance ?? 0n) - (settlementForm.tokensToUniswap ? ethers.parseEther(settlementForm.tokensToUniswap) : 0n)
                )} tokens
              </p>
              {((settlementForm.ethToUniswap && parseFloat(settlementForm.ethToUniswap) > 0 && (!settlementForm.tokensToUniswap || parseFloat(settlementForm.tokensToUniswap) === 0)) ||
                (settlementForm.tokensToUniswap && parseFloat(settlementForm.tokensToUniswap) > 0 && (!settlementForm.ethToUniswap || parseFloat(settlementForm.ethToUniswap) === 0))) && (
                <p className="mt-2 text-sm text-yellow-400">
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Uniswap V3 migration requires both ETH and tokens. Enter both amounts to migrate, or leave both empty to withdraw everything to treasury.
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Uniswap V3 Configuration Section */}
          {(() => {
            const needsUniswapConfig = settlementForm.ethToUniswap && settlementForm.tokensToUniswap &&
              parseFloat(settlementForm.ethToUniswap) > 0 && parseFloat(settlementForm.tokensToUniswap) > 0 &&
              !lbpState.uniswapLiquidityCreated;
            
            if (!needsUniswapConfig) return null;

            return (
              <div className="mb-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Uniswap V3 Configuration</h3>
                <p className="mb-4 text-sm text-white/70">
                  Before migrating to Uniswap V3, you need to configure the Uniswap V3 contract addresses. 
                  For localhost, you may need to deploy Uniswap V3 contracts or use mock addresses.
                </p>
                
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-white/90">
                    Uniswap V3 Factory Address
                  </label>
                  <input
                    type="text"
                    value={settlementForm.uniswapFactory}
                    onChange={(e) => onSettlementFormChange("uniswapFactory", e.target.value)}
                    placeholder="0x..."
                    disabled={uniswapConfiguring || settlementExecuting}
                    className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>

                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-white/90">
                    Uniswap V3 Position Manager Address
                  </label>
                  <input
                    type="text"
                    value={settlementForm.uniswapPositionManager}
                    onChange={(e) => onSettlementFormChange("uniswapPositionManager", e.target.value)}
                    placeholder="0x..."
                    disabled={uniswapConfiguring || settlementExecuting}
                    className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>

                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-white/90">
                    WETH9 Address
                  </label>
                  <input
                    type="text"
                    value={settlementForm.weth}
                    onChange={(e) => onSettlementFormChange("weth", e.target.value)}
                    placeholder="0x..."
                    disabled={uniswapConfiguring || settlementExecuting}
                    className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>

                <button
                  onClick={onConfigureUniswapV3}
                  disabled={uniswapConfiguring || settlementExecuting || !settlementForm.uniswapFactory || !settlementForm.uniswapPositionManager || !settlementForm.weth}
                  className="w-full rounded-xl border-0 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100"
                >
                  {uniswapConfiguring ? "Configuring…" : "Configure Uniswap V3"}
                </button>
              </div>
            );
          })()}

          {/* Uniswap V3 Parameters Section */}
          {settlementForm.ethToUniswap && settlementForm.tokensToUniswap &&
           parseFloat(settlementForm.ethToUniswap) > 0 && parseFloat(settlementForm.tokensToUniswap) > 0 &&
           !lbpState.uniswapLiquidityCreated && (
            <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Uniswap V3 Parameters</h3>
              
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-white/90">
                  <Tooltip text="Fee Tier: The trading fee percentage for this Uniswap V3 pool. Lower fees (0.05%) are better for stable pairs, higher fees (1%) for volatile pairs. 0.3% is the most common choice for most tokens.">
                    Fee Tier
                  </Tooltip>
                </label>
                <select
                  value={settlementForm.feeTier}
                  onChange={(e) => onSettlementFormChange("feeTier", e.target.value)}
                  disabled={settlementExecuting}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                >
                  <option value="500">0.05% (500) - Best for stable pairs</option>
                  <option value="3000">0.3% (3000) - Recommended for most tokens</option>
                  <option value="10000">1% (10000) - Best for volatile pairs</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-white/90">
                  <input
                    type="checkbox"
                    checked={settlementForm.useFullRange}
                    onChange={(e) => onSettlementFormChange("useFullRange", e.target.checked)}
                    disabled={settlementExecuting}
                    className="rounded"
                  />
                  <Tooltip text="Use Full Range: When checked, liquidity covers the entire price range (-887272 to 887272 ticks). This is recommended for most cases as it ensures your liquidity is always active regardless of price movement. Uncheck only if you want to concentrate liquidity in a specific price range.">
                    Use Full Range (Recommended)
                  </Tooltip>
                </label>
              </div>

              {!settlementForm.useFullRange && (
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/90">
                      <Tooltip text="Tick Lower: The lower bound of the price range for your liquidity position. Ticks are discrete price points in Uniswap V3. Lower tick = lower price bound. Must be less than Tick Upper. Full range is -887272.">
                        Tick Lower
                      </Tooltip>
                    </label>
                    <input
                      type="number"
                      value={settlementForm.tickLower}
                      onChange={(e) => onSettlementFormChange("tickLower", e.target.value)}
                      placeholder="-887272"
                      disabled={settlementExecuting}
                      className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/90">
                      <Tooltip text="Tick Upper: The upper bound of the price range for your liquidity position. Ticks are discrete price points in Uniswap V3. Upper tick = upper price bound. Must be greater than Tick Lower. Full range is 887272.">
                        Tick Upper
                      </Tooltip>
                    </label>
                    <input
                      type="number"
                      value={settlementForm.tickUpper}
                      onChange={(e) => onSettlementFormChange("tickUpper", e.target.value)}
                      placeholder="887272"
                      disabled={settlementExecuting}
                      className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-white/90">
                  <Tooltip text="Initial Price (sqrtPriceX96): The square root of the initial price ratio (token1/token0) multiplied by 2^96, in Q64.96 fixed-point format. This is used ONLY when creating a new pool that doesn't exist yet. If the pool already exists, this value is ignored. Calculate: sqrt(price) * 2^96, where price = amount of token1 per token0. Example: For 1 ETH = 1000 tokens, price = 1000, sqrt(1000) ≈ 31.62, sqrtPriceX96 ≈ 79228162514264337593543950336.">
                  Initial Price (sqrtPriceX96)
                  </Tooltip>
                </label>
                <input
                  type="text"
                  value={settlementForm.sqrtPriceX96}
                  onChange={(e) => onSettlementFormChange("sqrtPriceX96", e.target.value)}
                  placeholder="79228162514264337593543950336"
                  disabled={settlementExecuting}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-white/60">
                  Used only if pool does not exist. Format: Q64.96 fixed-point. Leave empty if pool already exists.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/90">
                  <Tooltip text="LP Recipient Address: The Ethereum address that will receive the Uniswap V3 LP position NFT (Non-Fungible Token). This NFT represents your liquidity position and can be used to manage, collect fees, or remove liquidity later. Typically, this should be your treasury address or a wallet you control. The NFT will be minted to this address after successful migration.">
                    LP Recipient Address
                  </Tooltip>
                </label>
                <input
                  type="text"
                  value={settlementForm.lpRecipient}
                  onChange={(e) => onSettlementFormChange("lpRecipient", e.target.value)}
                  placeholder="0x..."
                  disabled={settlementExecuting}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={onExecuteSettlement}
              disabled={
                settlementExecuting ||
                !lbpState.finalized ||
                (lbpState.endTime && currentTime <= lbpState.endTime) ||
                (() => {
                  const ethToUniswap = settlementForm.ethToUniswap ? parseFloat(settlementForm.ethToUniswap) : 0;
                  const tokensToUniswap = settlementForm.tokensToUniswap ? parseFloat(settlementForm.tokensToUniswap) : 0;
                  
                  // Disable if nothing is entered
                  if (ethToUniswap === 0 && tokensToUniswap === 0) {
                    return true; // Nothing to do if user hasn't entered anything
                  }
                  
                  const wantsMigration = ethToUniswap > 0 && tokensToUniswap > 0;
                  
                  // If user wants migration, check required fields
                  if (wantsMigration) {
                    return !settlementForm.sqrtPriceX96 || !settlementForm.lpRecipient || lbpState.uniswapLiquidityCreated;
                  }
                  
                  // If user entered only one value (partial migration), disable
                  if ((ethToUniswap > 0 && tokensToUniswap === 0) || (tokensToUniswap > 0 && ethToUniswap === 0)) {
                    return true; // Need both ETH and tokens for migration
                  }
                  
                  // Validate values
                  const ethBalance = parseFloat(ethers.formatEther(lbpState.ethBalance ?? 0n));
                  const tokenBalance = parseFloat(ethers.formatEther(lbpState.tokenBalance ?? 0n));
                  
                  if (ethToUniswap < 0 || tokensToUniswap < 0) return true; // Negative values
                  if (ethToUniswap > ethBalance || tokensToUniswap > tokenBalance) return true; // Exceeds balance
                  
                  // If user entered values but nothing will be withdrawn to treasury, disable
                  const ethToTreasury = ethBalance - ethToUniswap;
                  const tokensToTreasury = tokenBalance - tokensToUniswap;
                  return ethToTreasury <= 0 && tokensToTreasury <= 0;
                })()
              }
              className="flex-1 rounded-xl border-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-green-400 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100"
            >
              {settlementExecuting 
                ? (settlementStep || "Executing…")
                : "Execute Post-LBP Settlement"
              }
            </button>
          </div>

          {settlementStep && (
            <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-100">
              <p className="m-0 text-sm font-medium">{settlementStep}</p>
            </div>
          )}

          {/* Settlement Results */}
          {settlementResults && (
            <div className="mt-6 rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 to-green-800/10 p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-green-400">
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Settlement Completed Successfully
                  </span>
                </h3>
                <button
                  onClick={onCloseResults}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                    Execution Time
                  </p>
                  <p className="font-mono text-sm text-white">
                    {new Date(settlementResults.timestamp).toLocaleString()}
                  </p>
                </div>

                {settlementResults.unwind && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <svg className="h-5 w-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <p className="text-sm font-semibold text-blue-300">Liquidity Unwound</p>
                    </div>
                    <div className="space-y-1 text-xs text-blue-100">
                      <p className="font-mono">Tx: {settlementResults.unwind.hash.slice(0, 10)}...{settlementResults.unwind.hash.slice(-8)}</p>
                      <p>Block: {settlementResults.unwind.blockNumber?.toString()}</p>
                    </div>
                  </div>
                )}

                {settlementResults.migrate && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <svg className="h-5 w-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <p className="text-sm font-semibold text-purple-300">Migrated to Uniswap V3</p>
                    </div>
                    <div className="space-y-2 text-xs text-purple-100">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-white/60">ETH Amount:</p>
                          <p className="font-mono font-semibold">{settlementResults.migrate.ethAmount} ETH</p>
                        </div>
                        <div>
                          <p className="text-white/60">Token Amount:</p>
                          <p className="font-mono font-semibold">{settlementResults.migrate.tokenAmount} tokens</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-white/60">LP Recipient:</p>
                        <p className="font-mono break-all">{settlementResults.migrate.lpRecipient}</p>
                      </div>
                      <div>
                        <p className="text-white/60">Fee Tier:</p>
                        <p className="font-mono">{settlementResults.migrate.feeTier} ({Number(settlementResults.migrate.feeTier) / 10000}%)</p>
                      </div>
                      <p className="font-mono text-white/80">Tx: {settlementResults.migrate.hash.slice(0, 10)}...{settlementResults.migrate.hash.slice(-8)}</p>
                      <p className="text-white/80">Block: {settlementResults.migrate.blockNumber?.toString()}</p>
                    </div>
                  </div>
                )}

                {settlementResults.withdrawEth && (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <svg className="h-5 w-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-semibold text-cyan-300">ETH Withdrawn to Treasury</p>
                    </div>
                    <div className="space-y-1 text-xs text-cyan-100">
                      <p className="font-mono font-semibold text-base">{settlementResults.withdrawEth.amount} ETH</p>
                      <p className="font-mono">Tx: {settlementResults.withdrawEth.hash.slice(0, 10)}...{settlementResults.withdrawEth.hash.slice(-8)}</p>
                      <p>Block: {settlementResults.withdrawEth.blockNumber?.toString()}</p>
                    </div>
                  </div>
                )}

                {settlementResults.withdrawTokens && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-lg">🪙</span>
                      <p className="text-sm font-semibold text-yellow-300">Tokens Withdrawn to Treasury</p>
                    </div>
                    <div className="space-y-1 text-xs text-yellow-100">
                      <p className="font-mono font-semibold text-base">{settlementResults.withdrawTokens.amount} tokens</p>
                      <p className="font-mono">Tx: {settlementResults.withdrawTokens.hash.slice(0, 10)}...{settlementResults.withdrawTokens.hash.slice(-8)}</p>
                      <p>Block: {settlementResults.withdrawTokens.blockNumber?.toString()}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
                    Final Balances (SecureLBP)
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-white/60">ETH:</p>
                      <p className="font-mono font-semibold text-white">{settlementResults.finalBalances.eth} ETH</p>
                    </div>
                    <div>
                      <p className="text-white/60">Tokens:</p>
                      <p className="font-mono font-semibold text-white">{settlementResults.finalBalances.tokens} tokens</p>
                    </div>
                    <div>
                      <p className="text-white/60">LP:</p>
                      <p className="font-mono font-semibold text-white">{settlementResults.finalBalances.lp} LP</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PostLbpSettlement;

