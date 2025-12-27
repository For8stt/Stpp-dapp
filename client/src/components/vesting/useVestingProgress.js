import { useMemo } from "react";

/**
 * Hook to calculate vesting progress values
 */
export const useVestingProgress = (vestingData) => {
  const progressPercent = useMemo(() => {
    if (!vestingData || !vestingData.userAllocation || vestingData.userAllocation === 0n) {
      return 0;
    }
    return vestingData.vestingPercent || 0;
  }, [vestingData]);

  const cliffProgress = useMemo(() => {
    if (!vestingData || !vestingData.vestingConfigured) return 0;
    const { vestingStart, vestingCliffDuration, currentTime } = vestingData;
    const cliffTime = vestingStart + vestingCliffDuration;
    
    if (currentTime >= cliffTime) return 100;
    if (currentTime < vestingStart) return 0;
    
    const elapsed = currentTime - vestingStart;
    return (elapsed / vestingCliffDuration) * 100;
  }, [vestingData]);

  const finalProgress = useMemo(() => {
    if (!vestingData || !vestingData.vestingConfigured) return 0;
    const { vestingStart, vestingFinalDuration, currentTime } = vestingData;
    const finalTime = vestingStart + vestingFinalDuration;
    
    if (currentTime >= finalTime) return 100;
    if (currentTime < vestingStart) return 0;
    
    const elapsed = currentTime - vestingStart;
    return (elapsed / vestingFinalDuration) * 100;
  }, [vestingData]);

  return { progressPercent, cliffProgress, finalProgress };
};


