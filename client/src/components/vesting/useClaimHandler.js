import { useCallback } from "react";
import { Contract, ethers } from "ethers";
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

    let escrowLBPAddress = null;
    let overrideLBPAddress = null;

    try {
      const provider = ensureProvider();
      if (provider) {
        const escrowAbi = allAbis.TokenVestingEscrow || [];
        const escrowContract = new Contract(escrowAddress, escrowAbi, provider);
        escrowLBPAddress = await escrowContract.secureLBP().catch(() => null);
        overrideLBPAddress = vestingData?.overrideLBPAddress; // Get override from vestingData if available
        const [directClaimable, directVestedFromEscrowLBP, directClaimed] = await Promise.all([
          escrowContract.claimable(account).catch((err) => {
            return 0n;
          }),
          escrowLBPAddress ? (async () => {
            try {
              const secureLBPAbi = allAbis.SecureLBP || [];
              const lbpContract = new Contract(escrowLBPAddress, secureLBPAbi, provider);
              const vested = await lbpContract.vestedAmount(account).catch(() => 0n);
              return vested;
            } catch (err) {
              return 0n;
            }
          })() : Promise.resolve(0n),
          escrowContract.claimed(account).catch(() => 0n),
        ]);
        let directVestedFromOverrideLBP = 0n;
        if (overrideLBPAddress && overrideLBPAddress.toLowerCase() !== escrowLBPAddress?.toLowerCase()) {
          try {
            const secureLBPAbi = allAbis.SecureLBP || [];
            const lbpContract = new Contract(overrideLBPAddress, secureLBPAbi, provider);
            directVestedFromOverrideLBP = await lbpContract.vestedAmount(account).catch(() => 0n);
          } catch (err) {
          }
        }
        const directVested = directVestedFromEscrowLBP;

        const vestedToUse = vestingData.userVested || directVested;
        const claimedToUse = vestingData.userClaimed || directClaimed;
        const calculatedClaimable = vestedToUse > claimedToUse ? vestedToUse - claimedToUse : 0n;
        if (directClaimable === 0n && calculatedClaimable === 0n) {
          const errorDetails = {
            message: "No tokens available to claim",
            vested: vestedToUse.toString(),
            claimed: claimedToUse.toString(),
            directClaimable,
            calculatedClaimable: calculatedClaimable.toString(),
            escrowLBPAddress,
            overrideLBPAddress,
            userVestedFromData: vestingData.userVested?.toString(),
            directVestedFromEscrowLBP: directVestedFromEscrowLBP.toString(),
            directVestedFromOverrideLBP: directVestedFromOverrideLBP.toString(),
          };
          handleTxError(new Error(
            `No tokens available to claim. ` +
            `Vested: ${vestedToUse.toString()}, ` +
            `Claimed: ${claimedToUse.toString()}, ` +
            `Escrow LBP: ${escrowLBPAddress}, ` +
            `Escrow claimable(): ${directClaimable.toString()}, ` +
            `Calculated: ${calculatedClaimable.toString()}`
          ));
          return;
        }
        
      }
      } catch (checkErr) {
    }

    const effectiveClaimable = vestingData.userClaimable || 
                               (vestingData.userVested && vestingData.userClaimed !== undefined
                                 ? (vestingData.userVested > vestingData.userClaimed 
                                     ? vestingData.userVested - vestingData.userClaimed 
                                     : 0n)
                                 : 0n);
    
    if (effectiveClaimable === 0n) {
      handleTxError(new Error(`No tokens available to claim. Vested: ${vestingData.userVested?.toString() || "0"}, Claimed: ${vestingData.userClaimed?.toString() || "0"}`));
      return;
    }

    try {
      const signer = await ensureSigner();
      const provider = await ensureProvider();
      if (!provider) {
        throw new Error("Provider not available");
      }
      
      const escrowAbi = allAbis.TokenVestingEscrow || [];
      const escrowContract = new Contract(escrowAddress, escrowAbi, signer);
      const escrowContractReadOnly = new Contract(escrowAddress, escrowAbi, provider);

      const finalClaimableCheck = await escrowContractReadOnly.claimable(account).catch(() => 0n);
      const tokenAddress = vestingData?.tokenAddress;
      let escrowBalance = 0n;
      if (tokenAddress) {
        const tokenAbi = [
          { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" }
        ];
        const tokenContract = new Contract(tokenAddress, tokenAbi, provider);
        escrowBalance = await tokenContract.balanceOf(escrowAddress).catch(() => 0n);
        
        if (escrowBalance < effectiveClaimable) {
        }
      }
      let staticCallError = null;
      try {
        await escrowContractReadOnly.claim.staticCall({ from: account });
      } catch (staticCallErr) {
        staticCallError = staticCallErr;
        let decodedError = null;
        if (staticCallErr.data) {
          try {
            const escrowInterface = new ethers.Interface(escrowAbi);
            const decoded = escrowInterface.parseError(staticCallErr.data);
            decodedError = {
              name: decoded.name,
              args: decoded.args,
            };
          } catch (decodeErr) {
          }
        }
        if (decodedError) {
          handleTxError(new Error(`Claim will fail: ${decodedError.name} - ${decodedError.args?.join(", ") || "see console for details"}`), "Claim will revert");
          return;
        }
        if (staticCallErr.reason) {
          handleTxError(new Error(`Claim will fail: ${staticCallErr.reason}`), "Claim will revert");
          return;
        }
        if (finalClaimableCheck === 0n) {
          handleTxError(new Error(
            `Cannot claim: escrow.claimable() returns 0. ` +
            `This usually means secureLBP.vestedAmount() returns 0 or equals claimed amount. ` +
            `Escrow LBP: ${escrowLBPAddress}, ` +
            `Calculated claimable: ${effectiveClaimable.toString()}`
          ), "No tokens available to claim");
          return;
        }
      }
      
      if (finalClaimableCheck === 0n && effectiveClaimable > 0n) {
        handleTxError(new Error(
          `Escrow contract reports 0 claimable tokens. ` +
          `This may be due to LBP address mismatch. ` +
          `Escrow uses LBP: ${escrowLBPAddress}, ` +
          `but data shows vested: ${vestingData.userVested?.toString() || "0"}`
        ), "No tokens available to claim");
        return;
      }

      await tx.execute(
        async () => {
          try {
            const txResult = await escrowContract.claim();
            return txResult;
          } catch (txErr) {
            throw txErr;
          }
        },
        {
          pendingMessage: "Claiming tokens…",
          successMessage: "Tokens claimed successfully!",
          errorMessage: "Claim failed",
          onSuccess: async () => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await refetchVestingData();
          },
        }
      );
    } catch (err) {
      let errorMessage = "Failed to claim tokens";
      if (err.reason) {
        errorMessage += `: ${err.reason}`;
      } else if (err.message) {
        errorMessage += `: ${err.message}`;
      } else if (err.data) {
        errorMessage += ` (check console for revert reason)`;
      }
      
      handleTxError(err, errorMessage);
    }
  }, [vestingData, account, escrowAddress, tx, refetchVestingData]);

  return handleClaim;
};