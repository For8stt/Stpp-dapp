// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DutchAuction.sol";
import "./SecureLBP.sol";
import "./TestVesting.sol";

contract PresaleManager is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    DutchAuction public immutable dutchAuction;
    SecureLBP public immutable secureLBP;
    TestVesting public immutable vesting;
    address public treasury;

    uint256 public immutable softCap; // Minimum ETH for success (e.g., 100 ETH)
    uint256 public constant LIQUIDITY_PERCENT = 30; // 30% of collected for liquidity (pool init)

    bool public presaleActive = false; // Flag for presale state
    bool public transitioned = false; // Flag for LBP transition
    bool public finalized = false; // Flag for finalization

    event PhaseStarted(string phase);
    event TransitionToLBP(uint256 collectedETH, uint256 remainingTokens);
    event PresaleFailedRefund(uint256 totalRefunded);
    event TokensTransferred(address from, address to, uint256 amount);
    event FundsWithdrawn(uint256 amount);
    event PresaleFinalized(uint256 liquidityAmount);

    modifier onlyDutch() {
        require(msg.sender == address(dutchAuction), "only dutch");
        _;
    }

    modifier onlyLBP() {
        require(msg.sender == address(secureLBP), "only lbp");
        _;
    }

    struct PresaleConfig {
        address token;
        address treasury;
        uint256 softCap;
        uint256 startTime;
        uint256 auctionDuration;
        uint256 lbpCommitDuration;
        uint256 lbpRevealDuration;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 totalTokens;
        uint256 earlyBonusDurationSeconds;
        // LBP pool params
        uint256 poolStartWeightToken;
        uint256 poolEndWeightToken;
        uint256 poolSwapFee;
    }

    constructor(PresaleConfig memory cfg) {
        require(cfg.token != address(0), "zero token");
        require(cfg.treasury != address(0), "zero treasury");
        require(cfg.softCap > 0, "zero soft cap");
        require(cfg.startTime > block.timestamp, "invalid start time");

        token = IERC20(cfg.token);
        treasury = cfg.treasury;
        softCap = cfg.softCap;

        // Deploy DutchAuction with callback to this PresaleManager
        dutchAuction = new DutchAuction(
            cfg.token,
            cfg.startTime,
            cfg.startTime + cfg.auctionDuration,
            cfg.startPrice,
            cfg.reservePrice,
            cfg.totalTokens,
            cfg.softCap,
            cfg.earlyBonusDurationSeconds,
            address(this)  // Pass PresaleManager as callback for auto-transition
        );


        // Deploy SecureLBP with LBP times and pool params + callback to this
        uint256 lbpStart = cfg.startTime + cfg.auctionDuration;
        secureLBP = new SecureLBP(
            cfg.token,
            lbpStart,
            lbpStart + cfg.lbpCommitDuration,
            lbpStart + cfg.lbpCommitDuration + cfg.lbpRevealDuration,
            cfg.treasury,
            cfg.poolStartWeightToken,
            cfg.poolEndWeightToken,
            cfg.poolSwapFee,
            address(this) // Pass self for auto-finalize callback
        );

        // Deploy TestVesting
        vesting = new TestVesting();
    }


    /// @notice Owner starts presale by funding DutchAuction with tokens.
    function startPresale(uint256 tokenAmount) external onlyOwner {
        require(!presaleActive, "presale already started");
        require(tokenAmount > 0, "zero tokens");
        require(token.balanceOf(address(this)) >= tokenAmount, "insufficient tokens");

        token.safeTransfer(address(dutchAuction), tokenAmount);
        presaleActive = true;
        emit PhaseStarted("Dutch Auction Started");
    }

    /// @notice Called by DutchAuction on success (>= softCap): Transfers remaining tokens, inits pool.
    /// Only callable by DutchAuction.
    function transitionToLBP(uint256 collectedETH, uint256 remainingTokens) external onlyDutch {
        require(presaleActive, "presale not started");
        require(!transitioned, "already transitioned");
        require(collectedETH >= softCap, "below soft cap"); // Double-check

        // Transfer remaining tokens from Dutch to SecureLBP
        token.safeTransfer(address(secureLBP), remainingTokens);

        // Calc pool funds: e.g., 50% collected ETH + 50% remaining tokens (adjust proportion)
        uint256 poolETH = (collectedETH * 50) / 100; // 50% ETH for pool
        uint256 poolTokens = (remainingTokens * 50) / 100; // 50% tokens for pool

        // Init pool (ETH transferred from Dutch to this, then to SecureLBP via {value})
        secureLBP.initPoolFromAuction{value: poolETH}(poolTokens);

        transitioned = true;
        presaleActive = false; // End presale
        emit TransitionToLBP(collectedETH, remainingTokens);
        emit PhaseStarted("LBP Started");
    }

    /// @notice Called by DutchAuction on fail (< softCap): Refunds all.
    /// Only callable by DutchAuction.
    function handleFailedAuction(uint256 collectedETH) external onlyDutch {
        require(presaleActive, "presale not active");
        require(collectedETH < softCap, "not failed");

        presaleActive = false;
        emit PresaleFailedRefund(collectedETH);
        emit PhaseStarted("Presale Failed - Refunded");
    }

    /// @notice Called by SecureLBP on finalizeToVesting: Withdraw liquidity portion to treasury.
    /// Only callable by SecureLBP.
    function finalizePresale(address[] calldata beneficiaries, uint256[] calldata amounts) external onlyLBP {
        require(transitioned, "not transitioned to LBP"); // Ensure success
        require(!finalized, "already finalized");

        // Withdraw liquidity % to treasury (remainingETH after LBP swap)
        uint256 remainingETH = address(secureLBP).balance;
        uint256 liquidityAmount = (remainingETH * LIQUIDITY_PERCENT) / 100;
        secureLBP.withdrawETH(payable(treasury), liquidityAmount);

        finalized = true;
        emit FundsWithdrawn(liquidityAmount);
        emit PhaseStarted("Presale Finalized");
    }

    /// @notice Set treasury (onlyOwner)
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero treasury");
        treasury = _treasury;
    }
    receive() external payable {}

}