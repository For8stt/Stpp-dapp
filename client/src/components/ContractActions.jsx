import React, { useState } from "react";
import { depositFund, withdrawFund } from "../utils/contractServices";
import { toast } from "react-toastify";

function ContractActions({ refreshBalances }) {
    const [depositValue, setDepositValue] = useState("");

    const handleDeposit = async () => {
        try {
            await depositFund(depositValue);
            toast.success("Deposit successful!");
            refreshBalances(); // оновлення ContractInfo
        } catch (error) {
            toast.error(error?.reason || error?.message);
        }
        setDepositValue("");
    };

    const handleWithdraw = async () => {
        try {
            await withdrawFund();
            toast.success("Withdrawal successful!");
            refreshBalances();
        } catch (error) {
            toast.error(error?.reason || error?.message);
        }
    };

    return (
        <div>
            <h2>Contract Actions</h2>
            <input
                type="text"
                value={depositValue}
                onChange={(e) => setDepositValue(e.target.value)}
                placeholder="Amount in ETH"
            />
            <button onClick={handleDeposit}>Deposit Funds</button>
            <button onClick={handleWithdraw}>Withdraw Funds</button>
        </div>
    );
}

export default ContractActions;
