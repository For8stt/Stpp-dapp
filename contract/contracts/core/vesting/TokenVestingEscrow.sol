// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../lbp/SecureLBP.sol";
import "./events/TokenVestingEscrowEvents.sol";
import "./errors/TokenVestingEscrowErrors.sol";

/**
 * @title TokenVestingEscrow
 * @notice Holds purchased tokens from SecureLBP finalization and lets users pull vested amounts.
 *         The vesting schedule and per-user allocations are sourced from the SecureLBP contract.
 */
contract TokenVestingEscrow is ReentrancyGuard, Ownable, TokenVestingEscrowEvents, TokenVestingEscrowErrors {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    SecureLBP public immutable secureLBP;

    mapping(address => uint256) public claimed;

    constructor(address token_, address payable secureLBP_) {
        if (token_ == address(0)) revert TokenZero();
        if (secureLBP_ == address(0)) revert LbpZero();

        SecureLBP lbp = SecureLBP(secureLBP_);
        if (address(lbp.token()) != token_) revert TokenMismatch();

        token = IERC20(token_);
        secureLBP = lbp;
        _transferOwnership(msg.sender);
    }

    /// @notice Claim vested tokens for the caller.
    function claim() external nonReentrant {
        _claim(msg.sender);
    }

    /// @notice Claim vested tokens on behalf of a user. Tokens are transferred to the user.
    function claimFor(address user) external nonReentrant {
        if (user == address(0)) revert UserZero();
        _claim(user);
    }

    /// @notice Returns the remaining claimable amount for a user.
    function claimable(address user) public view returns (uint256) {
        uint256 vested = secureLBP.vestedAmount(user);
        uint256 alreadyClaimed = claimed[user];
        if (vested <= alreadyClaimed) {
            return 0;
        }
        return vested - alreadyClaimed;
    }

    /// @notice Exposes total allocation from SecureLBP for frontends.
    function totalAllocation(address user) external view returns (uint256) {
        return secureLBP.getUserAllocation(user);
    }

    /// @notice Rescue non-sale tokens accidentally sent to the escrow.
    function rescueERC20(address erc20, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ToZero();
        if (erc20 == address(token)) revert RescueSaleToken();
        SafeERC20.safeTransfer(IERC20(erc20), to, amount);
    }

    function _claim(address user) internal {
        uint256 amount = claimable(user);
        if (amount == 0) revert NothingClaimable();

        claimed[user] += amount;
        token.safeTransfer(user, amount);

        emit Claimed(user, amount, claimed[user]);
    }
}
