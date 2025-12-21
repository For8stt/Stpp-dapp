import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Contract } from "ethers";
import { ensureProvider } from "../services/web3/provider";
import allAbis from "../abi/allAbis.json";

export const useLbpData = (lbpAddress, lbpData, account) => {
  const [userData, setUserData] = useState(null);
  const [weightScheduleData, setWeightScheduleData] = useState([]);

  const fetchUserData = useCallback(async () => {
    if (!lbpAddress || !account || !lbpData) {
      setUserData(null);
      return;
    }

    if (lbpData.finalized && userData) {
      console.log("[LBP] LBP finalized - using cached user data");
      return;
    }

    try {
      const provider = ensureProvider();
      if (!provider) return;

      const lbpAbi = Array.isArray(allAbis.SecureLBP)
        ? allAbis.SecureLBP
        : allAbis.SecureLBP?.abi || allAbis.SecureLBP;
      const lbpContract = new Contract(lbpAddress, lbpAbi, provider);

      const [totalContributed, allocation] = await Promise.all([
        lbpContract.totalContributed(account).catch(() => 0n),
        lbpContract.allocations(account).catch(() => 0n),
      ]);

      setUserData({
        totalContributed,
        allocation,
      });
    } catch (err) {
      console.warn("Could not fetch user data:", err);
      setUserData(null);
    }
  }, [lbpAddress, account, lbpData, userData]);

  const generateWeightSchedule = useCallback(async () => {
    if (!lbpData?.amm || lbpData.amm === ethers.ZeroAddress) {
      setWeightScheduleData([]);
      return;
    }

    try {
      const provider = ensureProvider();
      if (!provider) return;

      const ammAbi = Array.isArray(allAbis.LBPWeightedAMM)
        ? allAbis.LBPWeightedAMM
        : allAbis.LBPWeightedAMM?.abi || allAbis.LBPWeightedAMM;
      const ammContract = new Contract(lbpData.amm, ammAbi, provider);

      const [startWeightToken, endWeightToken, poolStartTime, poolEndTime] = await Promise.all([
        ammContract.startWeightToken().catch(() => 0n),
        ammContract.endWeightToken().catch(() => 0n),
        ammContract.startTime().catch(() => 0n),
        ammContract.endTime().catch(() => 0n),
      ]);

      const ammStartTime = Number(poolStartTime);
      const ammEndTime = Number(poolEndTime);
      const initialWeight = startWeightToken;
      const finalWeight = endWeightToken;

      if (ammStartTime && ammEndTime && ammStartTime < ammEndTime && initialWeight && finalWeight) {
        const scheduleData = [];
        const points = 100;
        const duration = ammEndTime - ammStartTime;

        for (let i = 0; i <= points; i++) {
          const progress = i / points;
          const timestamp = ammStartTime + duration * progress;

          let currentTokenWeight;
          if (timestamp <= ammStartTime) {
            currentTokenWeight = Number(ethers.formatEther(initialWeight));
          } else if (timestamp >= ammEndTime) {
            currentTokenWeight = Number(ethers.formatEther(finalWeight));
          } else {
            const elapsed = timestamp - ammStartTime;
            const initialWeightNum = Number(ethers.formatEther(initialWeight));
            const finalWeightNum = Number(ethers.formatEther(finalWeight));
            const weightDiff = Math.abs(initialWeightNum - finalWeightNum);
            const change = (weightDiff * elapsed) / duration;
            const isDecreasing = initialWeightNum > finalWeightNum;
            currentTokenWeight = isDecreasing
              ? initialWeightNum - change
              : initialWeightNum + change;
          }

          const currentEthWeight = 1 - currentTokenWeight;

          scheduleData.push({
            timestamp,
            time: new Date(timestamp * 1000).toLocaleTimeString(),
            tokenWeight: currentTokenWeight * 100,
            ethWeight: currentEthWeight * 100,
          });
        }

        setWeightScheduleData(scheduleData);
      }
    } catch (err) {
      console.error("Error generating weight schedule:", err);
    }
  }, [lbpData?.amm]);

  useEffect(() => {
    if (lbpData && account) {
      fetchUserData();
    }
  }, [lbpAddress, account, lbpData, fetchUserData]);

  useEffect(() => {
    if (lbpData?.amm && lbpData.amm !== ethers.ZeroAddress) {
      generateWeightSchedule();
    }
  }, [lbpData?.amm, generateWeightSchedule]);

  return {
    userData,
    weightScheduleData,
    refetchUserData: fetchUserData,
  };
};

