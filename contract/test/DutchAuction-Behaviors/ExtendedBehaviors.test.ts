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

function fixtureWithOverrides(overrides: Partial<AuctionTestConfig>) {
    async function fixture() {
        return deployAuctionFixture(overrides);
    }
    return fixture;
}

async function deployAuctionFixture(overrides: Partial<AuctionTestConfig> = {}) {
    const [deployer, treasurySigner, alice, bob, carol, dave] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const token = await tokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await token.waitForDeployment();

    const auctionFactory = await ethers.getContractFactory("DutchAuction");
    const auction = await auctionFactory.deploy(await token.getAddress(), await deployer.getAddress());
    await auction.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? 0);
    const defaultStart = now + 120n;

    const defaultPriceTicks = [
        ethers.parseUnits("0.003", 18),
        ethers.parseUnits("0.002", 18),
        ethers.parseUnits("0.001", 18)
    ];

    const finalConfig: AuctionTestConfig = {
        startTime: overrides.startTime ?? defaultStart,
        commitDuration: overrides.commitDuration ?? 900n,
        revealDuration: overrides.revealDuration ?? 900n,
        perAddressCap: overrides.perAddressCap ?? 500n,
        softCap: overrides.softCap ?? ethers.parseEther("0.1"),
        tokensForSale: overrides.tokensForSale ?? 200n,
        bonusReserve: overrides.bonusReserve ?? 40n,
        earlyBonusWindow: overrides.earlyBonusWindow ?? 300n,
        earlyBonusPct: overrides.earlyBonusPct ?? 500n,
        nonRevealPenaltyBps: overrides.nonRevealPenaltyBps ?? 100n,
        lbpStableShareBps: overrides.lbpStableShareBps ?? 2000n,
        thresholdLow: overrides.thresholdLow ?? ethers.parseEther("0.5"),
        maxDecayMultiplier: overrides.maxDecayMultiplier ?? ethers.parseEther("2"),
        minCommitDuration: overrides.minCommitDuration ?? 300n,
        vestingStart: overrides.vestingStart ?? defaultStart,
        vestingCliff: overrides.vestingCliff ?? 0n,
        vestingDuration: overrides.vestingDuration ?? 0n,
        treasury: overrides.treasury ?? treasurySigner.address,
        lbpTokenRecipient: overrides.lbpTokenRecipient ?? bob.address,
        lbpStableRecipient: overrides.lbpStableRecipient ?? bob.address,
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

    const fundingAmount = finalConfig.tokensForSale + finalConfig.bonusReserve + 10n;
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
        dave,
        config: finalConfig,
        priceTicks: finalConfig.priceTicks,
        startTime: finalConfig.startTime,
        commitEndTime,
        revealEndTime
    };
}

