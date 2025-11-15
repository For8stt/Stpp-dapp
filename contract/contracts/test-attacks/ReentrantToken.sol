// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../core/vesting/TokenVestingEscrow.sol";

contract ReentrantToken is ERC20 {
    TokenVestingEscrow public escrow;
    bool private _entered;

    constructor(uint256 initialSupply) ERC20("ReentrantToken", "RNT") {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setEscrow(address escrow_) external {
        escrow = TokenVestingEscrow(escrow_);
    }

    function _afterTokenTransfer(address from, address to, uint256 amount) internal override {
        super._afterTokenTransfer(from, to, amount);
        if (!_entered && address(escrow) != address(0) && from == address(escrow)) {
            _entered = true;
            escrow.claim();
            _entered = false;
        }
    }
}
