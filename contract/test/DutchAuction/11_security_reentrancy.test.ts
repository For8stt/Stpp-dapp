import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { buildCommitHash, randomNonce } from "./utils/dutchAuctionFixtures";

interface ReentrancyFixture {
    owner: any;
    treasury: any;
    alice: any;
    bob: any;
    attacker: Contract;
    auction: Contract;
    token: Contract;
    config: any;
    priceTicks: bigint[];
    startTime: bigint;
    commitEndTime: bigint;
    revealEndTime: bigint;
}

const REENTRANCY_ERROR = "ReentrancyGuard: reentrant call";

function decodeRevert(data: string): string {
    if (!data || data === "0x") return "";
    if (data.startsWith("0x08c379a0") && data.length >= 10) {
        const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], `0x${data.slice(10)}`);
        return reason[0] as string;
    }
    return data;
}

async function baseReentrancyFixture(overrides: { softCap: bigint; tokensForSale?: bigint }): Promise<ReentrancyFixture> {
    const [owner, treasury, alice, bob] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const token = await tokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await token.waitForDeployment();

    const attackerFactory = await ethers.getContractFactory("ReentrantDutchAuctionAttacker");
    const attacker = await attackerFactory.deploy();
    await attacker.waitForDeployment();

    const auctionFactory = await ethers.getContractFactory("DutchAuction");
    const auction = await auctionFactory.deploy(await token.getAddress(), await attacker.getAddress());
    await auction.waitForDeployment();

    await attacker.setAuction(await auction.getAddress());

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? 0);
    const startTime = now + 120n;
    const commitDuration = 900n;
    const revealDuration = 900n;

    const priceTicks = [
        ethers.parseUnits("0.003", 18),
        ethers.parseUnits("0.002", 18),
        ethers.parseUnits("0.001", 18)
    ];

    const tokensForSale = overrides.tokensForSale ?? 60n;

    const config = {
        startTime,
        commitDuration,
        revealDuration,
        perAddressCap: 200n,
        softCap: overrides.softCap,
        tokensForSale,
        bonusReserve: 20n,
        earlyBonusWindow: 300n,
        earlyBonusPct: 500n,
        nonRevealPenaltyBps: 100n,
        lbpStableShareBps: 0n,
        thresholdLow: ethers.parseEther("0.1"),
        maxDecayMultiplier: ethers.parseEther("2"),
        minCommitDuration: 300n,
        vestingStart: startTime,
        vestingDuration: 0n,
        treasury: await treasury.getAddress(),
        lbpTokenRecipient: ethers.ZeroAddress,
        lbpStableRecipient: ethers.ZeroAddress,
        merkleRoot: ethers.ZeroHash,
        priceTicks
    };

    await attacker.initializeAuction(config);
    await token.transfer(await auction.getAddress(), tokensForSale + config.bonusReserve + 10n);

    const commitEndTime = startTime + commitDuration;
    const revealEndTime = commitEndTime + revealDuration;

    return {
        owner,
        treasury,
        alice,
        bob,
        attacker,
        auction,
        token,
        config,
        priceTicks,
        startTime,
        commitEndTime,
        revealEndTime
    };
}

async function successfulReentrancyFixture(): Promise<ReentrancyFixture> {
    return baseReentrancyFixture({ softCap: ethers.parseEther("0.02"), tokensForSale: 60n });
}

async function unsuccessfulReentrancyFixture(): Promise<ReentrancyFixture> {
    return baseReentrancyFixture({ softCap: ethers.parseEther("10"), tokensForSale: 60n });
}

