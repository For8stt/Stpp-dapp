import { useState, useEffect } from "react";


export const useAuctionContract = (auctionAddress, managerContract) => {
  const [auctionContract, setAuctionContract] = useState(null);

  useEffect(() => {
    const loadAuctionContract = async () => {
      if (!auctionAddress || !managerContract) {
        setAuctionContract(null);
        return;
      }
      try {
        const allAbis = await import("../abi/allAbis.json");
        const { ensureProvider } = await import("../services/web3/provider");
        const provider = ensureProvider();
        const auctionAbi = allAbis.DutchAuction || [];
        if (auctionAbi.length > 0) {
          const { Contract } = await import("ethers");
          const contract = new Contract(auctionAddress, auctionAbi, provider);
          setAuctionContract(contract);
        }
      } catch (err) {
        console.warn("Failed to load auction contract:", err);
        setAuctionContract(null);
      }
    };
    loadAuctionContract();
  }, [auctionAddress, managerContract]);

  return auctionContract;
};

