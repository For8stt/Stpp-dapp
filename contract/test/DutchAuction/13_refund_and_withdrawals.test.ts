import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    BPS_DENOMINATOR,
    buildCommitHash,
    fixtureWithOverrides,
    randomNonce,
    type FixtureContext
} from "./utils/dutchAuctionFixtures";

const SUCCESS_OVERRIDES = {
    softCap: ethers.parseEther("0.02"),
    perAddressCap: ethers.parseUnits("200", 18),
    tokensForSale: ethers.parseUnits("120", 18)
};

const FAILURE_OVERRIDES = {
    softCap: ethers.parseEther("5"),
    perAddressCap: ethers.parseUnits("200", 18),
    tokensForSale: ethers.parseUnits("120", 18)
};

async function advanceToCommitStart(ctx: FixtureContext) {
    await time.increaseTo(ctx.startTime + 1n);
}

function extractRefundAmount(auction: Contract, receipt: any): bigint {
    const target = auction.target.toLowerCase();
    for (const log of receipt.logs ?? []) {
        if ((log.address ?? "").toLowerCase() !== target) continue;
        try {
            const parsed = auction.interface.parseLog(log);
            if (parsed.name === "RefundIssued") {
                return parsed.args[1] as bigint;
            }
        } catch {
            continue;
        }
    }
    return 0n;
}

async function commitBid(
    ctx: FixtureContext,
    signer: any,
    {
        priceTickIndex,
        qty,
        nonce
    }: {
        priceTickIndex: bigint;
        qty: bigint;
        nonce?: string;
    }
) {
    const bidder = await signer.getAddress();
    const nextIndex = Number(await ctx.auction.commitsCount(bidder));
    const usedNonce = nonce ?? randomNonce();
    // Convert qty to wei if it's a whole number
    const qtyWei = qty < 10n**18n ? qty * 10n**18n : qty;
    // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
    const deposit = (qtyWei * ctx.priceTicks[0]) / 10n**18n;

    await ctx.auction.connect(signer).commit(buildCommitHash(priceTickIndex, qtyWei, usedNonce), [], { value: deposit });

    return { nonce: usedNonce, deposit, commitIndex: nextIndex, qty: qtyWei };
}

async function revealBid(
    ctx: FixtureContext,
    signer: any,
    {
        priceTickIndex,
        qty,
        nonce,
        commitIndex
    }: {
        priceTickIndex: bigint;
        qty: bigint;
        nonce: string;
        commitIndex: number;
    }
) {
    await ctx.auction.connect(signer).reveal(Number(priceTickIndex), qty, nonce, commitIndex);
}

async function finalizeAuction(ctx: FixtureContext) {
    await time.increaseTo(ctx.revealEndTime + 1n);
    await ctx.auction.finalize();
}

