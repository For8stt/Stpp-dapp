import React, { useEffect, useState } from "react";
import { getNetworkName } from "../utils/contractServices";

function NetworkInfo() {
    const [network, setNetwork] = useState("");

    useEffect(() => {
        const fetchNetwork = async () => {
            const name = await getNetworkName();
            setNetwork(name);
        };
        fetchNetwork();

        window.ethereum?.on("chainChanged", () => fetchNetwork());
    }, []);

    return <p>Connected Network: {network}</p>;
}

export default NetworkInfo;
