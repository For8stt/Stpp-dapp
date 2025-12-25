/**
 * VestingView - Complete Vesting Page
 * Displays vesting information and allows users to claim vested tokens.
 * 
 * Route: /vesting/:escrowAddress
 */
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAccount as useWagmiAccount } from "wagmi";
import { Contract, ethers } from "ethers";
import { useTransaction } from "../hooks/useTransaction";
import { useVestingData } from "../hooks/useVestingData";
import { useTime } from "../time";
import { calculateVestingCurveData, formatToken } from "../components/vesting/vesting.utils";
import { useEscrowCheck } from "../components/vesting/useEscrowCheck";
import { useClaimHandler } from "../components/vesting/useClaimHandler";
import { useVestingProgress } from "../components/vesting/useVestingProgress";
import { ensureProvider } from "../services/web3/provider";
import allAbis from "../abi/allAbis.json";
import VestingLoading from "../components/vesting/VestingLoading";
import VestingError from "../components/vesting/VestingError";
import VestingEmpty from "../components/vesting/VestingEmpty";
import VestingContent from "../components/vesting/VestingContent";

const VestingView = () => {
  const { escrowAddress: escrowAddressParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const expectedLBPAddress = searchParams.get("lbp");
  const lbpAddressParam = searchParams.get("lbpAddress");
  const { address: account } = useWagmiAccount();
  const tx = useTransaction();
  const { currentTime, refreshTime } = useTime();
  
  const [actualEscrowAddress, setActualEscrowAddress] = useState(escrowAddressParam);
  const [actualLBPAddress, setActualLBPAddress] = useState(lbpAddressParam || expectedLBPAddress);
  const [checkingAddresses, setCheckingAddresses] = useState(true);
  
  const lbpAddressToCheck = actualLBPAddress;

  useEffect(() => {
    let isMounted = true;
    
    const detectAndFixAddresses = async () => {
      if (!escrowAddressParam) return;
      
      try {
        setCheckingAddresses(true);
        const provider = await ensureProvider();
        if (!provider) return;
        const escrowAbi = allAbis.TokenVestingEscrow || [];
        const secureLBPAbi = allAbis.SecureLBP || [];
        
        if (escrowAbi.length === 0 || secureLBPAbi.length === 0) {
          setCheckingAddresses(false);
          return;
        }
        let isEscrow = false;
        let lbpFromEscrow = null;
        try {
          const escrowContract = new Contract(escrowAddressParam, escrowAbi, provider);
          const [token, secureLBP] = await Promise.all([
            escrowContract.token().catch(() => ethers.ZeroAddress),
            escrowContract.secureLBP().catch(() => ethers.ZeroAddress),
          ]);
          if (token !== ethers.ZeroAddress && secureLBP !== ethers.ZeroAddress) {
            isEscrow = true;
            lbpFromEscrow = secureLBP;
          }
        } catch (err) {
        }
        let isLBP = false;
        let escrowFromLBP = null;
        try {
          const lbpContract = new Contract(escrowAddressParam, secureLBPAbi, provider);
          const [token, vestingEscrow] = await Promise.all([
            lbpContract.token().catch(() => ethers.ZeroAddress),
            lbpContract.vestingEscrow().catch(() => ethers.ZeroAddress),
          ]);
          if (token !== ethers.ZeroAddress) {
            isLBP = true;
            escrowFromLBP = vestingEscrow !== ethers.ZeroAddress ? vestingEscrow : null;
          }
        } catch (err) {
        }
        
        if (!isMounted) return;
        if (isLBP && !isEscrow) {
          const correctEscrow = escrowFromLBP || (expectedLBPAddress && expectedLBPAddress !== ethers.ZeroAddress ? expectedLBPAddress : null);
          
          if (correctEscrow) {
            navigate(`/vesting/${correctEscrow}?lbp=${escrowAddressParam}`, { replace: true });
            return;
          } else if (expectedLBPAddress) {
            try {
              const testEscrowContract = new Contract(expectedLBPAddress, escrowAbi, provider);
              const [token, secureLBP] = await Promise.all([
                testEscrowContract.token().catch(() => ethers.ZeroAddress),
                testEscrowContract.secureLBP().catch(() => ethers.ZeroAddress),
              ]);
              if (token !== ethers.ZeroAddress && secureLBP !== ethers.ZeroAddress) {
                navigate(`/vesting/${expectedLBPAddress}?lbp=${escrowAddressParam}`, { replace: true });
                return;
              }
            } catch (err) {
            }
          }
        }
        if (isEscrow) {
          setActualEscrowAddress(escrowAddressParam);
          if (lbpFromEscrow) {
            setActualLBPAddress(lbpFromEscrow);
          } else if (expectedLBPAddress) {
            setActualLBPAddress(expectedLBPAddress);
          }
        } else if (!isLBP) {
          setActualEscrowAddress(escrowAddressParam);
          if (expectedLBPAddress) {
            setActualLBPAddress(expectedLBPAddress);
          }
        }
        
        setCheckingAddresses(false);
      } catch (err) {
        if (isMounted) {
          setCheckingAddresses(false);
        }
      }
    };
    
    detectAndFixAddresses();
    
    return () => {
      isMounted = false;
    };
  }, [escrowAddressParam, expectedLBPAddress, navigate]);

  const {
    data: vestingData,
    loading,
    error,
    refetch: refetchVestingData,
  } = useVestingData(actualEscrowAddress, account, lbpAddressToCheck || undefined, currentTime);

  const [vestingCurveData, setVestingCurveData] = useState([]);

  const { correctEscrowAddress, checkingEscrow, lbpFinalized } = useEscrowCheck(
    lbpAddressToCheck,
    actualEscrowAddress
  );

  const handleClaim = useClaimHandler(
    vestingData,
    account,
    actualEscrowAddress,
    tx,
    refetchVestingData
  );

  const { progressPercent, cliffProgress, finalProgress } = useVestingProgress(vestingData);

  /**
   * Calculate vesting curve data for graph
   */
  useEffect(() => {
    if (!vestingData || !vestingData.vestingConfigured) {
      setVestingCurveData([]);
      return;
    }

    const curveData = calculateVestingCurveData(vestingData, currentTime, formatToken);
    setVestingCurveData(curveData);
  }, [vestingData, currentTime]);

  if (checkingAddresses || loading) {
    return <VestingLoading />;
  }

  if (error) {
    return <VestingError error={error} onRetry={refetchVestingData} />;
  }

  if (!vestingData) {
    return <VestingEmpty />;
  }
  
  const canClaim = (vestingData.userClaimable && vestingData.userClaimable > 0n) || 
                  (vestingData.userVested && vestingData.userClaimed !== undefined && vestingData.userVested > vestingData.userClaimed);

  return (
    <VestingContent
      account={account}
      vestingData={vestingData}
      lbpAddressToCheck={lbpAddressToCheck}
      secureLBPAddress={vestingData.secureLBPAddress}
      escrowAddress={actualEscrowAddress}
      correctEscrowAddress={correctEscrowAddress}
      checkingEscrow={checkingEscrow}
      lbpFinalized={lbpFinalized}
      progressPercent={progressPercent}
      cliffProgress={cliffProgress}
      finalProgress={finalProgress}
      currentTime={currentTime}
      vestingCurveData={vestingCurveData}
      canClaim={canClaim}
      isPending={tx.isPending}
      onClaim={handleClaim}
      onTimeAdvanced={async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshTime();
        await new Promise(resolve => setTimeout(resolve, 500));
        await refetchVestingData();
      }}
    />
  );
};

export default VestingView;
