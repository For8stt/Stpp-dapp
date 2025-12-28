import { useState, useCallback, useEffect } from "react";
import loadContract from "../services/web3/loadContract";

export const usePresaleInfo = (address, account) => {
  const [managerContract, setManagerContract] = useState(null);
  const [info, setInfo] = useState(null);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  const refreshInfo = useCallback(async () => {
    if (!address) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const normalizedAddress = address.toLowerCase();
      let factoryContract = null;
      try {
        factoryContract = await loadContract("PublicPresaleFactory");
      } catch {}
      if (factoryContract) {
        const factoryAddress = (factoryContract.target || factoryContract.address || "").toString().toLowerCase();
        if (factoryAddress === normalizedAddress) {
          setError(
            "This address is the public factory. Open one of the PresaleManager clones emitted by the factory (see All presales)."
          );
          setManagerContract(null);
          setAuctions([]);
          setInfo(null);
          return;
        }
      }
      const contract = await loadContract("PresaleManager", address);
      setManagerContract(contract);
      const ownerAddress = await contract.owner();
      const auctionsList = await contract.getAllAuctions();
      setAuctions(auctionsList);

      let latestInfo = null;
      if (auctionsList.length > 0) {
        const targetAuction = auctionsList[auctionsList.length - 1];
        let details = null;

        if (typeof contract.getPresaleInfo === "function") {
          details = await contract.getPresaleInfo(targetAuction);
        } else if (typeof contract.getLatestPresaleInfo === "function") {
          details = await contract.getLatestPresaleInfo();
        } else if (typeof contract.getAuctionRecord === "function") {
          const record = await contract.getAuctionRecord(targetAuction);
          details = [
            ownerAddress,
            targetAuction,
            record.lbp,
            record.vestingEscrow,
            record.finalized,
            record.lbpInitialized,
            record.lbpFinalized,
            record.tokensForSale,
            record.bonusReserve,
            record.totalRaised,
            record.clearingPrice,
          ];
        }

        if (details) {
          latestInfo = {
            owner: details[0],
            auction: details[1],
            lbp: details[2],
            vesting: details[3],
            finalized: details[4],
            lbpInitialized: details[5],
            lbpFinalized: details[6],
            tokensForSale: details[7],
            bonusReserve: details[8],
            totalRaised: details[9],
            clearingPrice: details[10],
          };
        }
      }

      setInfo(latestInfo);
      setIsOwner(ownerAddress?.toLowerCase() === account?.toLowerCase());
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load presale");
    } finally {
      setLoading(false);
    }
  }, [address, account]);

  useEffect(() => {
    refreshInfo();
  }, [refreshInfo]);

  return {
    managerContract,
    info,
    auctions,
    loading,
    error,
    isOwner,
    refreshInfo,
  };
};

