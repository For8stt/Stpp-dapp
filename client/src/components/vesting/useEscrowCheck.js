import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Contract } from "ethers";
import { ensureProvider } from "../../services/web3/provider";
import allAbis from "../../abi/allAbis.json";

/**
 * Hook to check if we need to get correct escrow from expected LBP
 */
export const useEscrowCheck = (lbpAddressToCheck, escrowAddress) => {
  const [correctEscrowAddress, setCorrectEscrowAddress] = useState(null);
  const [checkingEscrow, setCheckingEscrow] = useState(false);
  const [lbpFinalized, setLbpFinalized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const fetchCorrectEscrow = async () => {
      if (!lbpAddressToCheck || checkingEscrow) {
        return;
      }
      
      try {
        setCheckingEscrow(true);
        
        const provider = ensureProvider();
        if (!provider) {
          return;
        }

        const secureLBPAbi = allAbis.SecureLBP || [];
        if (secureLBPAbi.length === 0) {
          return;
        }
        
        const secureLBPContract = new Contract(lbpAddressToCheck, secureLBPAbi, provider);
        
        const [finalized, vestingEscrow] = await Promise.all([
          secureLBPContract.finalized().catch(() => false),
          secureLBPContract.vestingEscrow().catch(() => ethers.ZeroAddress),
        ]);

        if (!isMounted) return;

        setLbpFinalized(finalized);

        if (vestingEscrow !== ethers.ZeroAddress) {
          setCorrectEscrowAddress(vestingEscrow);
          
          if (finalized) {
            const escrowMatch = vestingEscrow.toLowerCase() === escrowAddress.toLowerCase();
            
            if (!escrowMatch) {
              timeoutId = setTimeout(() => {
                if (isMounted) {
                  window.location.href = `/vesting/${vestingEscrow}?lbp=${lbpAddressToCheck}`;
                }
              }, 1500);
            }
          }
        } else {
          setCorrectEscrowAddress(null);
        }
      } catch (err) {
        console.error("[Vesting] Error checking correct escrow:", err);
      } finally {
        if (isMounted) {
          setCheckingEscrow(false);
        }
      }
    };

    if (lbpAddressToCheck) {
      fetchCorrectEscrow();
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [lbpAddressToCheck, escrowAddress, checkingEscrow]);

  return { correctEscrowAddress, checkingEscrow, lbpFinalized };
};







