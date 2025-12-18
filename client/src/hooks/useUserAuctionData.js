import { useState, useCallback, useEffect } from "react";
import { safeContractCall } from "../utils/contractUtils";

/**
 * Fetches user-specific auction data
 */
export const useUserAuctionData = (auctionContract, account, isFinalized) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!auctionContract || !account) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        committedQty,
        revealedQty,
        revealedDeposit,
        commitsCount,
        revealedBidsCount,
      ] = await Promise.all([
        safeContractCall(() => auctionContract.committedQty(account), 0n),
        safeContractCall(() => auctionContract.revealedQty(account), 0n),
        safeContractCall(() => auctionContract.revealedDeposit(account), 0n),
        safeContractCall(
          () => {
            if (typeof auctionContract.commitsCount === 'function') {
              return auctionContract.commitsCount(account);
            }
            return Promise.resolve(0n);
          },
          0n
        ),
        safeContractCall(
          () => {
            if (typeof auctionContract.revealedBidsCount === 'function') {
              return auctionContract.revealedBidsCount(account);
            }
            return Promise.resolve(0n);
          },
          0n
        ),
      ]);

      // Fetch allocation if finalized
      let allocation = null;
      if (isFinalized) {
        const alloc = await safeContractCall(
          () => auctionContract.accountAllocations(account),
          null
        );
        if (alloc) {
          allocation = {
            totalQty: alloc.totalQty,
            bonusQty: alloc.bonusQty,
            paymentDue: alloc.paymentDue,
            computed: alloc.computed,
          };
        }
      }

      setData({
        committedQty,
        revealedQty,
        revealedDeposit,
        commitsCount: Number(commitsCount),
        revealedBidsCount: Number(revealedBidsCount),
        allocation,
      });
    } catch (err) {
      console.error("Failed to fetch user data:", err);
      setError(err.message || "Failed to load user data");
    } finally {
      setLoading(false);
    }
  }, [auctionContract, account, isFinalized]);

  useEffect(() => {
    if (auctionContract && account) {
      fetchData();
    } else {
      setData(null);
      setError(null);
      setLoading(false);
    }
  }, [auctionContract, account, isFinalized, fetchData]);

  return {
    data,
    loading,
    error,
    fetchData,
    refetch: fetchData,
  };
};

