import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const BPS_DENOMINATOR = 10_000n;

interface AuctionTestConfig {
    startTime: bigint;
    commitDuration: bigint;
    revealDuration: bigint;
    perAddressCap: bigint;
    softCap: bigint;
    tokensForSale: bigint;
    bonusReserve: bigint;
    earlyBonusWindow: bigint;
    earlyBonusPct: bigint;
    nonRevealPenaltyBps: bigint;
    lbpStableShareBps: bigint;
    thresholdLow: bigint;
    maxDecayMultiplier: bigint;
    minCommitDuration: bigint;
    vestingStart: bigint;
    vestingCliff: bigint;
    vestingDuration: bigint;
    treasury: string;
    lbpTokenRecipient: string;
    lbpStableRecipient: string;
    merkleRoot: string;
    priceTicks: bigint[];
}

type FixtureContext = Awaited<ReturnType<typeof deployAuctionFixture>>;

function buildCommitHash(priceTickIndex: bigint, qty: bigint, nonce: string): string {
    return ethers.keccak256(abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTickIndex, qty, nonce]));
}

function randomNonce(): string {
    return ethers.hexlify(ethers.randomBytes(32));
}

async function commitBid(
    ctx: FixtureContext,
    params: { signer: any; priceTickIndex: bigint; qty: bigint; merkleProof?: string[] }
) {
    const { auction, priceTicks } = ctx;
    const nonce = randomNonce();
    const commitHash = buildCommitHash(params.priceTickIndex, params.qty, nonce);
    const deposit = params.qty * priceTicks[0];
    await auction
        .connect(params.signer)
        .commit(commitHash, params.merkleProof ?? [], { value: deposit });
    return { nonce, commitHash, deposit };
}

async function deployAuctionFixture(overrides: Partial<AuctionTestConfig> = {}) {
    const [deployer, treasurySigner, alice, bob, carol, outsider] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const initialSupply = 1_000_000n;
    const token = await tokenFactory.deploy(initialSupply);
    await token.waitForDeployment();

    const auctionFactory = await ethers.getContractFactory("DutchAuction");
    const auction = await auctionFactory.deploy(await token.getAddress(), await deployer.getAddress());
    await auction.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? 0);
    const defaultStart = now + 120n;
    const defaultCommitDuration = 900n;
    const defaultRevealDuration = 900n;
    const defaultPriceTicks = [
        ethers.parseUnits("0.003", 18),
        ethers.parseUnits("0.002", 18),
        ethers.parseUnits("0.001", 18)
    ];

    const finalConfig: AuctionTestConfig = {
        startTime: overrides.startTime ?? defaultStart,
        commitDuration: overrides.commitDuration ?? defaultCommitDuration,
        revealDuration: overrides.revealDuration ?? defaultRevealDuration,
        perAddressCap: overrides.perAddressCap ?? 200n,
        softCap: overrides.softCap ?? ethers.parseEther("0.2"),
        tokensForSale: overrides.tokensForSale ?? 150n,
        bonusReserve: overrides.bonusReserve ?? 30n,
        earlyBonusWindow: overrides.earlyBonusWindow ?? 300n,
        earlyBonusPct: overrides.earlyBonusPct ?? 500n, // 5%
        nonRevealPenaltyBps: overrides.nonRevealPenaltyBps ?? 100n, // 1%
        lbpStableShareBps: overrides.lbpStableShareBps ?? 0n,
        thresholdLow: overrides.thresholdLow ?? ethers.parseEther("0.1"),
        maxDecayMultiplier: overrides.maxDecayMultiplier ?? ethers.parseEther("2"),
        minCommitDuration: overrides.minCommitDuration ?? 300n,
        vestingStart: overrides.vestingStart ?? defaultStart,
        vestingCliff: overrides.vestingCliff ?? 0n,
        vestingDuration: overrides.vestingDuration ?? 0n,
        treasury: overrides.treasury ?? treasurySigner.address,
        lbpTokenRecipient: overrides.lbpTokenRecipient ?? ethers.ZeroAddress,
        lbpStableRecipient: overrides.lbpStableRecipient ?? ethers.ZeroAddress,
        merkleRoot: overrides.merkleRoot ?? ethers.ZeroHash,
        priceTicks: overrides.priceTicks ?? defaultPriceTicks
    };

    await auction.initializeAuction({
        startTime: finalConfig.startTime,
        commitDuration: finalConfig.commitDuration,
        revealDuration: finalConfig.revealDuration,
        perAddressCap: finalConfig.perAddressCap,
        softCap: finalConfig.softCap,
        tokensForSale: finalConfig.tokensForSale,
        bonusReserve: finalConfig.bonusReserve,
        earlyBonusWindow: finalConfig.earlyBonusWindow,
        earlyBonusPct: finalConfig.earlyBonusPct,
        nonRevealPenaltyBps: finalConfig.nonRevealPenaltyBps,
        lbpStableShareBps: finalConfig.lbpStableShareBps,
        thresholdLow: finalConfig.thresholdLow,
        maxDecayMultiplier: finalConfig.maxDecayMultiplier,
        minCommitDuration: finalConfig.minCommitDuration,
        vestingStart: finalConfig.vestingStart,
        vestingCliff: finalConfig.vestingCliff,
        vestingDuration: finalConfig.vestingDuration,
        treasury: finalConfig.treasury,
        lbpTokenRecipient: finalConfig.lbpTokenRecipient,
        lbpStableRecipient: finalConfig.lbpStableRecipient,
        merkleRoot: finalConfig.merkleRoot,
        priceTicks: finalConfig.priceTicks
    });

    const fundingAmount = finalConfig.tokensForSale + finalConfig.bonusReserve;
    await token.transfer(await auction.getAddress(), fundingAmount);

    const commitEndTime = finalConfig.startTime + finalConfig.commitDuration;
    const revealEndTime = commitEndTime + finalConfig.revealDuration;

    return {
        auction,
        token,
        deployer,
        treasury: treasurySigner,
        alice,
        bob,
        carol,
        outsider,
        config: finalConfig,
        priceTicks: finalConfig.priceTicks,
        startTime: finalConfig.startTime,
        commitEndTime,
        revealEndTime
    };
}
async function softCapFixture() {
    const softCapOverride = { softCap: ethers.parseEther("1") };
    return deployAuctionFixture(softCapOverride);
}

