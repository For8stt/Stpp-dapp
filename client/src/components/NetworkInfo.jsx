import React, { useEffect, useState } from "react";

import { getNetworkName, subscribeWalletEvents } from "../services/web3/wallet";

const NetworkInfo = () => {
  const [network, setNetwork] = useState("");

  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const name = await getNetworkName();
        setNetwork(name);
      } catch (error) {
        console.error("Unable to determine network:", error);
      }
    };

    fetchNetwork();
    const unsubscribe = subscribeWalletEvents({
      onChainChanged: () => {
        fetchNetwork();
      }
    });

    return () => unsubscribe();
  }, []);

  return <p className="network-indicator">Connected Network: {network || "Unknown"}</p>;
};

export default NetworkInfo;
