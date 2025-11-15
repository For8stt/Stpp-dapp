import React, { useEffect, useState } from "react";
import { getContractBalanceInETH, getUserDepositInETH, subscribeToEvents } from "../utils/lockServices";
import { getUserBalanceInETH } from "../utils/userServices";

function ContractInfo({ account, refreshFlag }) {
    const [contractBalance, setContractBalance] = useState("0");
    const [userBalance, setUserBalance] = useState("0");
    const [userDeposit, setUserDeposit] = useState("0");

    const fetchBalances = async () => {
        if (!account) return;
        try {
            const [contractBal, userBal, deposit] = await Promise.all([
                getContractBalanceInETH(),
                getUserBalanceInETH(account),
                getUserDepositInETH(account),
            ]);

            setContractBalance(contractBal);
            setUserBalance(userBal);
            setUserDeposit(deposit);
        } catch (error) {
            console.error("Failed to fetch balances:", error);
        }
    };

    useEffect(() => {
        fetchBalances();
        const unsubscribe = subscribeToEvents(fetchBalances);
        return () => unsubscribe && unsubscribe();
    }, [account, refreshFlag]);

    return (
        <div>
            <h2>Contract Balance: {contractBalance} ETH</h2>
            <p>Connected Account: {account}</p>
            <p>Your Wallet Balance: {userBalance} ETH</p>
            <p>Your Deposit in Contract: {userDeposit} ETH</p>
        </div>
    );
}



export default ContractInfo;
