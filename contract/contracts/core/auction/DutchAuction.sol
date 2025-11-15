// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IAuction.sol";
import "../../libraries/CommitLib.sol";
import "../../libraries/PriceTickLib.sol";
import "../../libraries/ReserveDecayLib.sol";
import "../../libraries/VestingMath.sol";
import "./AuctionConfig.sol";
import "./events/DutchAuctionEvents.sol";
import "./errors/DutchAuctionErrors.sol";

/// @title Commit–Reveal Dutch auction with dynamic reserve management and LBP transition
/// @notice Implements a production oriented Dutch auction with commit / reveal flow, per
/// participant caps, early participation bonuses, soft-cap handling, vesting and optional
/// transition of the remaining inventory into an LBP.
/// @dev Workflow: initialize with auction parameters → bidders commit with deposits → bidders
/// reveal to populate price buckets → optional dynamic reserve adjustment → finalize to determine
/// clearing price → manager optionally calls `launchLbp` for residual inventory → participants claim
/// vested tokens / refunds → losers and unrevealed deposits withdraw → manager withdraws proceeds.
contract DutchAuction is IAuction, Ownable, ReentrancyGuard, DutchAuctionEvents, DutchAuctionErrors {
    using SafeERC20 for IERC20;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    struct Commit {
        bytes32 commitHash;
        uint200 deposit;
        uint48 commitTime;
        bool revealed;
        bool withdrawn;
    }

    struct RevealedBid {
        address bidder;
        uint32 priceTickIndex;
        uint224 qty;
        uint32 bonusPct;
        bool allocationComputed;
        uint224 allocatedQty;
    }

    struct AllocationData {
        uint256 totalQty;
        uint256 bonusQty;
        uint256 paymentDue;
        bool computed;
    }

    uint256 public tokensForSale;
    uint256 public bonusReserve;
    uint256 public bonusReserveRemaining;

    uint256 public startTime;
    uint256 public commitEndTime;
    uint256 public revealEndTime;
    uint256 public initialCommitEndTime;

    uint256 public perAddressCap;
    uint256 public softCap;

    uint256 public earlyBonusWindow;
    uint256 public earlyBonusPct;

    uint256 public nonRevealPenaltyBps;

    uint256 public lbpStableShareBps;

    uint256 public thresholdLow;
    uint256 public maxDecayMultiplier;
    uint256 public minCommitDuration;

    uint256 public vestingStart;
    uint256 public vestingDuration;

    address public treasury;
    address public lbpTokenRecipient;
    address payable public lbpStableRecipient;

    bytes32 public merkleRoot;

    uint256[] public priceTicks;
    mapping(uint256 => uint256) public priceBucketTotals;

    uint256 public decayMultiplier;
    uint256 public dynamicAdjustmentCount;

    mapping(address => Commit[]) public commits;
    mapping(address => RevealedBid[]) public revealedBids;
    mapping(address => uint256) public committedQty;
    mapping(address => uint256) public revealedQty;
    mapping(address => uint256) public revealedDeposit;

    uint256 public totalDepositCommitted;
    uint256 public totalDepositsRevealed;
    uint256 public totalCommitsCount;
    uint256 public totalQtyRevealed;

    bool public initialized;
    bool public finalized;
    bool public successful;
    bool public lbpLaunched;

    uint256 public clearingPrice;
    uint256 public clearingTickIndex;
    uint256 public filledAboveClearing;
    uint256 public totalAtClearingTick;
    uint256 public proRataNumerator;
    uint256 public proRataDenominator;
    uint256 public tokensSold;
    uint256 public totalRaised;
    uint256 public ethForTreasury;
    uint256 public penaltyCollected;

    mapping(address => AllocationData) public accountAllocations;
    mapping(address => uint256) public refundedAmount;
    mapping(address => uint256) public tokensClaimed;
    IERC20 public saleToken;
    address public presaleManager;

    modifier onlyManager() {
        if (msg.sender != presaleManager) revert NotManager();
        _;
    }

    /// @notice Sets the ERC20 token being auctioned, presale manager, and initializes decay multiplier baseline.
    constructor(IERC20 saleToken_, address presaleManager_) {
        _initializeBase(saleToken_, presaleManager_, false);
    }

    /// @notice Clone-friendly initializer that wires sale token and manager context once.
    function initializeBase(IERC20 saleToken_, address presaleManager_) external {
        _initializeBase(saleToken_, presaleManager_, true);
    }

    /// @notice Allows the owner to hand over manager rights (used by the public factory).
    function transferManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert ManagerZero();
        presaleManager = newManager;
    }

    function _initializeBase(IERC20 saleToken_, address presaleManager_, bool setOwner) internal {
        if (address(saleToken) != address(0)) revert BaseAlreadyInitialized();
        if (address(saleToken_) == address(0)) revert SaleTokenZero();
        if (presaleManager_ == address(0)) revert ManagerZero();

        saleToken = saleToken_;
        presaleManager = presaleManager_;
        decayMultiplier = 1e18;

        if (setOwner) {
            _transferOwnership(presaleManager_);
        }
    }

    /// @notice Returns the number of discrete price ticks configured for the auction.
    function priceTicksLength() external view returns (uint256) {
        return priceTicks.length;
    }

    /// @notice Reads how many commits a bidder has submitted.
    function commitsCount(address account) external view returns (uint256) {
        return commits[account].length;
    }

    /// @notice Reads how many bids a bidder revealed successfully.
    function revealedBidsCount(address account) external view returns (uint256) {
        return revealedBids[account].length;
    }

    /// @notice One-time setup for the auction windows, caps, pricing ticks, and vesting details.
    /// @dev Validates timing bounds and descending price ticks before storing configuration.
    function initializeAuction(AuctionConfig calldata config) external override onlyManager {
        if (initialized) revert AuctionFinalizedAlready();
        if (config.treasury == address(0)) revert TreasuryZero();
        if (config.tokensForSale == 0) revert TokensForSaleZero();
        if (config.commitDuration < config.minCommitDuration) revert CommitDurationTooShort();
        if (config.revealDuration == 0) revert RevealDurationZero();
        if (config.priceTicks.length == 0) revert PriceTicksEmpty();
        if (config.nonRevealPenaltyBps > BPS_DENOMINATOR) revert PenaltyTooHigh();
        if (config.earlyBonusPct > BPS_DENOMINATOR) revert BonusTooHigh();
        if (config.lbpStableShareBps > BPS_DENOMINATOR) revert LbpShareTooHigh();
        if (config.maxDecayMultiplier < 1e18) revert MaxDecayTooLow();

        for (uint256 i = 1; i < config.priceTicks.length; i++) {
            if (config.priceTicks[i - 1] <= config.priceTicks[i]) revert InvalidPriceTicks();
        }

        tokensForSale = config.tokensForSale;
        bonusReserve = config.bonusReserve;
        bonusReserveRemaining = config.bonusReserve;

        startTime = config.startTime;
        commitEndTime = config.startTime + config.commitDuration;
        revealEndTime = commitEndTime + config.revealDuration;
        initialCommitEndTime = commitEndTime;

        perAddressCap = config.perAddressCap;
        softCap = config.softCap;

        earlyBonusWindow = config.earlyBonusWindow;
        earlyBonusPct = config.earlyBonusPct;

        nonRevealPenaltyBps = config.nonRevealPenaltyBps;
        lbpStableShareBps = config.lbpStableShareBps;

        thresholdLow = config.thresholdLow;
        maxDecayMultiplier = config.maxDecayMultiplier;
        minCommitDuration = config.minCommitDuration;

        vestingStart = config.vestingStart;
        vestingDuration = config.vestingDuration;

        treasury = config.treasury;
        lbpTokenRecipient = config.lbpTokenRecipient;
        lbpStableRecipient = config.lbpStableRecipient;

        merkleRoot = config.merkleRoot;

        priceTicks = config.priceTicks;

        initialized = true;

        emit AuctionInitialized(startTime, commitEndTime, revealEndTime, tokensForSale);
        emit VestingUpdated(vestingStart, vestingDuration);
    }

    /// @notice Submits a sealed bid commitment backed by ETH deposit during the commit window.
    /// @dev Checks whitelist proof, per-address cap, and ensures deposit maps to integer quantity.
    function commit(bytes32 commitHash, bytes32[] calldata merkleProof) external payable nonReentrant {
        if (!initialized) revert AuctionNotInitialized();
        if (block.timestamp < startTime || block.timestamp > commitEndTime) revert AuctionNotActive();
        if (msg.value == 0) revert InvalidCommit();

        if (!CommitLib.verifyWhitelist(merkleRoot, merkleProof, msg.sender)) revert InvalidProof();

        uint256 impliedQty = msg.value / priceTicks[0];
        if (impliedQty == 0) revert DepositTooSmall();
        if (impliedQty * priceTicks[0] != msg.value) revert DepositMismatch();

        if (committedQty[msg.sender] + impliedQty > perAddressCap) revert CapExceeded();

        commits[msg.sender].push(
            Commit({
                commitHash: commitHash,
                deposit: uint200(msg.value),
                commitTime: uint48(block.timestamp),
                revealed: false,
                withdrawn: false
            })
        );

        committedQty[msg.sender] += impliedQty;
        totalDepositCommitted += msg.value;
        totalCommitsCount += 1;

        emit CommitSubmitted(msg.sender, commitHash, msg.value, impliedQty);
    }

    /// @notice Opens a committed bid by revealing its parameters and recording demand.
    /// @dev Verifies the original hash, applies bonuses, and aggregates quantity into buckets.
    function reveal(uint256 priceTickIndex, uint256 qty, bytes32 nonce, uint256 commitIndex) external nonReentrant {
        if (!initialized) revert AuctionNotInitialized();
        if (block.timestamp <= commitEndTime || block.timestamp > revealEndTime) revert RevealPhaseClosed();
        if (priceTickIndex >= priceTicks.length) revert InvalidCommit();
        if (qty == 0) revert InvalidCommit();

        Commit storage userCommit = commits[msg.sender][commitIndex];
        if (userCommit.revealed) revert AlreadyRevealed();

        bytes32 expectedHash = CommitLib.bidHash(priceTickIndex, qty, nonce);
        if (expectedHash != userCommit.commitHash) revert InvalidCommit();

        uint256 deposit = uint256(userCommit.deposit);
        if (!CommitLib.depositMatches(deposit, qty, priceTicks[0])) revert DepositMismatch();

        if (revealedQty[msg.sender] + qty > perAddressCap) revert CapExceeded();


        uint256 bonusPct = 0;
        if (userCommit.commitTime <= startTime + earlyBonusWindow && earlyBonusPct > 0) {
            uint256 potentialBonus = (qty * earlyBonusPct) / BPS_DENOMINATOR;
            if (potentialBonus <= bonusReserveRemaining) {
                bonusPct = earlyBonusPct;
            } else if (bonusReserveRemaining > 0) {
                bonusPct = (bonusReserveRemaining * BPS_DENOMINATOR) / qty;
            } else {
                bonusPct = 0;
            }
        }

        userCommit.revealed = true;

        revealedBids[msg.sender].push(
            RevealedBid({
                bidder: msg.sender,
                priceTickIndex: uint32(priceTickIndex),
                qty: uint224(qty),
                bonusPct: uint32(bonusPct),
                allocationComputed: false,
                allocatedQty: 0
            })
        );

        revealedQty[msg.sender] += qty;
        revealedDeposit[msg.sender] += deposit;
        totalDepositsRevealed += deposit;
        totalQtyRevealed += qty;
        priceBucketTotals[priceTickIndex] += qty;

        emit BidRevealed(msg.sender, commitIndex, priceTickIndex, qty, bonusPct);
    }

    /// @notice Adjusts decay multiplier and commit end time if deposits lag behind expectations.
    /// @dev Callable once; shortens commit phase while respecting minimum duration.
    function updateDynamicReserve() external override onlyManager {
        if (!initialized) revert AuctionNotInitialized();
        if (block.timestamp > commitEndTime) revert CommitPhaseComplete();
        if (dynamicAdjustmentCount > 0) revert CommitPhaseComplete();

        if (totalDepositCommitted < thresholdLow) {
            decayMultiplier = ReserveDecayLib.applyDecayMultiplier(decayMultiplier, maxDecayMultiplier);
            (bool updated, uint256 newCommitEnd) = ReserveDecayLib.adjustedCommitEnd(
                startTime,
                commitEndTime,
                initialCommitEndTime,
                minCommitDuration
            );
            if (updated) {
                uint256 revealDuration = revealEndTime - initialCommitEndTime;
                commitEndTime = newCommitEnd;
                revealEndTime = commitEndTime + revealDuration;
            }

            dynamicAdjustmentCount += 1;
            emit DynamicAdjustment(decayMultiplier, commitEndTime, totalDepositCommitted, totalCommitsCount);
        }
    }

    /// @notice Concludes the auction, calculating clearing price, settlements, and LBP flow.
    /// @dev Reverts until reveal window closes; marks success or failure based on soft cap.
    function finalize() external override onlyManager nonReentrant {
        if (!initialized) revert AuctionNotInitialized();
        if (finalized) revert AuctionFinalizedAlready();
        if (block.timestamp <= revealEndTime) revert RevealPhaseClosed();

        _determineClearingPrice();

        if (tokensSold == 0 || totalRaised < softCap) {
            successful = false;
            finalized = true;
            clearingPrice = 0;
            emit AuctionFinalized(false, 0, 0, 0);
            return;
        }

        successful = true;
        finalized = true;

        uint256 totalPaymentsDue = tokensSold * clearingPrice;
        ethForTreasury = totalPaymentsDue;

        emit AuctionFinalized(true, clearingPrice, tokensSold, totalRaised);
    }

    /// @notice Transfers unsold tokens and optional ETH share to the configured LBP recipients.
    /// @dev Callable once after a successful finalize; deducts ETH share from treasury balance.
    function launchLbp() external override onlyManager nonReentrant {
        if (!finalized || !successful) revert AuctionNotFinalized();
        if (lbpLaunched) revert LBPAlreadyLaunched();

        uint256 unsoldTokens = tokensForSale - tokensSold;
        if (unsoldTokens == 0) revert NoInventoryForLBP();
        uint256 stableForLBP = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR;
        if (stableForLBP > ethForTreasury) {
            stableForLBP = ethForTreasury;
        }

        if (lbpTokenRecipient == address(0)) revert LbpTokenRecipientZero();

        saleToken.safeTransfer(lbpTokenRecipient, unsoldTokens);

        if (stableForLBP > 0) {
            if (lbpStableRecipient == address(0)) revert LbpStableRecipientZero();
            ethForTreasury -= stableForLBP;
            (bool sent, ) = lbpStableRecipient.call{value: stableForLBP}("");
            if (!sent) revert TransferFailed();
        }

        lbpLaunched = true;
        emit LBPLaunched(lbpTokenRecipient, lbpStableRecipient, unsoldTokens, stableForLBP);
    }

    /// @dev Walks price buckets top-down to establish clearing tick and pro-rata parameters.
    function _determineClearingPrice() internal {
        PriceTickLib.ClearingData memory data =
            PriceTickLib.determineClearing(priceBucketTotals, priceTicks, tokensForSale);

        clearingTickIndex = data.clearingTickIndex;
        clearingPrice = data.clearingPrice;
        tokensSold = data.tokensSold;
        totalRaised = data.totalRaised;
        filledAboveClearing = data.filledAboveClearing;
        totalAtClearingTick = data.totalAtClearingTick;
        proRataNumerator = data.proRataNumerator;
        proRataDenominator = data.proRataDenominator;
    }

    /// @notice Claims vested tokens and outstanding refunds for a winning participant.
    /// @dev Lazily computes allocation, transfers the vested portion, and returns surplus ETH.
    function claim() external nonReentrant {
        if (!finalized) revert AuctionNotFinalized();
        if (!successful) revert AuctionNotFinalized();

        if (!accountAllocations[msg.sender].computed) {
            _computeAllocation(msg.sender);
        }
        AllocationData storage allocation = accountAllocations[msg.sender];

        uint256 unlocked = VestingMath.cliffOnlyFraction(vestingStart, vestingDuration);
        uint256 totalTokensDue = allocation.totalQty + allocation.bonusQty;
        uint256 vestedTokens = (totalTokensDue * unlocked) / BPS_DENOMINATOR;

        uint256 tokensToSend = vestedTokens - tokensClaimed[msg.sender];
        if (tokensToSend > 0) {
            tokensClaimed[msg.sender] += tokensToSend;
            saleToken.safeTransfer(msg.sender, tokensToSend);
            if (allocation.bonusQty > 0) {
                uint256 bonusPortion = (tokensToSend * allocation.bonusQty) / (allocation.totalQty + allocation.bonusQty);
                if (bonusPortion > 0) {
                    emit BonusAllocated(msg.sender, bonusPortion);
                }
            }
        }

        uint256 refundDue = allocation.paymentDue <= revealedDeposit[msg.sender]
            ? revealedDeposit[msg.sender] - allocation.paymentDue
            : 0;

        uint256 alreadyRefunded = refundedAmount[msg.sender];
        if (refundDue > alreadyRefunded) {
            uint256 refundValue = refundDue - alreadyRefunded;
            refundedAmount[msg.sender] = refundDue;
            (bool sent, ) = payable(msg.sender).call{value: refundValue}("");
            if (!sent) revert TransferFailed();
            emit RefundIssued(msg.sender, refundValue);
        }

        if (tokensToSend == 0 && refundDue == alreadyRefunded) revert NothingToClaim();
    }

    /// @dev Calculates filled quantity, bonuses, and payment owed for a bidder, caching results.
    function _computeAllocation(address account) internal returns (AllocationData memory) {
        RevealedBid[] storage bids = revealedBids[account];
        uint256 len = bids.length;
        AllocationData memory allocation;

        if (len == 0) {
            allocation.computed = true;
            accountAllocations[account] = allocation;
            return allocation;
        }

        uint256 clearingIdx = clearingTickIndex;
        uint256 remainingAtClearing = proRataNumerator;
        uint256 totalAtClearing = proRataDenominator;

        uint256 allocated;
        uint256 bonusTotal;

        for (uint256 i = 0; i < len; i++) {
            RevealedBid storage bid = bids[i];
            if (!bid.allocationComputed) {
                uint256 qty = bid.qty;
                uint256 allocatedQty;

                if (tokensSold == totalQtyRevealed && totalQtyRevealed < tokensForSale) {
                    allocatedQty = qty;
                } else if (bid.priceTickIndex < clearingIdx) {
                    allocatedQty = qty;
                } else if (bid.priceTickIndex == clearingIdx) {
                    if (totalAtClearing == 0 || remainingAtClearing == 0) {
                        allocatedQty = 0;
                    } else {
                        allocatedQty = (qty * remainingAtClearing) / totalAtClearing;
                    }
                } else {
                    allocatedQty = 0;
                }

                bid.allocatedQty = uint224(allocatedQty);
                bid.allocationComputed = true;
            }

            allocated += bid.allocatedQty;
            if (bid.bonusPct > 0) {
                bonusTotal += (bid.allocatedQty * bid.bonusPct) / BPS_DENOMINATOR;
            }
        }

        if (bonusTotal > bonusReserveRemaining) {
            bonusTotal = bonusReserveRemaining;
        }
        bonusReserveRemaining -= bonusTotal;

        uint256 paymentDue = allocated * clearingPrice;

        allocation = AllocationData({
            totalQty: allocated,
            bonusQty: bonusTotal,
            paymentDue: paymentDue,
            computed: true
        });

        accountAllocations[account] = allocation;
        return allocation;
    }

    /// @notice Recovers deposits when the auction fails or sells no tokens.
    /// @dev Returns both revealed deposits and unrevealed commitments, marking them withdrawn.
    function refundUnsuccessful() external nonReentrant {
        if (!finalized) revert AuctionNotFinalized();
        if (successful) revert AuctionNotFinalized();

        uint256 totalRefund = revealedDeposit[msg.sender];
        Commit[] storage userCommits = commits[msg.sender];
        uint256 len = userCommits.length;
        for (uint256 i = 0; i < len; i++) {
            Commit storage c = userCommits[i];
            if (!c.revealed && !c.withdrawn) {
                totalRefund += c.deposit;
                c.withdrawn = true;
            }
        }

        if (totalRefund == 0) revert NothingToClaim();

        revealedDeposit[msg.sender] = 0;

        (bool sent, ) = payable(msg.sender).call{value: totalRefund}("");
        if (!sent) revert TransferFailed();
        emit RefundIssued(msg.sender, totalRefund);
    }

    /// @notice Withdraws an unrevealed commit after finalization, applying penalties if successful.
    /// @dev Ensures each commit is only withdrawn once and accounts for treasury penalties.
    function withdrawUnrevealed(uint256 commitIndex) external nonReentrant {
        if (!finalized) revert AuctionNotFinalized();

        Commit storage userCommit = commits[msg.sender][commitIndex];
        if (userCommit.revealed || userCommit.withdrawn) revert NothingToClaim();

        uint256 deposit = userCommit.deposit;
        uint256 penalty;
        if (successful) {
            penalty = (deposit * nonRevealPenaltyBps) / BPS_DENOMINATOR;
            if (penalty > 0) {
                penaltyCollected += penalty;
                ethForTreasury += penalty;
            }
        }

        userCommit.withdrawn = true;

        uint256 refundAmount = deposit - penalty;
        if (refundAmount > 0) {
            (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
            if (!sent) revert TransferFailed();
            emit RefundIssued(msg.sender, refundAmount);
        }
    }

    /// @notice Transfers accumulated ETH proceeds to the treasury once the auction succeeds.
    /// @dev Zeroes the tracked amount before sending to guard against reentrancy.
    function withdrawTreasury(address payable recipient) external override onlyOwner {
        if (!finalized || !successful) revert AuctionNotFinalized();
        if (recipient == address(0)) revert InvalidCommit();

        uint256 amount = ethForTreasury;
        ethForTreasury = 0;
        if (amount > 0) {
            (bool sent, ) = recipient.call{value: amount}("");
            if (!sent) revert TransferFailed();
        }
    }

    /// @notice Adds more tokens to the bonus reserve used for early participation rewards.
    function updateBonusReserve(uint256 additionalReserve) external override onlyOwner {
        if (additionalReserve == 0) revert InvalidReserveIncrease();
        bonusReserve += additionalReserve;
        bonusReserveRemaining += additionalReserve;
    }

    /// @notice Updates vesting configuration that gates token unlocks during claims.
    function updateVesting(uint256 newStart, uint256 newDuration) external override onlyOwner {
        vestingStart = newStart;
        vestingDuration = newDuration;
        emit VestingUpdated(newStart, newDuration);
    }

    /// @notice Accepts direct ETH transfers (e.g., manual top-ups or keeper refunds).
    receive() external payable {}
}
