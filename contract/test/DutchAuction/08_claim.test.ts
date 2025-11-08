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

interface BidParams {
    signer?: Signer;
    qty?: bigint;
    priceTickIndex?: bigint;
}

async function commitBid(
    ctx: AuctionFixture,
    {
        signer,
        qty,
        priceTickIndex
    }: { signer: Signer; qty: bigint; priceTickIndex: bigint }
) {
    const { auction, priceTicks } = ctx;
    const bidder = signer;
    const address = await bidder.getAddress();
    const commitIndex = await auction.commitsCount(address);
    const nonce = randomNonce();
    const deposit = qty * priceTicks[0];

    await auction
        .connect(bidder)
        .commit(buildCommitHash(priceTickIndex, qty, nonce), [], { value: deposit });

    return { nonce, deposit, commitIndex: Number(commitIndex) };
}

async function finalizeSuccessfulAuction(ctx: AuctionFixture, params: BidParams = {}) {
    const signer = params.signer ?? ctx.alice;
    const qty = params.qty ?? ctx.config.tokensForSale;
    const priceTickIndex = params.priceTickIndex ?? 0n;

    const { auction, startTime, commitEndTime, revealEndTime } = ctx;

    await time.increaseTo(startTime + 1n);
    const { nonce, deposit, commitIndex } = await commitBid(ctx, {
        signer,
        qty,
        priceTickIndex
    });

    await time.increaseTo(commitEndTime + 1n);
    await auction.connect(signer).reveal(priceTickIndex, qty, nonce, commitIndex);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();

    return { signer, qty, priceTickIndex, nonce, deposit };
}

