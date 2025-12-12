import React, { useEffect, useState } from "react";
import { useChainId } from "wagmi";
import { getNetworkName } from "../../services/web3/wallet";

const NetworkInfo = () => {
  const [network, setNetwork] = useState("");
  const chainId = useChainId();

  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const name = await getNetworkName();
        setNetwork(name);
      } catch (error) {
        console.error("Unable to determine network:", error);
        setNetwork("Unknown");
      }
    };

    fetchNetwork();
  }, [chainId]);

  return <p className="network-indicator">Connected Network: {network || "Unknown"}</p>;
};

export default NetworkInfo;