// npx hardhat test test/DutchAuctionCommitReveal/CommitRevealFlow.test.ts
describe("DutchAuction-Behaviors commit–reveal flow", function () {
    it("accepts commits and enforces per-address participation caps", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, priceTicks, startTime } = ctx;

        await time.increaseTo(startTime + 1n);

        const firstQty = 100n;
        const firstNonce = randomNonce();
        const firstHash = buildCommitHash(0n, firstQty, firstNonce);
        const firstDeposit = firstQty * priceTicks[0];

        await expect(
            auction.connect(alice).commit(firstHash, [], { value: firstDeposit })
        )
            .to.emit(auction, "CommitSubmitted")
            .withArgs(await alice.getAddress(), firstHash, firstDeposit, firstQty);

        const secondQty = 150n;
        const secondNonce = randomNonce();
        const secondHash = buildCommitHash(0n, secondQty, secondNonce);
        const secondDeposit = secondQty * priceTicks[0];

        await expect(
            auction.connect(alice).commit(secondHash, [], { value: secondDeposit })
        ).to.be.revertedWithCustomError(auction, "CapExceeded");
    });

    it("finalizes successfully, prorates at the clearing tick, and settles claims", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, token, deployer, treasury, alice, bob, carol, priceTicks, config, startTime, commitEndTime, revealEndTime } =
            ctx;

        await time.increaseTo(startTime + 1n);

        const aliceData = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 100n });
        const bobData = await commitBid(ctx, { signer: bob, priceTickIndex: 1n, qty: 80n });
        const carolData = await commitBid(ctx, { signer: carol, priceTickIndex: 1n, qty: 80n });

        await time.increaseTo(commitEndTime + 1n);

        await auction.connect(alice).reveal(0, 100n, aliceData.nonce, 0);
        await auction.connect(bob).reveal(1, 80n, bobData.nonce, 0);
        await auction.connect(carol).reveal(1, 80n, carolData.nonce, 0);

        await time.increaseTo(revealEndTime + 1n);

        const expectedClearingPrice = priceTicks[1];
        const expectedTotalRaised = config.tokensForSale * expectedClearingPrice;

        await expect(auction.finalize())
            .to.emit(auction, "AuctionFinalized")
            .withArgs(true, expectedClearingPrice, config.tokensForSale, expectedTotalRaised);

        expect(await auction.finalized()).to.equal(true);
        expect(await auction.successful()).to.equal(true);
        expect(await auction.clearingPrice()).to.equal(expectedClearingPrice);
        expect(await auction.tokensSold()).to.equal(config.tokensForSale);

        const aliceBonus = (100n * config.earlyBonusPct) / BPS_DENOMINATOR;
        const filledAboveClearing = 100n;
        const clearingBucket = 80n + 80n;
        const remainingAtClearing = config.tokensForSale - filledAboveClearing;
        const bobAllocated = (80n * remainingAtClearing) / clearingBucket;
        const carolAllocated = (80n * remainingAtClearing) / clearingBucket;
        const bobBonus = (bobAllocated * config.earlyBonusPct) / BPS_DENOMINATOR;
        const carolBonus = (carolAllocated * config.earlyBonusPct) / BPS_DENOMINATOR;

        const aliceRefund = aliceData.deposit - 100n * expectedClearingPrice;
        const bobRefund = bobData.deposit - bobAllocated * expectedClearingPrice;
        const carolRefund = carolData.deposit - carolAllocated * expectedClearingPrice;

        await auction.connect(alice).claim();
        await auction.connect(bob).claim();
        await auction.connect(carol).claim();

        expect(await token.balanceOf(await alice.getAddress())).to.equal(100n + aliceBonus);
        expect(await token.balanceOf(await bob.getAddress())).to.equal(bobAllocated + bobBonus);
        expect(await token.balanceOf(await carol.getAddress())).to.equal(carolAllocated + carolBonus);

        expect(await auction.refundedAmount(await alice.getAddress())).to.equal(aliceRefund);
        expect(await auction.refundedAmount(await bob.getAddress())).to.equal(bobRefund);
        expect(await auction.refundedAmount(await carol.getAddress())).to.equal(carolRefund);
        expect(await auction.bonusReserveRemaining()).to.equal(config.bonusReserve - (aliceBonus + bobBonus + carolBonus));

        expect(await auction.ethForTreasury()).to.equal(expectedTotalRaised);

        await expect(async () =>
            auction.connect(deployer).withdrawTreasury(await treasury.getAddress())
        ).to.changeEtherBalances(
            [treasury, auction],
            [expectedTotalRaised, -expectedTotalRaised]
        );
        expect(await auction.ethForTreasury()).to.equal(0n);
    });



    it("refunds deposits when the soft cap is not met", async function () {
        const ctx = await loadFixture(softCapFixture);
        const { auction, alice, priceTicks, startTime, commitEndTime, revealEndTime } = ctx;

        await time.increaseTo(startTime + 1n);

        const aliceData = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 50n });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, 50n, aliceData.nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await expect(auction.finalize())
            .to.emit(auction, "AuctionFinalized")
            .withArgs(false, 0, 0, 0);

        expect(await auction.successful()).to.equal(false);

        await expect(auction.connect(alice).refundUnsuccessful())
            .to.emit(auction, "RefundIssued")
            .withArgs(await alice.getAddress(), aliceData.deposit);

        expect(await auction.revealedDeposit(await alice.getAddress())).to.equal(0n);
    });

    it("applies non-reveal penalties and routes them to the treasury pool", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, bob, carol, priceTicks, config, startTime, commitEndTime, revealEndTime } = ctx;

        await time.increaseTo(startTime + 1n);

        const aliceData = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 100n });
        const bobData = await commitBid(ctx, { signer: bob, priceTickIndex: 1n, qty: 40n });
        const carolData = await commitBid(ctx, { signer: carol, priceTickIndex: 1n, qty: 80n });

        await time.increaseTo(commitEndTime + 1n);

        await auction.connect(alice).reveal(0, 100n, aliceData.nonce, 0);
        await auction.connect(carol).reveal(1, 80n, carolData.nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        await auction.connect(alice).claim();
        await auction.connect(carol).claim();

        const penalty = (bobData.deposit * config.nonRevealPenaltyBps) / BPS_DENOMINATOR;
        const expectedRefund = bobData.deposit - penalty;

        await expect(() =>
            auction.connect(bob).withdrawUnrevealed(0)
        ).to.changeEtherBalances(
            [bob, auction],
            [expectedRefund, -expectedRefund]
        );
        expect(await auction.penaltyCollected()).to.equal(penalty);
        expect(await auction.ethForTreasury()).to.equal(
            config.tokensForSale * priceTicks[1] + penalty
        );

        const commitRecord = await auction.commits(await bob.getAddress(), 0);
        expect(commitRecord.withdrawn).to.equal(true);
        expect(commitRecord.revealed).to.equal(false);
    });
});
