// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TwoStageVesting
 * @notice Minimal vesting escrow used by the DutchAuction → SecureLBP pipeline.
 *         Allocations are registered by the SecureLBP during finalization and
 *         settle to beneficiaries in two steps: a cliff unlock and a final unlock.
 *
 *         - Before the cliff expires, nothing is claimable.
 *         - Between the cliff and final timestamps, `cliffPercentBP` of the total
 *           allocation becomes available.
 *         - After the final timestamp, 100% of the allocation is available.
 *
 *         Claims are pull-based and use SafeERC20 for safety.
 */
contract TwoStageVesting is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public immutable startTime;
    uint256 public immutable cliffDuration;
    uint256 public immutable finalDuration;
    uint256 public immutable cliffPercentBP;

    uint256 public constant BP_SCALE = 10_000;

    // SecureLBP contract authorised to register allocations.
    address public registrar;

    mapping(address => uint256) public totalAllocation;
    mapping(address => uint256) public claimed;

    event AllocationRegistered(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amountClaimed, uint256 totalClaimed);
    event RegistrarUpdated(address indexed registrar);

    constructor(
        address _token,
        uint256 _startTime,
        uint256 _cliffDuration,
        uint256 _finalDuration,
        uint256 _cliffPercentBP
    ) {
        require(_token != address(0), "token zero");
        require(_startTime > 0, "start zero");
        require(_finalDuration >= _cliffDuration, "durations invalid");
        require(_cliffPercentBP <= BP_SCALE, "cliff pct > 100%");

        token = IERC20(_token);
        startTime = _startTime;
        cliffDuration = _cliffDuration;
        finalDuration = _finalDuration;
        cliffPercentBP = _cliffPercentBP;

        _transferOwnership(msg.sender);
    }

    /**
     * @notice Set the SecureLBP contract authorised to register allocations.
     *         Can be invoked once (or updated) by the owner (PresaleManager).
     */
    function setRegistrar(address registrar_) external onlyOwner {
        require(registrar_ != address(0), "registrar zero");
        registrar = registrar_;
        emit RegistrarUpdated(registrar_);
    }

    /**
     * @notice Register vesting allocations for a batch of users.
     * @dev Callable by the SecureLBP contract once it finalises.
     */
    function registerAllocations(address[] calldata users, uint256[] calldata amounts) external {
        require(msg.sender == registrar, "unauthorised");
        uint256 len = users.length;
        require(len == amounts.length, "length mismatch");
        require(len > 0, "empty input");

        for (uint256 i = 0; i < len; ++i) {
            address user = users[i];
            uint256 amount = amounts[i];
            require(user != address(0), "user zero");
            require(amount > 0, "amount zero");

            totalAllocation[user] += amount;
            emit AllocationRegistered(user, amount);
        }
    }

    /**
     * @notice Claim vested tokens for the caller, based on the two-stage schedule.
     */
    function claim() external {
        uint256 vested = _vestedAmount(msg.sender);
        uint256 alreadyClaimed = claimed[msg.sender];
        require(vested > alreadyClaimed, "nothing claimable");

        uint256 toClaim = vested - alreadyClaimed;
        claimed[msg.sender] = vested;

        token.safeTransfer(msg.sender, toClaim);
        emit Claimed(msg.sender, toClaim, vested);
    }

    function vestedAmount(address user) external view returns (uint256) {
        return _vestedAmount(user);
    }

    function _vestedAmount(address user) internal view returns (uint256) {
        uint256 total = totalAllocation[user];
        if (total == 0) {
            return 0;
        }

        uint256 cliffTime = startTime + cliffDuration;
        uint256 finalTime = startTime + finalDuration;

        if (block.timestamp < cliffTime) {
            return 0;
        }

        if (block.timestamp < finalTime) {
            return (total * cliffPercentBP) / BP_SCALE;
        }

        return total;
    }
}
