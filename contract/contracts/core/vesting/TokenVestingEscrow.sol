// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../lbp/SecureLBP.sol";
import "./events/TokenVestingEscrowEvents.sol";

/**
 * @title TokenVestingEscrow
 * @notice Holds purchased tokens from SecureLBP finalization and lets users pull vested amounts.
 *         The vesting schedule and per-user allocations are sourced from the SecureLBP contract.
 */
contract TokenVestingEscrow is ReentrancyGuard, Ownable, TokenVestingEscrowEvents {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    SecureLBP public immutable secureLBP;

    mapping(address => uint256) public claimed;

    constructor(address token_, address payable secureLBP_) {
        require(token_ != address(0), "token zero");
        require(secureLBP_ != address(0), "lbp zero");

        SecureLBP lbp = SecureLBP(secureLBP_);
        require(address(lbp.token()) == token_, "token mismatch");

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
        require(user != address(0), "user zero");
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
        require(to != address(0), "to zero");
        require(erc20 != address(token), "cannot rescue token");
        SafeERC20.safeTransfer(IERC20(erc20), to, amount);
    }

    function _claim(address user) internal {
        uint256 amount = claimable(user);
        require(amount > 0, "nothing claimable");

        claimed[user] += amount;
        token.safeTransfer(user, amount);

        emit Claimed(user, amount, claimed[user]);
    }
}
