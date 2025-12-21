import React, { useState } from "react";
import { JsonRpcProvider } from "ethers";
import { useChainId } from "wagmi";
import { showTxSuccess } from "../../utils/txErrorHandler";
import { handleTxError } from "../../utils/txErrorHandler";

/**
 * Developer-only component to fast-forward time on local development networks
 * Only visible on localhost/hardhat networks (chainId 31337)
 * @param {Function} onTimeAdvanced - Callback when time is advanced
 * @param {boolean} useDays - If true, use days instead of minutes
 */
const DeveloperTimeControls = ({ onTimeAdvanced, useDays = false }) => {
  const chainId = useChainId();
  const [minutes, setMinutes] = useState("");
  const [days, setDays] = useState("");
  const [loading, setLoading] = useState(false);

  const isLocalNetwork = chainId === 31337 || chainId === 1337 || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (!isLocalNetwork) {
    return null;
  }

  /**
   * Fast-forward time on the local blockchain
   * Connects directly to Hardhat node to use Hardhat-specific RPC methods
   * @param {number} amountSec - Number of seconds to advance
   */
  const fastForwardTime = async (amountSec) => {
    // Connect directly to Hardhat node
    // Hardhat RPC endpoint is typically http://127.0.0.1:8545
    const hardhatRpcUrl = "http://127.0.0.1:8545";
    const provider = new JsonRpcProvider(hardhatRpcUrl);
    
    try {
      const currentBlock = await provider.getBlock("latest");
      const currentTimestamp = currentBlock?.timestamp || Math.floor(Date.now() / 1000);

      await provider.send("evm_increaseTime", [amountSec]);
      

      for (let i = 0; i < 5; i++) {
        await provider.send("evm_mine", []);
      }

      const newBlock = await provider.getBlock("latest");
      const newTimestamp = newBlock?.timestamp || 0;
      const actualIncrease = newTimestamp - currentTimestamp;
      
      console.log(`Time fast-forward: ${currentTimestamp} -> ${newTimestamp} (increased by ${actualIncrease} seconds)`);
      
      if (actualIncrease < amountSec * 0.9) {
        console.warn(`Timestamp may not have advanced fully. Expected ~${amountSec} seconds, got ${actualIncrease} seconds`);
      }
    } catch (error) {
      if (error.message?.includes("hardhat_setNextBlockTimestamp") || error.code === -32601) {
        try {
          console.log("Falling back to evm_increaseTime method");
          await provider.send("evm_increaseTime", [amountSec]);
          for (let i = 0; i < 3; i++) {
            await provider.send("evm_mine", []);
          }
        } catch (fallbackError) {
          if (fallbackError.code === "ECONNREFUSED" || fallbackError.message?.includes("connect")) {
            throw new Error("Cannot connect to Hardhat node. Make sure 'npx hardhat node' is running on http://127.0.0.1:8545");
          }
          throw fallbackError;
        }
      } else if (error.code === "ECONNREFUSED" || error.message?.includes("connect")) {
        throw new Error("Cannot connect to Hardhat node. Make sure 'npx hardhat node' is running on http://127.0.0.1:8545");
      } else {
        throw error;
      }
    }
  };

  const handleFastForward = async () => {
    let amountSec = 0;
    let displayText = "";

    if (useDays) {
      const daysValue = parseFloat(days);
      
      if (!daysValue || daysValue <= 0) {
        handleTxError(new Error("Please enter a valid number of days (greater than 0)"));
        return;
      }

      // Convert days to seconds
      amountSec = Math.floor(daysValue * 24 * 60 * 60);
      const daysText = daysValue === 1 ? "day" : "days";
      displayText = `${daysValue} ${daysText} (${amountSec} seconds)`;
    } else {
      const minutesValue = parseFloat(minutes);
      
      if (!minutesValue || minutesValue <= 0) {
        handleTxError(new Error("Please enter a valid number of minutes (greater than 0)"));
        return;
      }

      // Convert minutes to seconds
      amountSec = Math.floor(minutesValue * 60);
      const minutesText = minutesValue === 1 ? "minute" : "minutes";
      displayText = `${minutesValue} ${minutesText} (${amountSec} seconds)`;
    }

    setLoading(true);
    try {
      await fastForwardTime(amountSec);
      showTxSuccess(`Time advanced by ${displayText}`, { autoClose: 4000 });
      setMinutes("");
      setDays("");

      if (onTimeAdvanced) {
        await onTimeAdvanced();
      }
    } catch (error) {
      console.error("Fast-forward error:", error);
      handleTxError(error, "Failed to fast-forward time");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-5 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/20">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-amber-400">
        Developer Time Controls
      </h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-amber-300/80">
            {useDays ? "Days to fast-forward" : "Minutes to fast-forward"}
          </label>
          <div className="relative">
            <input
              type="number"
              value={useDays ? days : minutes}
              onChange={(e) => useDays ? setDays(e.target.value) : setMinutes(e.target.value)}
              placeholder={useDays ? "e.g., 30 for 30 days" : "e.g., 60 for 1 hour"}
              step={useDays ? "1" : "1"}
              className="w-full appearance-none rounded-lg border-2 border-amber-500/40 bg-black/40 pr-16 pl-4 py-2.5 text-sm font-medium text-white placeholder:text-amber-400/50 focus:border-amber-400 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-amber-400/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              disabled={loading}
              min={useDays ? "1" : "1"}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-400/70 pointer-events-none">
              {useDays ? "days" : "min"}
            </span>
          </div>
        </div>
        <button
          onClick={handleFastForward}
          disabled={loading || (useDays ? !days : !minutes)}
          className="rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-600/30 transition-all hover:from-amber-500 hover:to-amber-400 hover:shadow-lg hover:shadow-amber-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-amber-600 disabled:hover:to-amber-500 disabled:hover:shadow-md"
        >
          {loading ? "Fast-forwarding..." : useDays ? "Fast-forward Time" : "Fast-forward Auction"}
        </button>
      </div>
    </div>
  );
};

export default DeveloperTimeControls;