describe("DutchAuction – 13_refund_and_withdrawals", function () {
    describe("🟦 refundUnsuccessful", function () {
        it("should allow users to claim refunds if auction failed", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice, priceTicks } = ctx;

            await advanceToCommitStart(ctx);
            const qty = 50n;
            const { nonce, deposit, qty: qtyWei } = await commitBid(ctx, alice, { priceTickIndex: 0n, qty });

            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 0n, qty: qtyWei, nonce, commitIndex: 0 });

            await finalizeAuction(ctx);
            expect(await auction.successful()).to.equal(false);

            const tx = await auction.connect(alice).refundUnsuccessful();
            const receipt = await tx.wait();
            const refundAmount = extractRefundAmount(auction, receipt);

            expect(refundAmount).to.equal(deposit);
        });

        it("should refund both revealed and unrevealed deposits", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);

            const revealed = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 30n });
            const unrevealed = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 20n });

            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 0n, qty: revealed.qty, nonce: revealed.nonce, commitIndex: revealed.commitIndex });

            await finalizeAuction(ctx);

            const tx = await auction.connect(alice).refundUnsuccessful();
            const receipt = await tx.wait();
            const refundAmount = extractRefundAmount(auction, receipt);

            expect(refundAmount).to.equal(revealed.deposit + unrevealed.deposit);
        });

        it("should mark unrevealed commits as withdrawn", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const revealed = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 30n });
            const unrevealed = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 15n });

            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, {
                priceTickIndex: 0n,
                qty: revealed.qty,
                nonce: revealed.nonce,
                commitIndex: revealed.commitIndex
            });

            await finalizeAuction(ctx);
            await expect(auction.connect(alice).refundUnsuccessful()).to.not.be.reverted;

            const commitEntry = await auction.commits(await alice.getAddress(), unrevealed.commitIndex);
            expect(commitEntry.withdrawn).to.equal(true);
        });

        it("should revert if auction not finalized", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const { nonce, qty: qtyWei } = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 10n });
            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 0n, qty: qtyWei, nonce, commitIndex: 0 });

            await expect(auction.connect(alice).refundUnsuccessful()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
        });

        it("should revert if auction was successful", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(SUCCESS_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const qty = 80n;
            const { nonce, qty: qtyWei } = await commitBid(ctx, alice, { priceTickIndex: 2n, qty });
            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 2n, qty: qtyWei, nonce, commitIndex: 0 });

            await finalizeAuction(ctx);
            expect(await auction.successful()).to.equal(true);

            await expect(auction.connect(alice).refundUnsuccessful()).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
        });

        it("should revert if user has no refunds to claim", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const { nonce, qty: qtyWei } = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 25n });
            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 0n, qty: qtyWei, nonce, commitIndex: 0 });

            await finalizeAuction(ctx);
            await auction.connect(alice).refundUnsuccessful();

            await expect(auction.connect(alice).refundUnsuccessful()).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });
    });

    describe("🟩 withdrawUnrevealed", function () {
        it("should allow user to withdraw a single unrevealed commit after finalize", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const qty = 35n;
            const { commitIndex, deposit } = await commitBid(ctx, alice, { priceTickIndex: 0n, qty });

            await finalizeAuction(ctx);

            const tx = await auction.connect(alice).withdrawUnrevealed(commitIndex);
            const receipt = await tx.wait();
            const refundAmount = extractRefundAmount(auction, receipt);

            expect(refundAmount).to.equal(deposit);
            expect(await auction.penaltyCollected()).to.equal(0n);
            expect(await auction.ethForTreasury()).to.equal(0n);

            // Ensure state reflects withdrawal
            const storedCommit = await auction.commits(await alice.getAddress(), commitIndex);
            expect(storedCommit.withdrawn).to.equal(true);
            expect(storedCommit.revealed).to.equal(false);
            expect(storedCommit.deposit).to.equal(deposit);
        });

        it("should apply penalty if auction successful (nonRevealPenaltyBps)", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(SUCCESS_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const winning = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 60n });
            const hidden = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 20n });

            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, {
                priceTickIndex: 0n,
                qty: winning.qty,
                nonce: winning.nonce,
                commitIndex: winning.commitIndex
            });

            await finalizeAuction(ctx);
            expect(await auction.successful()).to.equal(true);

            const tx = await auction.connect(alice).withdrawUnrevealed(hidden.commitIndex);
            const receipt = await tx.wait();
            const refundAmount = extractRefundAmount(auction, receipt);

            const penalty = (hidden.deposit * ctx.config.nonRevealPenaltyBps) / BPS_DENOMINATOR;
            const expectedRefund = hidden.deposit - penalty;

            expect(refundAmount).to.equal(expectedRefund);
        });

        it("should add penalty to ethForTreasury and penaltyCollected", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(SUCCESS_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const winning = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 50n });
            const hidden = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 10n });

            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, {
                priceTickIndex: 0n,
                qty: winning.qty,
                nonce: winning.nonce,
                commitIndex: winning.commitIndex
            });

            await finalizeAuction(ctx);

            const treasuryBefore = await auction.ethForTreasury();
            const penaltiesBefore = await auction.penaltyCollected();

            await auction.connect(alice).withdrawUnrevealed(hidden.commitIndex);

            const penalty = (hidden.deposit * ctx.config.nonRevealPenaltyBps) / BPS_DENOMINATOR;

            expect(await auction.ethForTreasury()).to.equal(treasuryBefore + penalty);
            expect(await auction.penaltyCollected()).to.equal(penaltiesBefore + penalty);
        });

        it("should revert if commit was already revealed", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(SUCCESS_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const revealed = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 45n });
            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, {
                priceTickIndex: 0n,
                qty: revealed.qty,
                nonce: revealed.nonce,
                commitIndex: revealed.commitIndex
            });

            await finalizeAuction(ctx);

            await expect(auction.connect(alice).withdrawUnrevealed(revealed.commitIndex)).to.be.revertedWithCustomError(
                auction,
                "NothingToClaim"
            );
        });

        it("should revert if commit already withdrawn", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const hidden = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 25n });

            await finalizeAuction(ctx);
            await auction.connect(alice).withdrawUnrevealed(hidden.commitIndex);

            await expect(auction.connect(alice).withdrawUnrevealed(hidden.commitIndex)).to.be.revertedWithCustomError(
                auction,
                "NothingToClaim"
            );
        });

        it("should revert if auction not finalized", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const { auction, alice } = ctx;

            await advanceToCommitStart(ctx);
            const hidden = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 28n });

            await expect(auction.connect(alice).withdrawUnrevealed(hidden.commitIndex)).to.be.revertedWithCustomError(
                auction,
                "AuctionNotFinalized"
            );
        });
    });

    describe("🟥 withdrawTreasury", function () {
        async function setupSuccessfulTreasuryScenario() {
            const ctx = await loadFixture(fixtureWithOverrides(SUCCESS_OVERRIDES));
            const { auction, alice, deployer } = ctx;

            await advanceToCommitStart(ctx);
            const qty = 80n;
            const { nonce, qty: qtyWei } = await commitBid(ctx, alice, { priceTickIndex: 2n, qty });
            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 2n, qty: qtyWei, nonce, commitIndex: 0 });

            await finalizeAuction(ctx);
            await auction.connect(deployer).transferOwnership(await deployer.getAddress());

            return ctx;
        }

        it("should allow only owner to withdrawTreasury after successful auction", async function () {
            const ctx = await setupSuccessfulTreasuryScenario();
            const { auction, alice, deployer, treasury } = ctx;

            await expect(auction.connect(alice).withdrawTreasury(await treasury.getAddress())).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );

            await expect(auction.connect(deployer).withdrawTreasury(await treasury.getAddress())).to.not.be.reverted;
        });

        it("should transfer ethForTreasury to specified recipient", async function () {
            const ctx = await setupSuccessfulTreasuryScenario();
            const { auction, deployer, treasury } = ctx;

            const recipient = await treasury.getAddress();
            const amount = await auction.ethForTreasury();
            const balanceBefore = await ethers.provider.getBalance(recipient);

            await auction.connect(deployer).withdrawTreasury(recipient);
            const balanceAfter = await ethers.provider.getBalance(recipient);

            expect(balanceAfter - balanceBefore).to.equal(amount);
        });

        it("should set ethForTreasury to zero after withdrawal", async function () {
            const ctx = await setupSuccessfulTreasuryScenario();
            const { auction, deployer, treasury } = ctx;

            await auction.connect(deployer).withdrawTreasury(await treasury.getAddress());
            expect(await auction.ethForTreasury()).to.equal(0n);
        });

        it("should revert if recipient is zero address", async function () {
            const ctx = await setupSuccessfulTreasuryScenario();
            const { auction, deployer } = ctx;

            await expect(auction.connect(deployer).withdrawTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                auction,
                "InvalidCommit"
            );
        });

        it("should revert if auction not finalized or not successful", async function () {
            const ctx = await loadFixture(fixtureWithOverrides(SUCCESS_OVERRIDES));
            const { auction, deployer, treasury, alice } = ctx;

            await expect(
                auction.connect(deployer).withdrawTreasury(await treasury.getAddress())
            ).to.be.revertedWithCustomError(
                auction,
                "AuctionNotFinalized"
            );

            await advanceToCommitStart(ctx);
            const { nonce, qty: qtyWei } = await commitBid(ctx, alice, { priceTickIndex: 0n, qty: 40n });
            await time.increaseTo(ctx.commitEndTime + 1n);
            await revealBid(ctx, alice, { priceTickIndex: 0n, qty: qtyWei, nonce, commitIndex: 0 });

            await finalizeAuction(ctx);

            await auction.connect(deployer).withdrawTreasury(await treasury.getAddress());

            const failureCtx = await loadFixture(fixtureWithOverrides(FAILURE_OVERRIDES));
            const {
                auction: failedAuction,
                deployer: failedDeployer,
                treasury: failedTreasury,
                alice: failedAlice
            } = failureCtx;

            await advanceToCommitStart(failureCtx);
            const failCommit = await commitBid(failureCtx, failedAlice, { priceTickIndex: 0n, qty: 10n });
            await time.increaseTo(failureCtx.commitEndTime + 1n);
            await revealBid(failureCtx, failedAlice, { priceTickIndex: 0n, qty: failCommit.qty, nonce: failCommit.nonce, commitIndex: 0 });
            await finalizeAuction(failureCtx);

            await expect(
                failedAuction.connect(failedDeployer).withdrawTreasury(await failedTreasury.getAddress())
            ).to.be.revertedWithCustomError(failedAuction, "AuctionNotFinalized");
        });
    });
});