describe("DutchAuction – 08_claim", function () {
    describe("success paths", function () {
        it("should compute allocation on first claim if not computed", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n
                })
            );
            const { auction, alice } = ctx;

            await finalizeSuccessfulAuction(ctx);

            const aliceAddress = await alice.getAddress();
            const before = await auction.accountAllocations(aliceAddress);
            expect(before.computed).to.equal(false);

            await auction.connect(alice).claim();

            const after = await auction.accountAllocations(aliceAddress);
            expect(after.computed).to.equal(true);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(after.totalQty + after.bonusQty);
        });

        it("should allow user to claim vested tokens based on vesting schedule", async function () {
            const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingStart: now + 600n,
                    vestingDuration: 3_600n,
                    bonusReserve: 0n
                })
            );
            const { auction, token, alice, config } = ctx;

            const { qty } = await finalizeSuccessfulAuction(ctx);

            await time.increaseTo(config.vestingStart + config.vestingDuration + 1n);
            await auction.connect(alice).claim();

            expect(await token.balanceOf(await alice.getAddress())).to.equal(qty);
        });

        it("should allow user to receive ETH refund for overpayment", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n,
                    tokensForSale: 60n,
                    perAddressCap: 60n,
                    softCap: 0n
                })
            );
            const { auction, alice, priceTicks } = ctx;

            const qty = 60n;
            await finalizeSuccessfulAuction(ctx, { qty, priceTickIndex: 2n });

            const clearingPrice = await auction.clearingPrice();
            const deposit = qty * priceTicks[0];
            const expectedRefund = deposit - qty * clearingPrice;

            const aliceAddress = await alice.getAddress();
            const balanceBefore = await ethers.provider.getBalance(aliceAddress);
            const tx = await auction.connect(alice).claim();
            const receipt = await tx.wait();
            const gasPaid = receipt ? receipt.gasUsed * (tx.gasPrice ?? 0n) : 0n;
            const balanceAfter = await ethers.provider.getBalance(aliceAddress);

            expect(balanceAfter + gasPaid - balanceBefore).to.equal(expectedRefund);
        });

        it("should emit BonusAllocated if bonus tokens are included in claim", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    bonusReserve: 50n,
                    earlyBonusPct: 1_000n,
                    tokensForSale: 20n,
                    perAddressCap: 20n,
                    vestingDuration: 0n,
                    softCap: 0n
                })
            );
            const { auction, alice } = ctx;

            const { qty } = await finalizeSuccessfulAuction(ctx, { qty: ctx.config.tokensForSale });
            const expectedBonus = (qty * ctx.config.earlyBonusPct) / BPS_DENOMINATOR;

            await expect(auction.connect(alice).claim())
                .to.emit(auction, "BonusAllocated")
                .withArgs(await alice.getAddress(), expectedBonus);
        });

        it("should update tokensClaimed and refundedAmount correctly", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n,
                    tokensForSale: 90n,
                    perAddressCap: 90n,
                    softCap: 0n
                })
            );
            const { auction, alice } = ctx;

            const { qty, deposit } = await finalizeSuccessfulAuction(ctx, { qty: 90n, priceTickIndex: 2n });
            await auction.connect(alice).claim();

            const aliceAddress = await alice.getAddress();
            const allocation = await auction.accountAllocations(aliceAddress);
            const expectedTokensClaimed = allocation.totalQty + allocation.bonusQty;
            const expectedRefund = deposit - allocation.paymentDue;

            expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTokensClaimed);
            expect(await auction.refundedAmount(aliceAddress)).to.equal(expectedRefund);
            expect(expectedTokensClaimed).to.equal(qty + allocation.bonusQty);
        });

        it("should allow multiple partial claims over time (vesting increases)", async function () {
            const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingStart: now + 5_000n,
                    vestingDuration: 1_200n,
                    tokensForSale: 80n,
                    perAddressCap: 80n,
                    softCap: 0n
                })
            );
            const { auction, alice, config } = ctx;

            const { qty, deposit } = await finalizeSuccessfulAuction(ctx, { qty: 80n, priceTickIndex: 2n });
            const aliceAddress = await alice.getAddress();

            // Initial claim before vesting completion should only send refund.
            const refundOnlyTs = config.vestingStart + config.vestingDuration - 10n;
            const currentTs = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
            if (refundOnlyTs > currentTs) {
                await time.increaseTo(refundOnlyTs);
            }

            const clearingPrice = await auction.clearingPrice();
            const expectedRefund = deposit - qty * clearingPrice;

            const balanceBefore = await ethers.provider.getBalance(aliceAddress);
            const tx1 = await auction.connect(alice).claim();
            const receipt1 = await tx1.wait();
            const gasPaid1 = receipt1 ? receipt1.gasUsed * (tx1.gasPrice ?? 0n) : 0n;
            const balanceAfter = await ethers.provider.getBalance(aliceAddress);
            expect(balanceAfter + gasPaid1 - balanceBefore).to.equal(expectedRefund);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(0n);

            // Move past vesting end and claim vested tokens.
            await time.increaseTo(config.vestingStart + config.vestingDuration + 1n);
            await auction.connect(alice).claim();

            const allocationAfter = await auction.accountAllocations(aliceAddress);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(allocationAfter.totalQty + allocationAfter.bonusQty);
            expect(await auction.refundedAmount(aliceAddress)).to.equal(expectedRefund);
            expect(await auction.revealedDeposit(aliceAddress)).to.equal(deposit);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(qty + allocationAfter.bonusQty);
        });
    });

    describe("reverts", function () {
        it("should revert if auction is not finalized", async function () {
            const ctx = await loadFixture(fixtureWithOverrides({}));
            const { auction, alice, startTime, commitEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qty = 40n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(alice).reveal(0, qty, nonce, 0);

            await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
        });

        it("should revert if auction failed (unsuccessful)", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    softCap: ethers.parseEther("100"),
                    tokensForSale: 50n,
                    perAddressCap: 50n
                })
            );
            const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qty = 50n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(alice).reveal(0, qty, nonce, 0);

            await time.increaseTo(revealEndTime + 1n);
            await auction.connect(ctx.deployer).finalize();
            expect(await auction.successful()).to.equal(false);

            await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
        });

        it("should revert if user has no revealed bids", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    softCap: 0n,
                    vestingDuration: 0n
                })
            );
            const { auction, alice, bob, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qty = 30n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qty, nonce), [], { value: qty * priceTicks[0] });

            const bobNonce = randomNonce();
            const bobQty = 40n;
            await auction
                .connect(bob)
                .commit(buildCommitHash(0n, bobQty, bobNonce), [], { value: bobQty * priceTicks[0] });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(bob).reveal(0, bobQty, bobNonce, 0);

            await time.increaseTo(revealEndTime + 1n);
            await auction.connect(ctx.deployer).finalize();
            expect(await auction.successful()).to.equal(true);

            await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });

        it("should revert if user has already claimed everything", async function () {
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

        it("should revert if nothing is vested yet (before vestingStart)", async function () {
            const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingStart: now + 10_000n,
                    vestingDuration: 3_600n,
                    tokensForSale: 40n,
                    perAddressCap: 40n,
                    softCap: 0n
                })
            );
            const { auction, alice } = ctx;

            await finalizeSuccessfulAuction(ctx, { qty: 40n, priceTickIndex: 0n });
            await expect(auction.connect(alice).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });

        it("should revert if reward tokens are zero and no refund is due (NothingToClaim)", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n
                })
            );
            const { auction, outsider } = ctx;

            await finalizeSuccessfulAuction(ctx);
            await expect(auction.connect(outsider).claim()).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });
    });
});
