// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISecureLBP {
    function commitBid(bytes32 hash) external payable;
}

contract ReentrancyAttacker {
    ISecureLBP public lbp;
    bool public attacked;

    constructor(address _lbp) {
        lbp = ISecureLBP(_lbp);
    }

    function attackCommit(bytes32 hash) external payable {
        require(!attacked, "already attacked");
        attacked = true;
        lbp.commitBid{value: msg.value}(hash);
    }

    receive() external payable {
        if (address(lbp).balance > 0 && !attacked) {
            attacked = true;
            lbp.commitBid{value: msg.value}(bytes32(0));
        }
    }
}