describe("DutchAuction – 11_security_reentrancy", function () {
    const MODE = {
        COMMIT: 1,
        REVEAL: 2,
        FINALIZE: 3,
        CLAIM: 4,
        REFUND: 5,
        WITHDRAW_UNREVEALED: 6,
        WITHDRAW_TREASURY: 7,
        CROSS_FUNCTION: 8
    } as const;

    async function prepareSuccessfulAuction(ctx: ReentrancyFixture, qty: bigint = 60n, priceTickIndex: bigint = 2n) {
        await time.increaseTo(ctx.startTime + 1n);
        const nonce = randomNonce();
        const commitHash = buildCommitHash(priceTickIndex, qty, nonce);
        await ctx.attacker.commitBid(commitHash, [], { value: qty * ctx.priceTicks[0] });
        await time.increaseTo(ctx.commitEndTime + 1n);
        await ctx.attacker.revealBid(Number(priceTickIndex), qty, nonce, 0);
        await time.increaseTo(ctx.revealEndTime + 1n);
        await ctx.attacker.finalizeAuction();
        expect(await ctx.auction.successful()).to.equal(true);
        return { nonce, qty, priceTickIndex };
    }

    async function prepareUnsuccessfulAuction(ctx: ReentrancyFixture) {
        await time.increaseTo(ctx.startTime + 1n);

        const nonceRevealed = randomNonce();
        const revealedQty = 30n;
        await ctx.attacker.commitBid(buildCommitHash(0n, revealedQty, nonceRevealed), [], {
            value: revealedQty * ctx.priceTicks[0]
        });

        const nonceHidden = randomNonce();
        const hiddenQty = 20n;
        await ctx.attacker.commitBid(buildCommitHash(0n, hiddenQty, nonceHidden), [], {
            value: hiddenQty * ctx.priceTicks[0]
        });

        await time.increaseTo(ctx.commitEndTime + 1n);
        await ctx.attacker.revealBid(0, revealedQty, nonceRevealed, 0);

        await time.increaseTo(ctx.revealEndTime + 1n);
        await ctx.attacker.finalizeAuction();
        expect(await ctx.auction.successful()).to.equal(false);

        return { nonceRevealed, revealedQty, nonceHidden, hiddenQty };
    }

    it("should prevent reentrancy on commit using reentrant attacker contract", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);
        await prepareSuccessfulAuction(ctx);

        const payload = ctx.auction.interface.encodeFunctionData("commit", [ethers.ZeroHash, []]);
        await ctx.attacker.attackClaim(MODE.COMMIT, payload, 0);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });

    it("should prevent reentrancy on reveal", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);
        await prepareSuccessfulAuction(ctx);

        const payload = ctx.auction.interface.encodeFunctionData("reveal", [0, 0, ethers.ZeroHash, 0]);
        await ctx.attacker.attackClaim(MODE.REVEAL, payload, 0);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });

    it("should prevent reentrancy on finalize", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);
        await prepareSuccessfulAuction(ctx);

        const payload = ctx.auction.interface.encodeFunctionData("finalize", []);
        await ctx.attacker.attackClaim(MODE.FINALIZE, payload, 0);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });

    it("should prevent reentrancy on claim", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);
        await prepareSuccessfulAuction(ctx);

        const payload = ctx.auction.interface.encodeFunctionData("claim", []);
        await ctx.attacker.attackClaim(MODE.CLAIM, payload, 0);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });

    it("should prevent reentrancy on refundUnsuccessful", async function () {
        const ctx = await loadFixture(unsuccessfulReentrancyFixture);
        await prepareUnsuccessfulAuction(ctx);

        const payload = ctx.auction.interface.encodeFunctionData("refundUnsuccessful", []);
        await ctx.attacker.attackRefund(MODE.REFUND, payload, 0);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });

    it("should prevent reentrancy on withdrawUnrevealed", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);

        await time.increaseTo(ctx.startTime + 1n);
        const revealedNonce = randomNonce();
        const unrevealedNonce = randomNonce();
        const qty = 20n;

        await ctx.attacker.commitBid(buildCommitHash(0n, qty, revealedNonce), [], { value: qty * ctx.priceTicks[0] });
        await ctx.attacker.commitBid(buildCommitHash(0n, qty, unrevealedNonce), [], {
            value: qty * ctx.priceTicks[0]
        });

        await time.increaseTo(ctx.commitEndTime + 1n);
        await ctx.attacker.revealBid(0, qty, revealedNonce, 0);

        await time.increaseTo(ctx.revealEndTime + 1n);
        await ctx.attacker.finalizeAuction();

        const payload = ctx.auction.interface.encodeFunctionData("withdrawUnrevealed", [1]);
        await ctx.attacker.attackWithdrawUnrevealed(MODE.WITHDRAW_UNREVEALED, payload, 0, 1);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });

    it("should prevent reentrancy on withdrawTreasury", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);
        await prepareSuccessfulAuction(ctx);

        const attackerAddress = await ctx.attacker.getAddress();
        await ctx.auction.connect(ctx.owner).transferOwnership(attackerAddress);

        const payload = ctx.auction.interface.encodeFunctionData("withdrawTreasury", [attackerAddress]);
        const amountBefore = await ctx.auction.ethForTreasury();
        const balanceBefore = await ethers.provider.getBalance(attackerAddress);
        await ctx.attacker.attackWithdrawTreasury(MODE.WITHDRAW_TREASURY, payload, 0, attackerAddress);

        const balanceAfter = await ethers.provider.getBalance(attackerAddress);

        expect(balanceAfter - balanceBefore).to.equal(amountBefore);
        expect(await ctx.auction.ethForTreasury()).to.equal(0n);
        expect(await ctx.attacker.lastReenterSuccess()).to.equal(true);
        expect(await ctx.attacker.lastRevertData()).to.equal("0x");
    });

    it("should confirm nonReentrant modifier is effective across external functions", async function () {
        const ctx = await loadFixture(successfulReentrancyFixture);

        await time.increaseTo(ctx.startTime + 1n);
        const nonce = randomNonce();
        const qty = 40n;
        await ctx.attacker.commitBid(buildCommitHash(0n, qty, nonce), [], { value: qty * ctx.priceTicks[0] });
        const unrevealedNonce = randomNonce();
        await ctx.attacker.commitBid(buildCommitHash(0n, qty, unrevealedNonce), [], { value: qty * ctx.priceTicks[0] });

        await time.increaseTo(ctx.commitEndTime + 1n);
        await ctx.attacker.revealBid(0, qty, nonce, 0);

        await time.increaseTo(ctx.revealEndTime + 1n);
        await ctx.attacker.finalizeAuction();

        const payload = ctx.auction.interface.encodeFunctionData("withdrawUnrevealed", [1]);
        await ctx.attacker.attackClaim(MODE.CROSS_FUNCTION, payload, 0);

        expect(await ctx.attacker.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await ctx.attacker.lastRevertData())).to.equal(REENTRANCY_ERROR);
    });
});
