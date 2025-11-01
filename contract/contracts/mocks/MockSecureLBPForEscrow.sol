// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Lightweight SecureLBP stub used in TokenVestingEscrow tests.
 *      Allows configuring per-user allocations and vested amounts.
 */
contract MockSecureLBPForEscrow {
    IERC20 public immutable token;
    mapping(address => uint256) private _allocations;
    mapping(address => uint256) private _vested;

    constructor(address token_) {
        require(token_ != address(0), "token zero");
        token = IERC20(token_);
    }

    function setAllocation(address user, uint256 amount) external {
        _allocations[user] = amount;
    }

    function setVested(address user, uint256 amount) external {
        _vested[user] = amount;
    }

    function getUserAllocation(address user) external view returns (uint256) {
        return _allocations[user];
    }

    function vestedAmount(address user) external view returns (uint256) {
        return _vested[user];
    }
}
