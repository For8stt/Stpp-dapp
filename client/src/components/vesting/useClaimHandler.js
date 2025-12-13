import { useCallback } from "react";
import { Contract } from "ethers";
import { handleTxError } from "../../utils/txErrorHandler";
import { ensureSigner } from "../../services/web3/signer";
import { ensureProvider } from "../../services/web3/provider";
import allAbis from "../../abi/allAbis.json";

/**
 * Hook to handle claim transaction
 */
export const useClaimHandler = (vestingData, account, escrowAddress, tx, refetchVestingData) => {
  const handleClaim = useCallback(async () => {
    if (!vestingData || !account) {
      handleTxError(new Error("Please connect your wallet"));
      return;
    }

    // Double-check claimable amount directly from contract before claiming
    try {
      const provider = await ensureProvider();
      if (provider) {
        const escrowAbi = allAbis.TokenVestingEscrow || [];
        const escrowContract = new Contract(escrowAddress, escrowAbi, provider);
        
        const [directClaimable, directVested, directClaimed] = await Promise.all([
          escrowContract.claimable(account).catch(() => 0n),
          escrowContract.secureLBP().then(async (lbpAddr) => {
            const secureLBPAbi = allAbis.SecureLBP || [];
            const lbpContract = new Contract(lbpAddr, secureLBPAbi, provider);
            return await lbpContract.vestedAmount(account).catch(() => 0n);
          }).catch(() => 0n),
          escrowContract.claimed(account).catch(() => 0n),
        ]);
        
        console.log("[Vesting] Claim check:", {
          userClaimableFromData: vestingData.userClaimable?.toString(),
          directClaimableFromContract: directClaimable.toString(),
          directVestedFromLBP: directVested.toString(),
          directClaimedFromEscrow: directClaimed.toString(),
          calculatedClaimable: (directVested > directClaimed ? (directVested - directClaimed).toString() : "0"),
          userVested: vestingData.userVested?.toString(),
          userClaimed: vestingData.userClaimed?.toString(),
        });

        const calculatedClaimable = directVested > directClaimed ? directVested - directClaimed : 0n;
        
        if (directClaimable === 0n && calculatedClaimable === 0n) {
          handleTxError(new Error(`No tokens available to claim. Vested: ${directVested.toString()}, Claimed: ${directClaimed.toString()}`));
          return;
        }
        
        if (directClaimable === 0n && calculatedClaimable > 0n) {
          console.warn("[Vesting] Contract claimable is 0, but calculation shows claimable. Attempting claim anyway...");
        }
      }
    } catch (checkErr) {
      console.warn("[Vesting] Could not check claimable amount:", checkErr);
    }

    const effectiveClaimable = vestingData.userClaimable || 
                               (vestingData.userVested > vestingData.userClaimed 
                                 ? vestingData.userVested - vestingData.userClaimed 
                                 : 0n);
    
    if (effectiveClaimable === 0n) {
      handleTxError(new Error("No tokens available to claim"));
      return;
    }

    try {
      const signer = await ensureSigner();
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      const escrowContract = new Contract(escrowAddress, escrowAbi, signer);

      await tx.execute(
        async () => {
          return await escrowContract.claim();
        },
        {
          pendingMessage: "Claiming tokens…",
          successMessage: "Tokens claimed successfully!",
          errorMessage: "Claim failed",
          onSuccess: async () => {
            await refetchVestingData();
          },
        }
      );
    } catch (err) {
      console.error("Error claiming tokens:", err);
      handleTxError(err, "Failed to claim tokens");
    }
  }, [vestingData, account, escrowAddress, tx, refetchVestingData]);

  return handleClaim;
};


