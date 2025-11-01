// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Commit–Reveal Dutch auction with dynamic reserve management and LBP transition
/// @notice Implements a production oriented Dutch auction with commit / reveal flow, per
/// participant caps, early participation bonuses, soft-cap handling, vesting and optional
/// transition of the remaining inventory into an LBP.
/// @dev Workflow: initialize with auction parameters → bidders commit with deposits → bidders
/// reveal to populate price buckets → optional dynamic reserve adjustment → finalize to determine
/// clearing price → manager optionally calls `launchLbp` for residual inventory → participants claim
/// vested tokens / refunds → losers and unrevealed deposits withdraw → manager withdraws proceeds.
contract DutchAuction is Ownable, ReentrancyGuard {
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

    struct AuctionConfig {
        uint256 startTime;
        uint256 commitDuration;
        uint256 revealDuration;
        uint256 perAddressCap;
        uint256 softCap;
        uint256 tokensForSale;
        uint256 bonusReserve;
        uint256 earlyBonusWindow;
        uint256 earlyBonusPct;
        uint256 nonRevealPenaltyBps;
        uint256 lbpStableShareBps;
        uint256 thresholdLow;
        uint256 maxDecayMultiplier;
        uint256 minCommitDuration;
        uint256 vestingStart;
        uint256 vestingDuration;
        address treasury;
        address lbpTokenRecipient;
        address payable lbpStableRecipient;
        bytes32 merkleRoot;
        uint256[] priceTicks;
    }

    struct AllocationData {
        uint256 totalQty;
        uint256 bonusQty;
        uint256 paymentDue;
        bool computed;
    }

    IERC20 public immutable saleToken;
    address public immutable presaleManager;

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

    event AuctionInitialized(uint256 startTime, uint256 commitEndTime, uint256 revealEndTime, uint256 tokensForSale);
    event CommitSubmitted(address indexed bidder, bytes32 indexed commitHash, uint256 deposit, uint256 impliedQty);
    event BidRevealed(address indexed bidder, uint256 indexed commitIndex, uint256 priceTickIndex, uint256 qty, uint256 bonusPct);
    event DynamicAdjustment(uint256 decayMultiplier, uint256 newCommitEndTime, uint256 totalDepositCommitted, uint256 totalCommitsCount);
    event AuctionFinalized(bool success, uint256 clearingPrice, uint256 tokensSold, uint256 totalRaised);
    event RefundIssued(address indexed bidder, uint256 amount);
    event BonusAllocated(address indexed bidder, uint256 bonusAmount);
    event LBPLaunched(address indexed tokenRecipient, address indexed stableRecipient, uint256 tokenAmount, uint256 stableAmount);
    event VestingUpdated(uint256 vestingStart, uint256 vestingDuration);

    error AuctionNotInitialized();
    error AuctionNotActive();
    error CommitPhaseComplete();
    error RevealPhaseClosed();
    error InvalidProof();
    error CapExceeded();
    error AlreadyRevealed();
    error InvalidCommit();
    error AuctionNotFinalized();
    error AuctionFinalizedAlready();
    error NothingToClaim();
    error InvalidPriceTicks();
    error NotManager();
    error LBPAlreadyLaunched();
    error NoInventoryForLBP();

    modifier onlyManager() {
        if (msg.sender != presaleManager) revert NotManager();
        _;
    }

    /// @notice Sets the ERC20 token being auctioned, presale manager, and initializes decay multiplier baseline.
    constructor(IERC20 saleToken_, address presaleManager_) {
        require(address(saleToken_) != address(0), "saleToken zero");
        require(presaleManager_ != address(0), "manager zero");
        saleToken = saleToken_;
        presaleManager = presaleManager_;
        decayMultiplier = 1e18;
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
    function initializeAuction(AuctionConfig calldata config) external onlyManager {
        if (initialized) revert AuctionFinalizedAlready();
        require(config.treasury != address(0), "treasury zero");
        require(config.tokensForSale > 0, "tokensForSale zero");
        require(config.commitDuration >= config.minCommitDuration, "commit duration");
        require(config.revealDuration > 0, "reveal duration");
        require(config.priceTicks.length > 0, "ticks empty");
        require(config.nonRevealPenaltyBps <= BPS_DENOMINATOR, "penalty bps");
        require(config.earlyBonusPct <= BPS_DENOMINATOR, "bonus pct");
        require(config.lbpStableShareBps <= BPS_DENOMINATOR, "lbp share");
        require(config.maxDecayMultiplier >= 1e18, "decay range");

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

        if (merkleRoot != bytes32(0)) {
            bool verified = MerkleProof.verify(merkleProof, merkleRoot, keccak256(abi.encodePacked(msg.sender)));
            if (!verified) revert InvalidProof();
        }

        uint256 impliedQty = msg.value / priceTicks[0];
        require(impliedQty > 0, "deposit too small");
        require(impliedQty * priceTicks[0] == msg.value, "deposit mismatch");

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

        bytes32 expectedHash = keccak256(abi.encode(priceTickIndex, qty, nonce));
        if (expectedHash != userCommit.commitHash) revert InvalidCommit();

        uint256 deposit = uint256(userCommit.deposit);
        require(deposit == qty * priceTicks[0], "deposit/qty mismatch");

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
    function updateDynamicReserve() external onlyManager {
        if (!initialized) revert AuctionNotInitialized();
        if (block.timestamp > commitEndTime) revert CommitPhaseComplete();
        if (dynamicAdjustmentCount > 0) revert CommitPhaseComplete();

        if (totalDepositCommitted < thresholdLow) {
            if (decayMultiplier < maxDecayMultiplier) {
                decayMultiplier = maxDecayMultiplier;
            }

            uint256 reduction = ((initialCommitEndTime - startTime) * 25) / 100;
            uint256 targetEnd = commitEndTime > reduction ? commitEndTime - reduction : startTime + minCommitDuration;
            uint256 minEndTime = startTime + minCommitDuration;
            if (targetEnd < minEndTime) {
                targetEnd = minEndTime;
            }
            if (targetEnd < commitEndTime) {
                commitEndTime = targetEnd;
                revealEndTime = commitEndTime + (revealEndTime - initialCommitEndTime);
            }

            dynamicAdjustmentCount += 1;
            emit DynamicAdjustment(decayMultiplier, commitEndTime, totalDepositCommitted, totalCommitsCount);
        }
    }

    /// @notice Concludes the auction, calculating clearing price, settlements, and LBP flow.
    /// @dev Reverts until reveal window closes; marks success or failure based on soft cap.
    function finalize() external onlyManager nonReentrant {
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
    function launchLbp() external onlyManager nonReentrant {
        if (!finalized || !successful) revert AuctionNotFinalized();
        if (lbpLaunched) revert LBPAlreadyLaunched();

        uint256 unsoldTokens = tokensForSale - tokensSold;
        if (unsoldTokens == 0) revert NoInventoryForLBP();
        uint256 stableForLBP = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR;
        if (stableForLBP > ethForTreasury) {
            stableForLBP = ethForTreasury;
        }

        require(lbpTokenRecipient != address(0), "lbp token recipient zero");

        saleToken.safeTransfer(lbpTokenRecipient, unsoldTokens);

        if (stableForLBP > 0) {
            require(lbpStableRecipient != address(0), "lbp stable recipient zero");
            ethForTreasury -= stableForLBP;
            (bool sent, ) = lbpStableRecipient.call{value: stableForLBP}("");
            require(sent, "lbp stable transfer failed");
        }

        lbpLaunched = true;
        emit LBPLaunched(lbpTokenRecipient, lbpStableRecipient, unsoldTokens, stableForLBP);
    }

    /// @dev Walks price buckets top-down to establish clearing tick and pro-rata parameters.
    function _determineClearingPrice() internal {
        uint256 cumulative;
        uint256 clearingIdx = type(uint256).max;
        uint256 ticksLength = priceTicks.length;

        for (uint256 i = 0; i < ticksLength; i++) {
            cumulative += priceBucketTotals[i];
            if (cumulative >= tokensForSale && clearingIdx == type(uint256).max) {
                clearingIdx = i;
                filledAboveClearing = cumulative - priceBucketTotals[i];
                totalAtClearingTick = priceBucketTotals[i];
            }
        }

        if (clearingIdx == type(uint256).max) {
            tokensSold = cumulative;
            if (ticksLength == 0) {
                clearingTickIndex = 0;
                clearingPrice = 0;
            } else {
                clearingTickIndex = ticksLength - 1;
                clearingPrice = priceTicks[ticksLength - 1];
            }
            totalRaised = tokensSold * clearingPrice;
            proRataNumerator = 0;
            proRataDenominator = 0;
        } else {
            clearingTickIndex = clearingIdx;
            clearingPrice = priceTicks[clearingIdx];
            tokensSold = tokensForSale;
            uint256 remaining = tokensForSale - filledAboveClearing;
            proRataNumerator = remaining;
            proRataDenominator = totalAtClearingTick;
            totalRaised = tokensSold * clearingPrice;
        }
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

        uint256 unlocked = _vestedFraction();
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
            require(sent, "refund failed");
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
        require(sent, "refund failed");
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
            require(sent, "refund failed");
            emit RefundIssued(msg.sender, refundAmount);
        }
    }

    /// @notice Transfers accumulated ETH proceeds to the treasury once the auction succeeds.
    /// @dev Zeroes the tracked amount before sending to guard against reentrancy.
    function withdrawTreasury(address payable recipient) external onlyOwner {
        if (!finalized || !successful) revert AuctionNotFinalized();
        if (recipient == address(0)) revert InvalidCommit();

        uint256 amount = ethForTreasury;
        ethForTreasury = 0;
        if (amount > 0) {
            (bool sent, ) = recipient.call{value: amount}("");
            require(sent, "treasury transfer failed");
        }
    }

    /// @dev Computes vesting progress as basis points relative to start, cliff, and duration.
    function _vestedFraction() internal view returns (uint256) {
        if (vestingDuration == 0) {
            return BPS_DENOMINATOR;
        }
        if (block.timestamp >= vestingStart + vestingDuration) {
            return BPS_DENOMINATOR;
        }
        return 0;
    }

    /// @notice Adds more tokens to the bonus reserve used for early participation rewards.
    function updateBonusReserve(uint256 additionalReserve) external onlyOwner {
        require(additionalReserve > 0, "invalid reserve");
        bonusReserve += additionalReserve;
        bonusReserveRemaining += additionalReserve;
    }

    /// @notice Updates vesting configuration that gates token unlocks during claims.
    function updateVesting(uint256 newStart, uint256 newDuration) external onlyOwner {
        vestingStart = newStart;
        vestingDuration = newDuration;
        emit VestingUpdated(newStart, newDuration);
    }

    /// @notice Accepts direct ETH transfers (e.g., manual top-ups or keeper refunds).
    receive() external payable {}
}
