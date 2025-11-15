// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPresaleManager {
    /**
     * @notice Callback invoked by SecureLBP once the LBP phase has been finalized.
     * @param auction     Address of the originating Dutch auction
     * @param ethAmount   ETH value raised during the LBP
     * @param tokenAmount Total tokens allocated to participants
     */
    function finalizePresale(address auction, uint256 ethAmount, uint256 tokenAmount) external;

    /**
     * @notice Notification invoked by the upkeep controller once demand check executes.
     * @param auction Address of the Dutch auction whose reserve was adjusted.
     */
    function notifyDemandCheck(address auction) external;

    /**
     * @notice Called by the upkeep controller to execute the on-chain demand adjustment through the manager.
     */
    function handleDemandCheck(address auction) external;
}
