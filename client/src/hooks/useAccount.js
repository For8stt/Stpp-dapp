import { useState, useEffect, useCallback } from "react";
import { BrowserProvider } from "ethers";

/**
 * Hook to get connected account from window.ethereum
 */
export const useAccount = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAccount = useCallback(async () => {
    if (!window.ethereum) {
      setAccount("");
      setLoading(false);
      return;
    }

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
    } catch (error) {
      console.warn("Could not get account:", error);
      setAccount("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();

    // Listen for account changes
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount("");
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, [fetchAccount]);

  return { account, loading, refetch: fetchAccount };
};

