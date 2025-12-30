// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
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
        uint32 bonusPct; // DEPRECATED: kept for storage compatibility, use isEarly instead
        bool isEarly; // NEW: marks if bid was committed during early bonus window
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
    string public whitelistCID; // IPFS CID of whitelist

    uint256[] public priceTicks;
    mapping(uint256 => uint256) public priceBucketTotals;

    uint256 public decayMultiplier;
    uint256 public dynamicAdjustmentCount;

    mapping(address => Commit[]) public commits;
    mapping(address => RevealedBid[]) public revealedBids;
    mapping(address => uint256) public committedQty;
    mapping(address => uint256) public revealedQty;
    mapping(address => uint256) public revealedDeposit;
    
    // Merkle-based bonus tracking
    address[] public earlyParticipants; // List of accounts with early bids (for off-chain computation)
    mapping(address => bool) public isEarlyParticipant; // Quick lookup to avoid duplicates
    bytes32 public bonusMerkleRoot; // Merkle root of bonus allocations (set after finalize)
    string public bonusAllocationsCID; // IPFS CID of bonus allocations JSON (set after finalize)
    mapping(address => bool) public bonusClaimed; // Track claimed bonuses to prevent double claims

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

    /// @notice Returns the number of early participants (for off-chain computation).
    function earlyParticipantsCount() external view returns (uint256) {
        return earlyParticipants.length;
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
    /// @dev Checks whitelist proof, per-address cap, and ensures deposit maps to quantity in wei.
    /// @notice All qty values are stored in wei (18 decimals) to support fractional token amounts.
    function commit(bytes32 commitHash, bytes32[] calldata merkleProof) external payable nonReentrant {
        if (!initialized) revert AuctionNotInitialized();
        if (block.timestamp < startTime || block.timestamp > commitEndTime) revert AuctionNotActive();
        if (msg.value == 0) revert InvalidCommit();

        if (!CommitLib.verifyWhitelist(merkleRoot, merkleProof, msg.sender)) revert InvalidProof();

        // Calculate implied qty in wei: qtyWei = (msg.value * 1e18) / priceTicks[0]
        // priceTicks[0] is in wei (ETH per token), msg.value is in wei (ETH deposit)
        // Example: msg.value = 1.5 ETH = 1.5e18 wei, priceTicks[0] = 1 ETH = 1e18 wei
        // => impliedQty = (1.5e18 * 1e18) / 1e18 = 1.5e18 wei (1.5 tokens)
        uint256 impliedQty = (msg.value * 1e18) / priceTicks[0];
        if (impliedQty == 0) revert DepositTooSmall();
        // Verify deposit matches: deposit = (qty * priceTicks[0]) / 1e18
        if (!CommitLib.depositMatches(msg.value, impliedQty, priceTicks[0])) revert DepositMismatch();

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
    /// @param qty Token quantity in wei (18 decimals). Example: 1.5 tokens = 1.5e18 wei.
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

        // Determine early eligibility based on commit time only
        // No bonus calculation or reserve deduction happens here
        bool isEarly = (userCommit.commitTime <= startTime + earlyBonusWindow) && (earlyBonusPct > 0);

        userCommit.revealed = true;

        revealedBids[msg.sender].push(
            RevealedBid({
                bidder: msg.sender,
                priceTickIndex: uint32(priceTickIndex),
                qty: uint224(qty),
                bonusPct: 0, // DEPRECATED: no longer used
                isEarly: isEarly,
                allocationComputed: false,
                allocatedQty: 0
            })
        );

        // Track early participants for post-finalize bonus calculation
        if (isEarly && !isEarlyParticipant[msg.sender]) {
            earlyParticipants.push(msg.sender);
            isEarlyParticipant[msg.sender] = true;
        }

        revealedQty[msg.sender] += qty;
        revealedDeposit[msg.sender] += deposit;
        totalDepositsRevealed += deposit;
        totalQtyRevealed += qty;
        priceBucketTotals[priceTickIndex] += qty;

        // Emit with isEarly flag (using bonusPct field for backward compatibility in event)
        emit BidRevealed(msg.sender, commitIndex, priceTickIndex, qty, isEarly ? earlyBonusPct : 0);
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

        if (tokensSold == 0 || totalDepositsRevealed < softCap) {
            successful = false;
            finalized = true;
            clearingPrice = 0;
            emit AuctionFinalized(false, 0, 0, 0);
            return;
        }

        successful = true;
        finalized = true;

        // tokensSold is in wei, clearingPrice is in wei (ETH per token)
        // totalPaymentsDue in wei (ETH) = (tokensSold * clearingPrice) / 1e18
        uint256 totalPaymentsDue = (tokensSold * clearingPrice) / 1e18;
        ethForTreasury = totalPaymentsDue;

        // Bonuses are computed off-chain and set via setBonusMerkleRoot()
        // No on-chain iteration over early participants

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

        // Automatically send remaining ETH to treasury after LBP portion is deducted
        uint256 remainingTreasury = ethForTreasury;
        if (remainingTreasury > 0) {
            ethForTreasury = 0;
            (bool treasurySent, ) = payable(treasury).call{value: remainingTreasury}("");
            if (!treasurySent) revert TransferFailed();
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

    /// @notice Sets the Merkle root and IPFS CID for bonus allocations (callable only once by owner, manager, or manager's owner after finalize).
    /// @dev The Merkle root represents off-chain computed bonus allocations for early participants.
    ///      The IPFS CID points to the JSON file containing all bonus allocations and Merkle proofs.
    ///      Both values are immutable after being set to ensure data integrity.
    /// @param root The Merkle root of bonus allocations (leaf = keccak256(address, bonusQty))
    /// @param cid The IPFS Content Identifier (CID) of the bonus allocations JSON file
    function setBonusMerkleRoot(bytes32 root, string calldata cid) external {
        // Allow owner, manager, or owner of manager to set root
        bool isAuctionOwner = msg.sender == owner();
        bool isManager = msg.sender == presaleManager;
        bool isManagerOwner = false;
        
        // Check if msg.sender is owner of PresaleManager contract using low-level call
        // PresaleManager uses Ownable, so owner() is a view function
        if (!isAuctionOwner && !isManager && presaleManager != address(0)) {
            (bool success, bytes memory data) = presaleManager.staticcall(
                abi.encodeWithSignature("owner()")
            );
            if (success && data.length >= 32) {
                address managerOwner = abi.decode(data, (address));
                isManagerOwner = (managerOwner == msg.sender);
            }
        }
        
        if (!isAuctionOwner && !isManager && !isManagerOwner) revert NotOwner();
        if (!finalized) revert AuctionNotFinalized();
        if (bonusMerkleRoot != bytes32(0)) revert AuctionFinalizedAlready(); // Can only set once
        if (root == bytes32(0)) revert InvalidCommit(); // Root cannot be zero
        
        bonusMerkleRoot = root;
        bonusAllocationsCID = cid;
        emit BonusMerkleRootSet(root, cid);
    }

    /// @notice Sets the IPFS CID for whitelist JSON file (callable by owner, manager, or manager's owner).
    /// @param cid The IPFS Content Identifier (CID) of the whitelist JSON file
    function setWhitelistCID(string calldata cid) external {
        // Allow owner, manager, or owner of manager to set CID
        bool isAuctionOwner = msg.sender == owner();
        bool isManager = msg.sender == presaleManager;
        bool isManagerOwner = false;
        
        if (!isAuctionOwner && !isManager && presaleManager != address(0)) {
            (bool success, bytes memory data) = presaleManager.staticcall(
                abi.encodeWithSignature("owner()")
            );
            if (success && data.length >= 32) {
                address managerOwner = abi.decode(data, (address));
                isManagerOwner = (managerOwner == msg.sender);
            }
        }
        
        if (!isAuctionOwner && !isManager && !isManagerOwner) revert NotOwner();
        
        whitelistCID = cid;
        emit WhitelistCIDSet(cid);
    }

    /// @dev Computes base allocation (without bonus) for a participant.
    /// @notice This is a helper function that computes only the base allocation,
    /// without any bonus calculations.
    function _computeBaseAllocation(address account) internal {
        RevealedBid[] storage bids = revealedBids[account];
        uint256 len = bids.length;

        if (len == 0) {
            accountAllocations[account] = AllocationData({
                totalQty: 0,
                bonusQty: 0,
                paymentDue: 0,
                computed: true
            });
            return;
        }

        uint256 clearingIdx = clearingTickIndex;
        uint256 remainingAtClearing = proRataNumerator;
        uint256 totalAtClearing = proRataDenominator;

        uint256 allocated = 0;

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
        }

        // allocated is in wei (token amount), clearingPrice is in wei (ETH per token)
        // paymentDue in wei (ETH) = (allocated * clearingPrice) / 1e18
        uint256 paymentDue = (allocated * clearingPrice) / 1e18;

        accountAllocations[account] = AllocationData({
            totalQty: allocated,
            bonusQty: 0, // Will be set during claim() after Merkle proof verification
            paymentDue: paymentDue,
            computed: true
        });
    }

    /// @notice Claims vested tokens and outstanding refunds for a winning participant.
    /// @dev Lazily computes allocation, verifies bonus Merkle proof (if provided), transfers tokens, and returns surplus ETH.
    /// @param bonusQty The bonus token amount (verified via Merkle proof). Pass 0 if no bonus or not an early participant.
    /// @param merkleProof The Merkle proof for the bonus allocation. Pass empty array if no bonus.
    function claim(uint256 bonusQty, bytes32[] calldata merkleProof) external nonReentrant {
        if (!finalized) revert AuctionNotFinalized();
        if (!successful) revert AuctionNotFinalized();

        if (!accountAllocations[msg.sender].computed) {
            _computeAllocation(msg.sender);
        }
        AllocationData storage allocation = accountAllocations[msg.sender];

        // Verify bonus Merkle proof if bonus is claimed
        uint256 verifiedBonusQty = 0;
        if (bonusQty > 0) {
            if (bonusMerkleRoot == bytes32(0)) revert AuctionNotFinalized();
            if (bonusClaimed[msg.sender]) revert InvalidCommit(); // Prevent double claims
            
            // Compute leaf hash: keccak256(address, bonusQty)
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender, bonusQty));
            
            // Verify Merkle proof
            if (!MerkleProof.verify(merkleProof, bonusMerkleRoot, leaf)) {
                revert InvalidCommit(); // Invalid proof
            }
            
            // Ensure bonus doesn't exceed remaining reserve
            if (bonusQty > bonusReserveRemaining) {
                revert InvalidCommit(); // Bonus exceeds reserve
            }
            
            verifiedBonusQty = bonusQty;
            bonusClaimed[msg.sender] = true;
            bonusReserveRemaining -= verifiedBonusQty;
            
            // Update allocation with verified bonus
            allocation.bonusQty = verifiedBonusQty;
        }

        uint256 unlocked = VestingMath.cliffOnlyFraction(vestingStart, vestingDuration);
        // Use allocation.bonusQty if bonus was already claimed, otherwise use verifiedBonusQty
        // This ensures that if bonus was claimed in a previous transaction, it's still included
        uint256 effectiveBonusQty = allocation.bonusQty > 0 ? allocation.bonusQty : verifiedBonusQty;
        uint256 totalTokensDue = allocation.totalQty + effectiveBonusQty;
        uint256 vestedTokens = (totalTokensDue * unlocked) / BPS_DENOMINATOR;

        uint256 tokensToSend = vestedTokens - tokensClaimed[msg.sender];
        if (tokensToSend > 0) {
            tokensClaimed[msg.sender] += tokensToSend;
            saleToken.safeTransfer(msg.sender, tokensToSend);
            if (effectiveBonusQty > 0) {
                uint256 bonusPortion = (tokensToSend * effectiveBonusQty) / (allocation.totalQty + effectiveBonusQty);
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

    /// @dev Calculates filled quantity and payment owed for a bidder, caching results.
    /// @notice Bonus amounts are verified via Merkle proofs during claim(), not computed here.
    function _computeAllocation(address account) internal returns (AllocationData memory) {
        // Compute base allocation if not already computed
        if (!accountAllocations[account].computed) {
            _computeBaseAllocation(account);
        }

        AllocationData storage allocation = accountAllocations[account];
        // bonusQty is set to 0 here and will be updated during claim() after Merkle proof verification
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

    /// @notice Returns all remaining tokens to the auction owner when auction is not successful.
    /// @dev Can only be called after finalization if auction was not successful.
    /// @dev If owner is PresaleManager, returns tokens to PresaleManager's owner instead.
    function returnTokensToOwner() external onlyOwner {
        if (!finalized) revert AuctionNotFinalized();
        if (successful) revert AuctionNotFinalized(); // Only for unsuccessful auctions

        address ownerAddress = owner();
        if (ownerAddress == address(0)) revert InvalidCommit();

        // If owner is PresaleManager, get the PresaleManager's owner
        if (ownerAddress == presaleManager) {
            try Ownable(presaleManager).owner() returns (address presaleManagerOwner) {
                if (presaleManagerOwner != address(0)) {
                    ownerAddress = presaleManagerOwner;
                }
            } catch {
                // If we can't get PresaleManager's owner, use PresaleManager address
            }
        }

        uint256 balance = saleToken.balanceOf(address(this));
        if (balance > 0) {
            saleToken.safeTransfer(ownerAddress, balance);
            emit TokensReturned(ownerAddress, balance);
        }
    }

    /// @notice Accepts direct ETH transfers (e.g., manual top-ups or keeper refunds).
    receive() external payable {}
}
