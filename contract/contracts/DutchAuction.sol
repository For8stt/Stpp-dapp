// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DutchAuction with batch settlements, early bonuses, whitelist, soft cap and batch distribution/refunds
/// @notice Designed for presale usage (STTP). Batch processing avoids gas explosion on many bidders.
/// @dev Use token decimals = 18 for simple math, or adapt calculations if token has different decimals.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IPresaleManager.sol";

contract DutchAuction is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;      // token being sold
    address public owner;               // project owner / beneficiary
    IPresaleManager public presaleManager; // Callback to PresaleManager for auto-transition

    uint256 public startTime;
    uint256 public endTime;
    uint256 public startPrice;          // price in wei per token unit (assumes token decimals = 18)
    uint256 public reservePrice;        // minimum price in wei per token unit
    uint256 public totalTokens;         // number of tokens supplied for sale (token units)
    uint256 public softCap;             // minimum ETH to consider auction successful (wei)
    uint256 public collected;           // ETH collected (sum of bids not yet refunded)
    bool public finalized;

    // batch settlement parameters
    uint256 public batchDuration = 5 minutes; // batch time window for settlement grouping
    uint256 public batchPointer;              // pointer index for processing bids in increments

    // early bonus
    uint256 public bonusPercent = 5;          // default 5% bonus for early participants
    uint256 public bonusEndTime;              // timestamp when bonus period ends

    // whitelist control
    bool public whitelistEnabled = false;
    mapping(address => bool) public whitelist;

    struct Bid {
        address bidder;
        uint256 amountETH;
        uint256 timestamp;
        bool processed; // whether this bid has been included in allocations/refunds
    }

    Bid[] public bids;
    mapping(address => uint256) public allocations; // token units allocated (not yet claimed)
    uint256 public totalAllocatedTokens;

    // flags after finalize
    bool public refundable;    // true if auction failed softCap => refunds required
    bool public distributable; // true if auction succeeded => tokens can be distributed

    // events for frontend
    event BidPlaced(address indexed bidder, uint256 amountETH, uint256 timestamp);
    event BatchSettled(uint256 indexed batchStart, uint256 indexed batchEnd, uint256 clearingPrice, uint256 processed);
    event RefundsProcessed(uint256 processed);
    event TokensDistributed(uint256 processed);
    event AuctionFinalized(bool success, uint256 collected);
    event WhitelistUpdated(address indexed user, bool allowed);
    event BonusParamsUpdated(uint256 bonusPercent, uint256 bonusEndTime);
    event BatchDurationUpdated(uint256 batchDuration);
    event ReserveAdjusted(uint256 oldReserve, uint256 newReserve);
    event AutoTransitionToLBP(uint256 collectedETH, uint256 remainingTokens);
    event AutoFailedAuction(uint256 collectedETH);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier auctionActive() {
        require(block.timestamp >= startTime && block.timestamp <= endTime, "Auction not active");
        _;
    }

    modifier auctionEnded() {
        require(block.timestamp > endTime, "Auction not ended");
        _;
    }

    constructor(
        address _token,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _startPrice,
        uint256 _reservePrice,
        uint256 _totalTokens,
        uint256 _softCap,
        uint256 _earlyBonusDurationSeconds,
        address _presaleManager // New: Callback to PresaleManager
    ) {
        require(_token != address(0), "Zero token");
        require(_startTime < _endTime, "Invalid times");
        require(_startPrice > _reservePrice, "Start > reserve required");
        require(_totalTokens > 0, "totalTokens>0");

        token = IERC20(_token);
        owner = msg.sender;
        startTime = _startTime;
        endTime = _endTime;
        startPrice = _startPrice;
        reservePrice = _reservePrice;
        totalTokens = _totalTokens;
        softCap = _softCap;
        bonusEndTime = _startTime + _earlyBonusDurationSeconds;
        presaleManager = IPresaleManager(_presaleManager); // Optional, check in finalize
    }

    // ---------------------------
    // Getters / helpers
    // ---------------------------

    /// @notice current linear price from startPrice -> reservePrice over duration
    function getCurrentPrice() public view returns (uint256) {
        if (block.timestamp <= startTime) return startPrice;
        if (block.timestamp >= endTime) return reservePrice;

        uint256 elapsed = block.timestamp - startTime;
        uint256 duration = endTime - startTime;
        uint256 priceDrop = startPrice - reservePrice;
        return startPrice - (priceDrop * elapsed) / duration;
    }

    /// @notice number of bids stored
    function bidsCount() external view returns (uint256) {
        return bids.length;
    }

    // ---------------------------
    // Owner controls
    // ---------------------------

    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
    }

    function addToWhitelist(address[] calldata users) external onlyOwner {
        for (uint i = 0; i < users.length; i++) {
            whitelist[users[i]] = true;
            emit WhitelistUpdated(users[i], true);
        }
    }

    function removeFromWhitelist(address[] calldata users) external onlyOwner {
        for (uint i = 0; i < users.length; i++) {
            whitelist[users[i]] = false;
            emit WhitelistUpdated(users[i], false);
        }
    }

    function updateBonusParams(uint256 _bonusPercent, uint256 _bonusEndTime) external onlyOwner {
        require(_bonusPercent <= 100, "bonus<=100");
        bonusPercent = _bonusPercent;
        bonusEndTime = _bonusEndTime;
        emit BonusParamsUpdated(_bonusPercent, _bonusEndTime);
    }

    function updateBatchDuration(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "non-zero");
        batchDuration = _seconds;
        emit BatchDurationUpdated(_seconds);
    }

    /// owner can adjust reserve price downward under low uptake; callable by owner before auction end
    function adjustReservePrice(uint256 newReserve) external onlyOwner {
        require(newReserve <= reservePrice, "can only lower");
        emit ReserveAdjusted(reservePrice, newReserve);
        reservePrice = newReserve;
    }

    // ---------------------------
    // Bidding
    // ---------------------------

    /// @notice Place a bid in ETH (any non-zero amount). If whitelistEnabled, sender must be whitelisted.
    function placeBid() external payable nonReentrant auctionActive {
        if (whitelistEnabled) {
            require(whitelist[msg.sender], "Not whitelisted");
        }
        require(msg.value > 0, "Zero bid");

        bids.push(Bid({bidder: msg.sender, amountETH: msg.value, timestamp: block.timestamp, processed: false}));
        collected += msg.value;

        emit BidPlaced(msg.sender, msg.value, block.timestamp);
    }

    // ---------------------------
    // Batch settlement (group bids that fall into batch window)
    // Process in chunks by calling settleBatch(maxProcess) to avoid gas blow-up
    // ---------------------------

    /// @notice Settle bids that fall into current batch window. Processes up to maxProcess bids from batchPointer.
    /// @param maxProcess maximum number of bids to iterate in this call (gas safety)
    function settleBatch(uint256 maxProcess) external nonReentrant auctionActive {
        require(maxProcess > 0, "maxProcess>0");

        uint256 batchStart = (block.timestamp / batchDuration) * batchDuration;
        uint256 batchEnd = batchStart + batchDuration;
        uint256 clearingPrice = getCurrentPrice();

        uint256 processed = 0;
        uint256 i = batchPointer;

        while (i < bids.length && processed < maxProcess) {
            Bid storage b = bids[i];

            // only consider bids in this batch window and not yet processed
            if (!b.processed && b.timestamp >= batchStart && b.timestamp < batchEnd && b.amountETH > 0) {
                // tokensBought = amountETH / clearingPrice, with 1e18 factor (token decimals assumed 18)
                uint256 tokensBought = (b.amountETH * 1e18) / clearingPrice;

                // early bonus
                if (b.timestamp <= bonusEndTime) {
                    tokensBought += (tokensBought * bonusPercent) / 100;
                }

                // Обмежити алокацію, щоб не перевищити totalTokens
                uint256 availableTokens = totalTokens - totalAllocatedTokens;
                if (tokensBought > availableTokens) {
                    tokensBought = availableTokens;
                }

                allocations[b.bidder] += tokensBought;
                totalAllocatedTokens += tokensBought;

                b.amountETH = 0;
                b.processed = true;
            }
            processed++;
            i++;
        }

        batchPointer = i;

        emit BatchSettled(batchStart, batchEnd, clearingPrice, processed);
    }

    // ---------------------------
    // Distribution & Refunds (batch)
    // After auction ended, owner/facilitator can call distributeTokens / processRefunds in chunks
    // ---------------------------

    /// @notice Process token transfers for allocated users in batches to avoid gas issues.
    /// @param startIndex start index in bids array to process (inclusive)
    /// @param maxProcess max number of entries to process in this call
    function distributeTokens(uint256 startIndex, uint256 maxProcess) external nonReentrant {
        require(finalized, "Finalize first");
        require(distributable, "Not distributable");
        require(maxProcess > 0, "maxProcess>0");
        uint256 processed = 0;
        uint256 i = startIndex;

        while (i < bids.length && processed < maxProcess) {
            address user = bids[i].bidder;
            uint256 tokens = allocations[user];

            if (tokens > 0) {
                // check token balance available
                require(token.balanceOf(address(this)) >= tokens, "Insufficient tokens in contract");
                allocations[user] = 0; // prevent re-entrancy double transfer
                totalAllocatedTokens = totalAllocatedTokens > tokens ? totalAllocatedTokens - tokens : 0;
                token.transfer(user, tokens);
            }

            processed++;
            i++;
        }

        emit TokensDistributed(processed);
    }

    /// @notice Process refunds in batches (for auction failure). Caller can be anyone.
    /// @param startIndex start index in bids array to process (inclusive)
    /// @param maxProcess max number of entries to process
    function processRefunds(uint256 startIndex, uint256 maxProcess) external nonReentrant {
        require(finalized, "Finalize first");
        require(refundable, "Not refundable");
        require(maxProcess > 0, "maxProcess>0");
        uint256 processed = 0;
        uint256 i = startIndex;

        while (i < bids.length && processed < maxProcess) {
            Bid storage b = bids[i];
            if (b.amountETH > 0) {
                uint256 amt = b.amountETH;
                b.amountETH = 0;
                (bool ok, ) = b.bidder.call{value: amt}("");
                require(ok, "Refund failed");
            }
            processed++;
            i++;
        }

        emit RefundsProcessed(processed);
    }

    // ---------------------------
    // Finalization
    // ---------------------------

    /// @notice Finalize auction state after endTime. Sets flags distributable/refundable.
    /// Owner must ensure tokens have been transferred to this contract before calling finalize() if auction succeeded.
    function finalize() external nonReentrant onlyOwner auctionEnded returns (uint256) {
        require(!finalized, "Already finalized");

        finalized = true;

        // Auction success if collected >= softCap
        if (collected < softCap) {
            refundable = true;
            distributable = false;
            emit AuctionFinalized(false, collected);

            // Auto-fail: Call PresaleManager if set
            if (address(presaleManager) != address(0)) {
                presaleManager.handleFailedAuction(collected);
                emit AutoFailedAuction(collected);
            }

            return 0; // No remaining
        } else {
            refundable = false;
            distributable = true;
            emit AuctionFinalized(true, collected);

            // Auto-success: Transfer ETH/tokens to PresaleManager, call transition
            if (address(presaleManager) != address(0)) {
                // Transfer remainingTokens to PresaleManager
                uint256 remainingTokens = totalTokens - totalAllocatedTokens;
                token.safeTransfer(address(presaleManager), remainingTokens);

                // Transfer collected ETH to PresaleManager (forward or transfer)
                payable(address(presaleManager)).transfer(collected);

                // Callback
                presaleManager.transitionToLBP(collected, remainingTokens);
                emit AutoTransitionToLBP(collected, remainingTokens);
            }

            // Transfer remainingTokens back to msg.sender (owner) if no PresaleManager
            uint256 remainingTokens = totalTokens - totalAllocatedTokens;
            if (remainingTokens > 0) {
                token.safeTransfer(msg.sender, remainingTokens);
            }

            return remainingTokens;
        }
    }

    // ---------------------------
    // Owner withdraw: withdraw collected ETH after successful distribution
    // It's recommended to call distributeTokens fully first, then withdraw.
    // ---------------------------
    function withdrawProceeds() external nonReentrant onlyOwner {
        require(finalized, "Finalize first");
        require(distributable, "Not distributable");
        // After tokens distribution, contract will hold leftover ETH (if any) to send to owner.
        uint256 bal = address(this).balance;
        require(bal > 0, "No ETH to withdraw");
        (bool ok, ) = owner.call{value: bal}("");
        require(ok, "Withdraw failed");
    }

    // ---------------------------
    // Helpers for front-end / safety
    // ---------------------------

    /// @notice emergency function to let owner recover ERC20 mistakenly sent (except the sale token).
    function recoverERC20(address _erc20, uint256 amount) external onlyOwner {
        require(_erc20 != address(token), "Cannot recover sale token");
        IERC20(_erc20).transfer(owner, amount);
    }

    /// @notice emergency withdrawal of ETH by owner if auction finalized as distributable and after tokens distributed
    function emergencyWithdrawETH(uint256 amount) external onlyOwner {
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "Emergency withdraw failed");
    }

    receive() external payable {
        revert("Use placeBid()");
    }

    fallback() external payable {
        revert("Use placeBid()");
    }
}