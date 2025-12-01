import React, { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";

import PresaleCard from "../components/presale/PresaleCard";
import deployments from "../abi/data/stppDeployments.json";
import allAbis from "../abi/allAbis.json";
import styles from "./AllPresales.module.css";

const AllPresales = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getReadProvider = () => {
    if (typeof window === "undefined") {
      return null;
    }
    if (window.ethereum) {
      return new BrowserProvider(window.ethereum);
    }
    return null;
  };

  const fetchManagerDetails = async (managerAddress) => {
    const provider = getReadProvider();
    if (!provider) {
      return null;
    }

    try {
      const abi = Array.isArray(allAbis.PresaleManager) ? allAbis.PresaleManager : (allAbis.PresaleManager?.abi || allAbis.PresaleManager);
      const manager = new Contract(managerAddress, abi, provider);
      const owner = await manager.owner();
      let info = null;
      if (typeof manager.getLatestPresaleInfo === "function") {
        info = await manager.getLatestPresaleInfo();
      } else if (typeof manager.getPresaleInfo === "function") {
        info = await manager.getPresaleInfo(managerAddress);
      }
      return {
        manager: managerAddress,
        owner,
        auction: info ? info[1] : "",
        lbp: info ? info[2] : "",
        vesting: info ? info[3] : "",
        finalized: info ? info[4] : false,
      };
    } catch (error) {
      console.warn("Failed to load manager info", error);
      return null;
    }
  };

  const loadPresales = useCallback(async () => {
    const latestEntry =
      deployments?.entries && deployments.entries.length > 0
        ? deployments.entries[deployments.entries.length - 1]
        : null;

    if (!latestEntry?.publicFactory) {
      setError("PublicPresaleFactory address not available");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const provider = getReadProvider();
      if (!provider) {
        throw new Error("No provider available");
      }

      const factoryAbi = Array.isArray(allAbis.PublicPresaleFactory) 
        ? allAbis.PublicPresaleFactory 
        : (allAbis.PublicPresaleFactory?.abi || allAbis.PublicPresaleFactory);
      const factory = new Contract(latestEntry.publicFactory, factoryAbi, provider);
      const presales = await factory.getPresales();

      const enriched = await Promise.all(
        presales.map(async (managerAddress) => {
          return await fetchManagerDetails(managerAddress);
        })
      );

      setItems(enriched.filter(Boolean));
    } catch (factoryError) {
      console.error("Factory error:", factoryError);

      // Check if this is a network/contract issue
      if (factoryError?.code === 'CALL_EXCEPTION') {
        setError("Contracts not found. Please redeploy contracts to the current network.");
      } else if (factoryError?.message?.includes('missing revert data')) {
        setError("Contracts are not deployed. Please run deployment scripts first.");
      } else {
        setError(factoryError?.message || "Failed to load presales");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresales();
  }, [loadPresales]);

  return (
    <section className={styles.page}>
      <div className={styles.heroCard}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Permissionless presales</h1>
          <p className={styles.heroSubtitle}>Browse all PresaleManager clones created via the public factory.</p>
          <div className={styles.heroStats}>
            <div>
              <p>Live auctions</p>
              <strong>Real-time tracking</strong>
            </div>
            <div>
              <p>Factory clones</p>
              <strong>Permissionless creation</strong>
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          <button onClick={loadPresales} className={styles.heroButton}>
            Refresh
          </button>
          <button onClick={() => window.location.reload()} className={styles.secondaryButton}>
             Reload Page
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorCard}>
          <div className={styles.errorContent}>
            <p className={styles.errorTitle}>⚠️ Error Loading Presales</p>
            <p className={styles.errorText}>{error}</p>
            {error.includes('not deployed') && (
              <div className={styles.errorInstructions}>
                <p>To fix this issue:</p>
                <ol className={styles.instructionList}>
                  <li>Make sure Hardhat network is running: <span className={styles.codeBlock}>npx hardhat node</span></li>
                  <li>Deploy contracts: <span className={styles.codeBlock}>npm run deploy:all</span></li>
                  <li>Refresh this page</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>Loading presales...</p>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>
            <div className={styles.emptyIconBox}>
              <div className={styles.emptyIconInner}></div>
            </div>
          </div>
          <h3 className={styles.emptyTitle}>No presales deployed yet</h3>
          <p className={styles.emptyText}>
            Create your first presale using the PublicPresaleFactory to see it listed here.
          </p>
        </div>
      ) : (
        <div className={styles.presalesGrid}>
          {items.map((presale) => (
            <PresaleCard key={presale.manager} presale={presale} />
          ))}
        </div>
      )}
    </section>
  );
};

export default AllPresales;
