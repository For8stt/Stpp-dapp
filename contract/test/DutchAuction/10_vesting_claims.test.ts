import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    BPS_DENOMINATOR,
    buildCommitHash,
    fixtureWithOverrides,
    randomNonce
} from "./utils/dutchAuctionFixtures";

type AuctionFixture = Awaited<ReturnType<ReturnType<typeof fixtureWithOverrides>>>;

async function commitBid(
    ctx: AuctionFixture,
    {
        signer,
        qty,
        priceTickIndex = 0n
    }: { signer: Signer; qty: bigint; priceTickIndex?: bigint }
) {
    const { auction, priceTicks } = ctx;
    const nonce = randomNonce();
    const commitHash = buildCommitHash(priceTickIndex, qty, nonce);
    const deposit = qty * priceTicks[0];
    await auction.connect(signer).commit(commitHash, [], { value: deposit });
    return { nonce, deposit, priceTickIndex };
}

async function finalizeSuccessfulAuction(
    ctx: AuctionFixture,
    params: { signer?: Signer; qty?: bigint; priceTickIndex?: bigint } = {}
) {
    const { auction, startTime, commitEndTime, revealEndTime, config } = ctx;
    const signer = params.signer ?? ctx.alice;
    const qty = params.qty ?? config.tokensForSale;
    const priceTickIndex = params.priceTickIndex ?? 0n;

    await time.increaseTo(startTime + 1n);
    const commitData = await commitBid(ctx, { signer, qty, priceTickIndex });

    await time.increaseTo(commitEndTime + 1n);
    await auction
        .connect(signer)
        .reveal(Number(priceTickIndex), qty, commitData.nonce, 0);

    await time.increaseTo(revealEndTime + 1n);
    await auction.finalize();

    return { qty, ...commitData };
}

describe("DutchAuction – 10_vesting_claims", function () {
    it("should return 0 vested tokens before finalize", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 10_000n
            })
        );

        const { auction, token, alice, startTime, commitEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = randomNonce();
        const qty = 25n;
        await auction.connect(alice).commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qty, nonce, 0);

        expect(await token.balanceOf(await alice.getAddress())).to.equal(0n);
        expect(await auction.tokensClaimed(await alice.getAddress())).to.equal(0n);
    });

    it("should revert claim if auction is not finalized", async function () {
        const ctx = await loadFixture(fixtureWithOverrides({}));
        const { auction, alice, startTime, commitEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = randomNonce();
        const qty = 40n;
        await auction.connect(alice).commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qty, nonce, 0);

        await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
    });

    it("should revert claim if auction was unsuccessful", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                softCap: ethers.parseEther("100"),
                tokensForSale: 50n,
                perAddressCap: 100n
            })
        );
        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = randomNonce();
        const qty = 50n;
        await auction.connect(alice).commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qty, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();
        expect(await auction.successful()).to.equal(false);

        await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
    });

    it("should compute allocation on first claim call", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, alice } = ctx;

        await finalizeSuccessfulAuction(ctx);

        const before = await auction.accountAllocations(await alice.getAddress());
        expect(before.computed).to.equal(false);

        await auction.connect(alice).claim();

        const after = await auction.accountAllocations(await alice.getAddress());
        expect(after.computed).to.equal(true);
        expect(await auction.tokensClaimed(await alice.getAddress())).to.equal(after.totalQty + after.bonusQty);
    });

    it("should allow user to claim vested tokens correctly", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, token, alice } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx);
        const aliceAddress = await alice.getAddress();
        await auction.connect(alice).claim();

        const allocation = await auction.accountAllocations(aliceAddress);
        const expectedTotal = allocation.totalQty + allocation.bonusQty;

        expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTotal);
        expect(await token.balanceOf(aliceAddress)).to.equal(expectedTotal);
        expect(expectedTotal).to.be.gte(qty);
    });

    it("should not allow user to claim more than allocated tokens", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, alice } = ctx;

        await finalizeSuccessfulAuction(ctx);
        await auction.connect(alice).claim();
        await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
    });

    it("should unlock 0 tokens if vesting has not started (vestingStart > block.timestamp)", async function () {
        const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingStart: now + 50_000n,
                vestingDuration: 3_600n
            })
        );
        const { auction, alice } = ctx;

        await finalizeSuccessfulAuction(ctx);

        await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
        expect(await auction.tokensClaimed(await alice.getAddress())).to.equal(0n);
    });

    it("should unlock full tokens if vestingDuration is 0", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, token, alice } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx);
        const aliceAddress = await alice.getAddress();
        await auction.connect(alice).claim();

        const allocation = await auction.accountAllocations(aliceAddress);
        const expectedTotal = allocation.totalQty + allocation.bonusQty;

        expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTotal);
        expect(await token.balanceOf(aliceAddress)).to.equal(expectedTotal);
        expect(expectedTotal).to.be.gte(qty);
    });

    it("should unlock full tokens after vestingDuration has passed", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 4_800n
            })
        );
        const { auction, token, alice, config } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx);
        const aliceAddress = await alice.getAddress();
        await time.increaseTo(config.vestingStart + config.vestingDuration + 1n);
        await auction.connect(alice).claim();

        const allocation = await auction.accountAllocations(aliceAddress);
        const expectedTotal = allocation.totalQty + allocation.bonusQty;

        expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTotal);
        expect(await token.balanceOf(aliceAddress)).to.equal(expectedTotal);
        expect(expectedTotal).to.be.gte(qty);
    });

    it("should emit BonusAllocated when bonus tokens are included in claim", async function () {
        const bonusPct = 1_000n;
        const saleAmount = 20n;
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n,
                bonusReserve: 50n,
                earlyBonusPct: bonusPct,
                tokensForSale: saleAmount,
                perAddressCap: saleAmount,
                softCap: ethers.parseEther("0.005")
            })
        );
        const { auction, alice } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx, { qty: saleAmount });
        const expectedBonus = (qty * bonusPct) / BPS_DENOMINATOR;

        await expect(auction.connect(alice).claim())
            .to.emit(auction, "BonusAllocated")
            .withArgs(await alice.getAddress(), expectedBonus);
    });

    it("should send correct ETH refund if user over-deposited", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n,
                tokensForSale: 60n,
                perAddressCap: 60n,
                softCap: ethers.parseEther("0.05")
            })
        );
        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const qty = 60n;
        const nonce = randomNonce();
        const deposit = qty * priceTicks[0];

        await auction.connect(alice).commit(buildCommitHash(2n, qty, nonce), [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(2, qty, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        const clearingPrice = priceTicks[2];
        const expectedPayment = qty * clearingPrice;
        const expectedRefund = deposit - expectedPayment;

        const balanceBefore = await ethers.provider.getBalance(await alice.getAddress());
        const tx = await auction.connect(alice).claim();
        const receipt = await tx.wait();
        const gasPaid = receipt ? receipt.gasUsed * (tx.gasPrice ?? 0n) : 0n;
        const balanceAfter = await ethers.provider.getBalance(await alice.getAddress());

        expect(balanceAfter + gasPaid - balanceBefore).to.equal(expectedRefund);
    });

    it("should revert claim if nothing to claim (no tokens and no refund left)", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, alice, outsider, startTime, commitEndTime, revealEndTime, priceTicks, config } = ctx;

        await time.increaseTo(startTime + 1n);
        const qty = config.tokensForSale;
        const nonce = randomNonce();
        await auction.connect(alice).commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qty, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        await expect(auction.connect(outsider).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
    });
});
