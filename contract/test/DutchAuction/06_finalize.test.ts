import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
    commitBid,
    deployAuctionFixture,
    fixtureWithOverrides
} from "./utils/dutchAuctionFixtures";

type BidRequest = {
    signer: any;
    priceTickIndex: bigint;
    qty: bigint;
};

interface CommitmentInfo {
    nonce: string;
    qty: bigint; // qty in wei
}

async function commitBids(ctx: Awaited<ReturnType<typeof deployAuctionFixture>>, bids: BidRequest[]) {
    const commitments = new Map<string, CommitmentInfo>();
    await time.increaseTo(ctx.startTime + 1n);

    for (const bid of bids) {
        const result = await commitBid(ctx, {
            signer: bid.signer,
            priceTickIndex: bid.priceTickIndex,
            qty: bid.qty
        });
        const address = await bid.signer.getAddress();
        commitments.set(address, { nonce: result.nonce, qty: result.qty });
    }

    await time.increaseTo(ctx.commitEndTime + 1n);
    return commitments;
}

async function revealBids(
    ctx: Awaited<ReturnType<typeof deployAuctionFixture>>,
    bids: BidRequest[],
    commitments: Map<string, CommitmentInfo>
) {
    for (const bid of bids) {
        const address = await bid.signer.getAddress();
        const commitment = commitments.get(address);
        if (!commitment) throw new Error("missing commitment");
        // Use qty in wei from commitment (stored by commitBid)
        await ctx.auction.connect(bid.signer).reveal(bid.priceTickIndex, commitment.qty, commitment.nonce, 0);
    }
}

