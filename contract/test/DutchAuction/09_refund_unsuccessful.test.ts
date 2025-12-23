import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { buildCommitHash, fixtureWithOverrides, randomNonce } from "./utils/dutchAuctionFixtures";

type AuctionFixture = Awaited<ReturnType<ReturnType<typeof fixtureWithOverrides>>>;

interface CommitInfo {
    nonce: string;
    qty: bigint;
    deposit: bigint;
    commitIndex: number;
}

async function commitForAccount(
    ctx: AuctionFixture,
    signer: any,
    qty: bigint,
    priceTickIndex: bigint
): Promise<CommitInfo> {
    const { auction, priceTicks } = ctx;
    const address = await signer.getAddress();
    const commitIndex = Number(await auction.commitsCount(address));
    const nonce = randomNonce();
    // Convert qty to wei if it's a whole number
    const qtyWei = qty < 10n**18n ? qty * 10n**18n : qty;
    // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;

    await auction
        .connect(signer)
        .commit(buildCommitHash(priceTickIndex, qtyWei, nonce), [], { value: deposit });

    return { nonce, qty: qtyWei, deposit, commitIndex };
}

async function failedAuctionFixture() {
    const ctx = await fixtureWithOverrides({
        softCap: ethers.parseEther("5"),
        tokensForSale: ethers.parseUnits("150", 18),
        perAddressCap: ethers.parseUnits("300", 18),
        bonusReserve: 0n
    })();

    const { auction, alice, startTime, commitEndTime, revealEndTime } = ctx;

    await time.increaseTo(startTime + 1n);
    const revealed = await commitForAccount(ctx, alice, 60n, 0n);
    const unrevealed = await commitForAccount(ctx, alice, 40n, 1n);

    await time.increaseTo(commitEndTime + 1n);
    await auction.connect(alice).reveal(0, revealed.qty, revealed.nonce, revealed.commitIndex);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();
    expect(await auction.successful()).to.equal(false);

    return { ...ctx, revealed, unrevealed };
}

async function preFinalizationFixture() {
    const ctx = await fixtureWithOverrides({
        softCap: ethers.parseEther("5"),
        tokensForSale: ethers.parseUnits("120", 18),
        perAddressCap: ethers.parseUnits("200", 18)
    })();

    const { auction, alice, startTime, commitEndTime } = ctx;

    await time.increaseTo(startTime + 1n);
    await commitForAccount(ctx, alice, 50n, 0n);

    await time.increaseTo(commitEndTime + 1n);
    return ctx;
}

async function successfulAuctionFixture() {
    const ctx = await fixtureWithOverrides({
        tokensForSale: ethers.parseUnits("100", 18),
        perAddressCap: ethers.parseUnits("100", 18),
        bonusReserve: 0n,
        softCap: 0n
    })();

    const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

    await time.increaseTo(startTime + 1n);
    const nonce = randomNonce();
    // config.tokensForSale is now in wei
    const qtyWei = ctx.config.tokensForSale;
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
    await auction
        .connect(alice)
        .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

    await time.increaseTo(commitEndTime + 1n);
    await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();
    expect(await auction.successful()).to.equal(true);

    return ctx;
}

async function rejectingBidderFixture() {
    const ctx = await fixtureWithOverrides({
        softCap: ethers.parseEther("5"),
        tokensForSale: ethers.parseUnits("80", 18),
        perAddressCap: ethers.parseUnits("80", 18),
        bonusReserve: 0n
    })();

    const { auction, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;
    const rejectorFactory = await ethers.getContractFactory("RefundRejector");
    const rejector = await rejectorFactory.deploy(await auction.getAddress());
    await rejector.waitForDeployment();

    const qtyWhole = 30n;
    const qtyWei = qtyWhole * 10n**18n;
    const nonce = randomNonce();
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;

    await time.increaseTo(startTime + 1n);
    await rejector.commitBid(buildCommitHash(0n, qtyWei, nonce), { value: deposit });
    await time.increaseTo(commitEndTime + 1n);
    await rejector.revealBid(0, qtyWei, nonce, 0);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();
    expect(await auction.successful()).to.equal(false);

    return { ...ctx, rejector };
}

describe("DutchAuction – 09_refund_unsuccessful", function () {
    describe("success paths", function () {
        it("should allow user to withdraw all deposits if auction failed", async function () {
            const ctx = await loadFixture(failedAuctionFixture);
            const { auction, alice, revealed, unrevealed } = ctx;
            const auctionAddress = await auction.getAddress();
            const aliceAddress = await alice.getAddress();
            const expectedRefund = revealed.deposit + unrevealed.deposit;

            await expect(() => auction.connect(alice).refundUnsuccessful()).to.changeEtherBalances(
                [auctionAddress, aliceAddress],
                [-expectedRefund, expectedRefund]
            );
        });

        it("should refund revealed deposits + unrevealed deposits and emit RefundIssued event", async function () {
            const ctx = await loadFixture(failedAuctionFixture);
            const { auction, alice, revealed, unrevealed } = ctx;
            const expectedRefund = revealed.deposit + unrevealed.deposit;

            await expect(auction.connect(alice).refundUnsuccessful())
                .to.emit(auction, "RefundIssued")
                .withArgs(await alice.getAddress(), expectedRefund);
        });

        it("should mark unrevealed commits as withdrawn", async function () {
            const ctx = await loadFixture(failedAuctionFixture);
            const { auction, alice, unrevealed } = ctx;
            const aliceAddress = await alice.getAddress();

            await auction.connect(alice).refundUnsuccessful();
            const commit = await auction.commits(aliceAddress, unrevealed.commitIndex);
            expect(commit.withdrawn).to.equal(true);
            expect(commit.revealed).to.equal(false);
        });

        it("should clear revealedDeposit to zero after refund", async function () {
            const ctx = await loadFixture(failedAuctionFixture);
            const { auction, alice } = ctx;
            const aliceAddress = await alice.getAddress();

            await auction.connect(alice).refundUnsuccessful();
            expect(await auction.revealedDeposit(aliceAddress)).to.equal(0n);
        });
    });

    describe("reverts", function () {
        it("should revert if auction not finalized", async function () {
            const ctx = await loadFixture(preFinalizationFixture);
            const { auction, alice } = ctx;

            await expect(auction.connect(alice).refundUnsuccessful()).to.be.revertedWithCustomError(
                auction,
                "AuctionNotFinalized"
            );
        });

        it("should revert if auction was successful", async function () {
            const ctx = await loadFixture(successfulAuctionFixture);
            const { auction, alice } = ctx;

            await expect(auction.connect(alice).refundUnsuccessful()).to.be.revertedWithCustomError(
                auction,
                "AuctionNotFinalized"
            );
        });

        it("should revert if user has nothing to refund", async function () {
            const ctx = await loadFixture(failedAuctionFixture);
            const { auction, bob } = ctx;

            await expect(auction.connect(bob).refundUnsuccessful()).to.be.revertedWithCustomError(
                auction,
                "NothingToClaim"
            );
        });

        it("should revert if ETH transfer to user fails", async function () {
            const ctx = await loadFixture(rejectingBidderFixture);
            const { auction, rejector } = ctx;

            await expect(rejector.triggerRefund()).to.be.revertedWithCustomError(auction, "TransferFailed");
        });
    });
});