describe("DutchAuction-Behaviors extended behaviors", function () {
    it("reverts initialization with invalid parameters", async function () {
        const [, treasury] = await ethers.getSigners();
        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(1_000_000n);
        await token.waitForDeployment();
        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        const auction = await auctionFactory.deploy(await token.getAddress(), treasury.address);

        const baseConfig = {
            startTime: 0n,
            commitDuration: 400n,
            revealDuration: 1n,
            perAddressCap: 0n,
            softCap: 0n,
            tokensForSale: 100n,
            bonusReserve: 0n,
            earlyBonusWindow: 0n,
            earlyBonusPct: 0n,
            nonRevealPenaltyBps: 0n,
            lbpStableShareBps: 0n,
            thresholdLow: 0n,
            maxDecayMultiplier: ethers.parseEther("1"),
            minCommitDuration: 100n,
            vestingStart: 0n,
            vestingCliff: 0n,
            vestingDuration: 0n,
            treasury: treasury.address,
            lbpTokenRecipient: treasury.address,
            lbpStableRecipient: treasury.address,
            merkleRoot: ethers.ZeroHash,
            priceTicks: [2n, 1n]
        };

        await expect(
            auction.connect(treasury).initializeAuction({
                ...baseConfig,
                treasury: ethers.ZeroAddress
            })
        ).to.be.revertedWith("treasury zero");

        await expect(
            auction.connect(treasury).initializeAuction({
                ...baseConfig,
                priceTicks: [2n, 2n]
            })
        ).to.be.revertedWithCustomError(auction, "InvalidPriceTicks");

        await auction.connect(treasury).initializeAuction(baseConfig);

        await expect(auction.connect(treasury).initializeAuction(baseConfig)).to.be.revertedWithCustomError(
            auction,
            "AuctionFinalizedAlready"
        );
    });

    it("enforces commit and reveal windows with whitelist checks", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

        const firstNonce = ethers.hexlify(ethers.randomBytes(32));
        const firstQty = 490n;
        const firstHash = buildCommitHash(0n, firstQty, firstNonce);
        const firstDeposit = firstQty * priceTicks[0];

        await expect(
            auction.connect(alice).commit(firstHash, [], { value: firstDeposit })
        ).to.be.revertedWithCustomError(auction, "AuctionNotActive");

        await time.increaseTo(startTime + 1n);
        await auction.connect(alice).commit(firstHash, [], { value: firstDeposit });

        await expect(
            auction.connect(alice).reveal(0, firstQty, firstNonce, 0)
        ).to.be.revertedWithCustomError(auction, "RevealPhaseClosed");

        const secondNonce = ethers.hexlify(ethers.randomBytes(32));
        const secondQty = 20n;
        const secondHash = buildCommitHash(0n, secondQty, secondNonce);
        const secondDeposit = secondQty * priceTicks[0];
        await expect(
            auction.connect(alice).commit(secondHash, [], { value: secondDeposit })
        ).to.be.revertedWithCustomError(auction, "CapExceeded");

        await time.increaseTo(commitEndTime + 1n);
        await expect(
            auction.connect(alice).commit(secondHash, [], { value: secondDeposit })
        ).to.be.revertedWithCustomError(auction, "AuctionNotActive");

        await time.increase(1n);
        await auction.connect(alice).reveal(0, firstQty, firstNonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await expect(
            auction.connect(alice).reveal(0, firstQty, firstNonce, 0)
        ).to.be.revertedWithCustomError(auction, "RevealPhaseClosed");

        const whitelistRoot = ethers.keccak256(ethers.toUtf8Bytes("whitelist"));
        const whitelistCtx = await loadFixture(fixtureWithOverrides({ merkleRoot: whitelistRoot }));
        const whitelistCurrent = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
        let whitelistDelta = whitelistCtx.startTime + 10n - whitelistCurrent;
        if (whitelistDelta <= 0n) {
            whitelistDelta = 10n;
        }
        await time.increase(whitelistDelta);
        const unauthorizedNonce = ethers.hexlify(ethers.randomBytes(32));
        const unauthorizedHash = buildCommitHash(0n, 5n, unauthorizedNonce);
        const unauthorizedDeposit = 5n * whitelistCtx.priceTicks[0];
        await expect(
            whitelistCtx.auction
                .connect(whitelistCtx.dave)
                .commit(unauthorizedHash, [], { value: unauthorizedDeposit })
        ).to.be.revertedWithCustomError(whitelistCtx.auction, "InvalidProof");
    });

    it("adjusts reserve once when commitments lag", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                thresholdLow: ethers.parseEther("10"),
                commitDuration: 400n,
                minCommitDuration: 200n
            })
        );

        const { auction, startTime, commitEndTime, revealEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        await auction.updateDynamicReserve();

        const updatedCommitEnd = await auction.commitEndTime();
        const updatedRevealEnd = await auction.revealEndTime();
        expect(updatedCommitEnd).to.be.at.most(commitEndTime);
        expect(updatedRevealEnd).to.equal(updatedCommitEnd + (revealEndTime - commitEndTime));

        await expect(auction.updateDynamicReserve()).to.be.revertedWithCustomError(auction, "CommitPhaseComplete");
    });

    it("handles vesting cliffs and gradual unlocks", async function () {
        const latestBlock = await ethers.provider.getBlock("latest");
        const now = BigInt(latestBlock?.timestamp ?? 0);

        const ctx = await loadFixture(
            fixtureWithOverrides({
                startTime: now + 120n,
                vestingStart: now + 10_000n,
                vestingCliff: 300n,
                vestingDuration: 900n,
                tokensForSale: 90n,
                bonusReserve: 0n,
                perAddressCap: 100n,
                lbpStableShareBps: 0n
            })
        );

        const { auction, token, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;
        await time.increaseTo(startTime + 1n);

        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const qty = 90n;
        const commitHash = buildCommitHash(0n, qty, nonce);
        const deposit = qty * priceTicks[0];
        await auction.connect(alice).commit(commitHash, [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qty, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        const beforeCliffTimestamp = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
        expect(beforeCliffTimestamp).to.be.lt(ctx.config.vestingStart + ctx.config.vestingCliff);
        await expect(auction.connect(alice).claim.staticCall()).to.be.revertedWithCustomError(auction, "NothingToClaim");

        await time.increaseTo(ctx.config.vestingStart + ctx.config.vestingCliff - 1n);
        await expect(auction.connect(alice).claim.staticCall()).to.be.revertedWithCustomError(auction, "NothingToClaim");

        await time.increaseTo(ctx.config.vestingStart + ctx.config.vestingCliff + 1n);
        await auction.connect(alice).claim();
        const afterCliffBalance = await token.balanceOf(await alice.getAddress());
        expect(afterCliffBalance).to.be.gt(0n);

        await time.increaseTo(ctx.config.vestingStart + ctx.config.vestingDuration / 2n);
        await auction.connect(alice).claim();
        const midBalance = await token.balanceOf(await alice.getAddress());
        expect(midBalance).to.be.gt(afterCliffBalance);

        await time.increaseTo(ctx.config.vestingStart + ctx.config.vestingDuration + 1n);
        await auction.connect(alice).claim();
        expect(await token.balanceOf(await alice.getAddress())).to.equal(qty);
        await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
    });

    it("launches LBP once and respects inventory and recipients", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                lbpStableShareBps: 1_000n,
                tokensForSale: 200n,
                perAddressCap: 200n
            })
        );

        const { auction, token, alice, bob, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;
        await time.increaseTo(startTime + 1n);

        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const qty = 100n;
        await auction
            .connect(alice)
            .commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qty, nonce, 0);

        await expect(auction.launchLbp()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        const totalRaised = await auction.totalRaised();
        const expectedStableShare = (totalRaised * ctx.config.lbpStableShareBps) / BPS_DENOMINATOR;
        const tokensSold = await auction.tokensSold();
        const unsold = ctx.config.tokensForSale - tokensSold;
        const bobEthBefore = await ethers.provider.getBalance(await bob.getAddress());
        const treasuryBefore = await auction.ethForTreasury();

        await auction.connect(ctx.deployer).launchLbp();

        const bobEthAfter = await ethers.provider.getBalance(await bob.getAddress());
        expect(bobEthAfter - bobEthBefore).to.equal(expectedStableShare);
        expect(await token.balanceOf(await bob.getAddress())).to.equal(unsold);
        expect(await auction.ethForTreasury()).to.equal(treasuryBefore - expectedStableShare);
        expect(await auction.lbpLaunched()).to.equal(true);

        await expect(auction.launchLbp()).to.be.revertedWithCustomError(auction, "LBPAlreadyLaunched");

        const emptyCtx = await loadFixture(
            fixtureWithOverrides({
                tokensForSale: 100n,
                bonusReserve: 0n,
                perAddressCap: 100n,
                softCap: 0n,
                lbpStableRecipient: ethers.ZeroAddress
            })
        );
        await time.increaseTo(emptyCtx.startTime + 1n);
        const nonce2 = ethers.hexlify(ethers.randomBytes(32));
        await emptyCtx.auction
            .connect(emptyCtx.alice)
            .commit(buildCommitHash(0n, 50n, nonce2), [], { value: 50n * emptyCtx.priceTicks[0] });
        await time.increaseTo(emptyCtx.commitEndTime + 1n);
        await emptyCtx.auction.connect(emptyCtx.alice).reveal(0, 50n, nonce2, 0);
        await time.increaseTo(emptyCtx.revealEndTime + 1n);
        await emptyCtx.auction.finalize();
        await expect(emptyCtx.auction.launchLbp()).to.be.revertedWith("lbp stable recipient zero");
    });

    it("refunds correctly when auction fails with unrevealed commits", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                softCap: ethers.parseEther("10"),
                perAddressCap: 100n
            })
        );

        const { auction, alice, bob, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;
        await time.increaseTo(startTime + 1n);

        const aliceNonce = ethers.hexlify(ethers.randomBytes(32));
        await auction
            .connect(alice)
            .commit(buildCommitHash(0n, 50n, aliceNonce), [], { value: 50n * priceTicks[0] });

        const bobNonce = ethers.hexlify(ethers.randomBytes(32));
        await auction
            .connect(bob)
            .commit(buildCommitHash(0n, 50n, bobNonce), [], { value: 50n * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, 50n, aliceNonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();
        expect(await auction.successful()).to.equal(false);

        const aliceBalanceBefore = await ethers.provider.getBalance(await alice.getAddress());
        const bobBalanceBefore = await ethers.provider.getBalance(await bob.getAddress());

        const aliceRefundTx = await auction.connect(alice).refundUnsuccessful();
        const aliceRefundReceipt = await aliceRefundTx.wait();
        const aliceGas = aliceRefundReceipt ? aliceRefundReceipt.gasUsed * aliceRefundTx.gasPrice! : 0n;
        const bobRefundTx = await auction.connect(bob).refundUnsuccessful();
        const bobRefundReceipt = await bobRefundTx.wait();
        const bobGas = bobRefundReceipt ? bobRefundReceipt.gasUsed * bobRefundTx.gasPrice! : 0n;

        const aliceBalanceAfter = await ethers.provider.getBalance(await alice.getAddress());
        const bobBalanceAfter = await ethers.provider.getBalance(await bob.getAddress());

        expect(aliceBalanceAfter + aliceGas - aliceBalanceBefore).to.equal(50n * priceTicks[0]);
        expect(bobBalanceAfter + bobGas - bobBalanceBefore).to.equal(50n * priceTicks[0]);
    });

    it("caps bonuses when reserve is depleted", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                bonusReserve: 10n,
                earlyBonusPct: 2_000n,
                tokensForSale: 100n,
                perAddressCap: 100n
            })
        );
        const { auction, alice, bob, startTime, commitEndTime, revealEndTime, priceTicks, token } = ctx;

        await time.increaseTo(startTime + 1n);
        const aliceNonce = ethers.hexlify(ethers.randomBytes(32));
        const bobNonce = ethers.hexlify(ethers.randomBytes(32));

        await auction
            .connect(alice)
            .commit(buildCommitHash(0n, 80n, aliceNonce), [], { value: 80n * priceTicks[0] });
        await auction
            .connect(bob)
            .commit(buildCommitHash(0n, 80n, bobNonce), [], { value: 80n * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, 80n, aliceNonce, 0);
        await auction.connect(bob).reveal(0, 80n, bobNonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        await auction.connect(alice).claim();
        await auction.connect(bob).claim();

        const totalTokens = (await token.balanceOf(await alice.getAddress())) + (await token.balanceOf(await bob.getAddress()));
        expect(totalTokens - ctx.config.tokensForSale).to.equal(10n);
        expect(await auction.bonusReserveRemaining()).to.equal(0n);
    });

    it("restricts privileged functions to manager or owner", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        await auction
            .connect(alice)
            .commit(buildCommitHash(0n, 50n, nonce), [], { value: 50n * priceTicks[0] });
        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, 50n, nonce, 0);
        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        await expect(
            auction.connect(alice).finalize()
        ).to.be.revertedWithCustomError(auction, "NotManager");

        await expect(
            auction.connect(alice).launchLbp()
        ).to.be.revertedWithCustomError(auction, "NotManager");

        await expect(
            auction.connect(alice).withdrawTreasury(await alice.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("handles undersubscribed auctions without clearing tick", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                tokensForSale: 300n,
                perAddressCap: 200n
            })
        );

        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;
        await time.increaseTo(startTime + 1n);

        const nonce = ethers.hexlify(ethers.randomBytes(32));
        await auction
            .connect(alice)
            .commit(buildCommitHash(2n, 50n, nonce), [], { value: 50n * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(2, 50n, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        expect(await auction.tokensSold()).to.equal(50n);
        expect(await auction.clearingTickIndex()).to.equal(2n);
        expect(await auction.proRataDenominator()).to.equal(0n);
    });
});