describe("DutchAuction – 06_finalize", function () {
    it("should revert if called by non-manager address", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const bids: BidRequest[] = [
            { signer: ctx.alice, priceTickIndex: 0n, qty: 80n },
            { signer: ctx.bob, priceTickIndex: 1n, qty: 60n }
        ];

        const commitments = await commitBids(ctx, bids);
        await revealBids(ctx, bids, commitments);
        await time.increaseTo(ctx.revealEndTime + 1n);

        await expect(ctx.auction.connect(ctx.alice).finalize()).to.be.revertedWithCustomError(ctx.auction, "NotManager");
    });

    it("should revert if called before revealEndTime", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const bids: BidRequest[] = [{ signer: ctx.alice, priceTickIndex: 0n, qty: 50n }];

        await commitBids(ctx, bids);

        await expect(ctx.auction.connect(ctx.deployer).finalize()).to.be.revertedWithCustomError(
            ctx.auction,
            "RevealPhaseClosed"
        );
    });

    it("should compute clearing price, mark success, and populate treasury", async function () {
        const overrides = {
            tokensForSale: ethers.parseUnits("200", 18),
            bonusReserve: ethers.parseUnits("100", 18)
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const bids: BidRequest[] = [
            { signer: ctx.alice, priceTickIndex: 0n, qty: 100n },
            { signer: ctx.bob, priceTickIndex: 1n, qty: 80n },
            { signer: ctx.carol, priceTickIndex: 1n, qty: 60n }
        ];

        const commitments = await commitBids(ctx, bids);
        await revealBids(ctx, bids, commitments);
        await time.increaseTo(ctx.revealEndTime + 1n);

        const clearingPrice = await ctx.auction.priceTicks(1);
        // tokensForSale is in wei, so totalRaised = (tokensSold * clearingPrice) / 1e18
        // tokensSold will be 200 (in wei), so expectedTotalRaised = (200 * 10^18 * clearingPrice) / 1e18 = 200 * clearingPrice
        const tokensSoldWei = ethers.parseUnits("200", 18);
        const expectedTotalRaised = (tokensSoldWei * clearingPrice) / 10n**18n;
        const expectedFilledAbove = ethers.parseUnits("100", 18);
        const expectedAtClearing = ethers.parseUnits("140", 18);
        const expectedRemaining = tokensSoldWei - expectedFilledAbove;

        await expect(ctx.auction.connect(ctx.deployer).finalize())
            .to.emit(ctx.auction, "AuctionFinalized")
            .withArgs(true, clearingPrice, tokensSoldWei, expectedTotalRaised);

        expect(await ctx.auction.finalized()).to.equal(true);
        expect(await ctx.auction.successful()).to.equal(true);
        expect(await ctx.auction.clearingTickIndex()).to.equal(1n);
        expect(await ctx.auction.clearingPrice()).to.equal(clearingPrice);
        expect(await ctx.auction.tokensSold()).to.equal(overrides.tokensForSale);
        expect(await ctx.auction.totalRaised()).to.equal(expectedTotalRaised);
        expect(await ctx.auction.ethForTreasury()).to.equal(expectedTotalRaised);
        expect(await ctx.auction.filledAboveClearing()).to.equal(expectedFilledAbove);
        expect(await ctx.auction.totalAtClearingTick()).to.equal(expectedAtClearing);
        expect(await ctx.auction.proRataNumerator()).to.equal(expectedRemaining);
        expect(await ctx.auction.proRataDenominator()).to.equal(expectedAtClearing);
    });

    it("should handle demand below supply by selling cumulative revealed quantity", async function () {
        const overrides = { tokensForSale: ethers.parseUnits("400", 18) };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const bids: BidRequest[] = [
            { signer: ctx.alice, priceTickIndex: 0n, qty: 120n },
            { signer: ctx.bob, priceTickIndex: 1n, qty: 80n },
            { signer: ctx.carol, priceTickIndex: 2n, qty: 60n }
        ];

        const commitments = await commitBids(ctx, bids);
        await revealBids(ctx, bids, commitments);
        await time.increaseTo(ctx.revealEndTime + 1n);

        await ctx.auction.connect(ctx.deployer).finalize();

        // bids are in whole numbers, convert to wei for calculation
        const totalQtyWei = bids.reduce((acc, bid) => {
            const qtyWei = bid.qty < 10n**18n ? bid.qty * 10n**18n : bid.qty;
            return acc + qtyWei;
        }, 0n);
        const lastTickIndex = (await ctx.auction.priceTicksLength()) - 1n;
        const lastPrice = await ctx.auction.priceTicks(lastTickIndex);
        // totalRaised = (tokensSold * clearingPrice) / 1e18
        const expectedRaised = (totalQtyWei * lastPrice) / 10n**18n;

        expect(await ctx.auction.successful()).to.equal(true);
        expect(await ctx.auction.clearingTickIndex()).to.equal(lastTickIndex);
        expect(await ctx.auction.tokensSold()).to.equal(totalQtyWei);
        expect(await ctx.auction.totalRaised()).to.equal(expectedRaised);
        expect(await ctx.auction.proRataNumerator()).to.equal(0n);
        expect(await ctx.auction.proRataDenominator()).to.equal(0n);
    });

    it("should mark unsuccessful when soft cap not met", async function () {
        const overrides = { softCap: ethers.parseEther("5") };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));

        await time.increaseTo(ctx.revealEndTime + 1n);

        await expect(ctx.auction.connect(ctx.deployer).finalize())
            .to.emit(ctx.auction, "AuctionFinalized")
            .withArgs(false, 0, 0, 0);

        expect(await ctx.auction.finalized()).to.equal(true);
        expect(await ctx.auction.successful()).to.equal(false);
        expect(await ctx.auction.clearingPrice()).to.equal(0n);
        expect(await ctx.auction.tokensSold()).to.equal(0n);
        expect(await ctx.auction.totalRaised()).to.equal(0n);
    });

    it("should revert if finalize is called twice", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const bids: BidRequest[] = [
            { signer: ctx.alice, priceTickIndex: 0n, qty: 80n },
            { signer: ctx.bob, priceTickIndex: 1n, qty: 60n }
        ];

        const commitments = await commitBids(ctx, bids);
        await revealBids(ctx, bids, commitments);
        await time.increaseTo(ctx.revealEndTime + 1n);

        await ctx.auction.connect(ctx.deployer).finalize();
        await expect(ctx.auction.connect(ctx.deployer).finalize()).to.be.revertedWithCustomError(
            ctx.auction,
            "AuctionFinalizedAlready"
        );
    });

    it("should revert if auction not initialized", async function () {
        const [deployer, manager] = await ethers.getSigners();
        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(ethers.parseEther("1"));
        await token.waitForDeployment();

        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        const auction = await auctionFactory.deploy(await token.getAddress(), manager.address);
        await auction.waitForDeployment();

        await expect(auction.connect(manager).finalize()).to.be.revertedWithCustomError(
            auction,
            "AuctionNotInitialized"
        );
    });
});
