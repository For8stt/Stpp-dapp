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
}
