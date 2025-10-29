// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPresaleManager {
    /**
     * @notice Callback invoked by SecureLBP once the LBP phase has been finalized
     *         and allocations have been registered in the vesting contract.
     * @param auction           Address of the originating Dutch auction
     * @param vestingContract   Vesting contract that received allocations
     * @param beneficiaries     Addresses that received vesting allocations
     * @param amounts           Amount of tokens allocated per beneficiary
     * @param ethAmount         ETH value routed from the LBP into vesting/treasury flows
     * @param tokenAmount       Total tokens distributed to the vesting contract
     */
    function finalizePresale(
        address auction,
        address vestingContract,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        uint256 ethAmount,
        uint256 tokenAmount
    ) external;
}
