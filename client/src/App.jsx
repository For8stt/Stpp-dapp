import React, { useState, useEffect } from "react";
import ConnectWalletButton from "./components/ConnectWalletButton";
import ContractInfo from "./components/ContractInfo";
import ContractActions from "./components/ContractActions";
import NetworkInfo from "./components/NetworkInfo";
import { requestAccount, resetProviderAndContract } from "./utils/contractServices";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
    const [account, setAccount] = useState(null);
    const [refreshFlag, setRefreshFlag] = useState(false); // тригер для оновлення

    const refreshBalances = () => {
        setRefreshFlag((prev) => !prev);
    };

    useEffect(() => {
        const init = async () => {
            const acc = await requestAccount();
            setAccount(acc);
            await resetProviderAndContract();
        };
        init();

        const handleAccountsChanged = async (accounts) => {
            setAccount(accounts.length > 0 ? accounts[0] : null);
            await resetProviderAndContract();
        };

        const handleChainChanged = async () => {
            await resetProviderAndContract();
        };

        if (window.ethereum) {
            window.ethereum.on("accountsChanged", handleAccountsChanged);
            window.ethereum.on("chainChanged", handleChainChanged);
        }

        return () => {
            window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
            window.ethereum?.removeListener("chainChanged", handleChainChanged);
        };
    }, []);

    return (
        <div className="app">
            <ToastContainer />
            {!account ? (
                <ConnectWalletButton setAccount={setAccount} />
            ) : (
                <div className="contract-interactions">
                    <NetworkInfo />
                    <ContractInfo account={account} refreshFlag={refreshFlag} />
                    <ContractActions refreshBalances={refreshBalances} />
                </div>
            )}
        </div>
    );
}


export default App;
