import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    BPS_DENOMINATOR,
    buildCommitHash,
    commitBid,
    deployAuctionFixture,
    fixtureWithOverrides,
    randomNonce
} from "./utils/dutchAuctionFixtures";

const provider = ethers.provider;

const toBytes32 = (value: bigint) => ethers.zeroPadValue(ethers.toBeHex(value), 32);

// Helper to convert whole number to wei
function toWei(qty: bigint): bigint {
    return qty * 10n**18n;
}

let priceTicksSlotCache: bigint | null = null;
let perAddressCapSlotCache: bigint | null = null;

async function locatePriceTicksSlot(auction: any): Promise<bigint> {
    if (priceTicksSlotCache !== null) return priceTicksSlotCache;

    const length = BigInt(await auction.priceTicksLength());
    const address = await auction.getAddress();

    for (let slot = 0n; slot < 256n; slot++) {
        const slotHex = toBytes32(slot);
        const storedLength = await provider.getStorage(address, slotHex);
        if (BigInt(storedLength) !== length) continue;

        const base = BigInt(ethers.keccak256(slotHex));
        const elementSlotHex = toBytes32(base);
        const elementValueHex = await provider.getStorage(address, elementSlotHex);
        const elementValue = BigInt(elementValueHex);
        const onChainValue = BigInt(await auction.priceTicks(0));

        if (elementValue === onChainValue) {
            priceTicksSlotCache = slot;
            return slot;
        }
    }
    throw new Error("priceTicks slot not found");
}

async function setPriceTick(auction: any, index: number, newValue: bigint) {
    const slot = await locatePriceTicksSlot(auction);
    const base = BigInt(ethers.keccak256(toBytes32(slot)));
    const elementSlot = base + BigInt(index);
    await provider.send("hardhat_setStorageAt", [
        await auction.getAddress(),
        toBytes32(elementSlot),
        toBytes32(newValue)
    ]);
}

async function locatePerAddressCapSlot(auction: any): Promise<bigint> {
    if (perAddressCapSlotCache !== null) return perAddressCapSlotCache;

    const expected = BigInt(await auction.perAddressCap());
    const address = await auction.getAddress();

    for (let slot = 0n; slot < 256n; slot++) {
        const slotHex = toBytes32(slot);
        const stored = await provider.getStorage(address, slotHex);
        if (BigInt(stored) === expected) {
            perAddressCapSlotCache = slot;
            return slot;
        }
    }
    throw new Error("perAddressCap slot not found");
}

async function setPerAddressCap(auction: any, newValue: bigint) {
    const slot = await locatePerAddressCapSlot(auction);
    await provider.send("hardhat_setStorageAt", [
        await auction.getAddress(),
        toBytes32(slot),
        toBytes32(newValue)
    ]);
}

describe("DutchAuction – 04_reveal", function () {
    it("should allow valid reveal during reveal window", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, priceTicks, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 80n });

        await time.increaseTo(commitEndTime + 1n);

        // bid.qty is now in wei, use it directly
        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0))
            .to.emit(auction, "BidRevealed")
            .withArgs(await alice.getAddress(), 0, 0, bid.qty, ctx.config.earlyBonusPct);

        const commitRecord = await auction.commits(await alice.getAddress(), 0);
        expect(commitRecord.revealed).to.equal(true);
        expect(commitRecord.withdrawn).to.equal(false);

        expect(await auction.revealedQty(await alice.getAddress())).to.equal(bid.qty);
        expect(await auction.revealedDeposit(await alice.getAddress())).to.equal(bid.deposit);
        expect(await auction.totalDepositsRevealed()).to.equal(bid.deposit);
        expect(await auction.totalQtyRevealed()).to.equal(bid.qty);
        expect(await auction.priceBucketTotals(0)).to.equal(bid.qty);

        const revealedBid = await auction.revealedBids(await alice.getAddress(), 0);
        expect(revealedBid.isEarly).to.equal(true);
        expect(revealedBid.priceTickIndex).to.equal(0n);
    });

    it("should revert if auction not initialized", async function () {
        const [deployer, manager] = await ethers.getSigners();
        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(ethers.parseEther("1"));
        await token.waitForDeployment();

        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        const auction = await auctionFactory.deploy(await token.getAddress(), manager.address);
        await auction.waitForDeployment();

        await expect(auction.connect(manager).reveal(0, toWei(1n), ethers.ZeroHash, 0)).to.be.revertedWithCustomError(
            auction,
            "AuctionNotInitialized"
        );
    });

    it("should revert if current time ≤ commitEndTime", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 50n });

        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "RevealPhaseClosed"
        );
    });

    it("should revert if current time > revealEndTime", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, commitEndTime, revealEndTime, startTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 50n });

        await time.increaseTo(commitEndTime + 1n);
        await time.increaseTo(revealEndTime + 2n);

        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "RevealPhaseClosed"
        );
    });

    it("should revert if commitIndex out of range", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 10n });
        await time.increaseTo(commitEndTime + 1n);

        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 1)).to.be.revertedWithPanic(0x32);
    });

    it("should revert if commit already revealed", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 20n });
        await time.increaseTo(commitEndTime + 1n);

        await auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0);
        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "AlreadyRevealed"
        );
    });

    it("should revert if priceTickIndex >= priceTicks.length", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 20n });
        await time.increaseTo(commitEndTime + 1n);

        const invalidIndex = await auction.priceTicksLength();
        await expect(auction.connect(alice).reveal(invalidIndex, bid.qty, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "InvalidCommit"
        );
    });

    it("should revert if qty == 0", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 10n });
        await time.increaseTo(commitEndTime + 1n);

        await expect(auction.connect(alice).reveal(0, 0n, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "InvalidCommit"
        );
    });

    it("should revert if computed hash does not match commitHash", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 10n });
        await time.increaseTo(commitEndTime + 1n);

        // Use wrong qty (different wei value) to trigger hash mismatch
        const wrongQtyWei = toWei(20n); // Different from bid.qty
        await expect(auction.connect(alice).reveal(0, wrongQtyWei, randomNonce(), 0)).to.be.revertedWithCustomError(
            auction,
            "InvalidCommit"
        );
    });

    it("should revert if revealed quantity exceeds per-address cap", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        await time.increaseTo(ctx.startTime + 1n);
        const { auction, alice, commitEndTime } = ctx;

        const qty = 50n;
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty });

        // perAddressCap must be in wei
        const reducedCap = bid.qty - toWei(1n);
        await setPerAddressCap(auction, reducedCap);

        await time.increaseTo(commitEndTime + 1n);

        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "CapExceeded"
        );
    });

    it("should revert if deposit does not match qty * priceTicks[0]", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        await time.increaseTo(ctx.startTime + 1n);
        const { auction, alice, commitEndTime } = ctx;

        const qty = 30n;
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty });

        const originalTick = BigInt(await auction.priceTicks(0));
        await setPriceTick(auction, 0, originalTick + 1n);

        await time.increaseTo(commitEndTime + 1n);

        await expect(auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0)).to.be.revertedWithCustomError(
            auction,
            "DepositMismatch"
        );
    });

    it("should grant full early bonus when reserve sufficient", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        await time.increaseTo(ctx.startTime + 1n);
        const { auction, alice, commitEndTime, config } = ctx;

        const qty = 60n;
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0);

        const revealed = await auction.revealedBids(await alice.getAddress(), 0);
        expect(revealed.isEarly).to.equal(true);
    });

    it("should prorate bonus when reserve insufficient", async function () {
        const overrides = {
            bonusReserve: ethers.parseUnits("3", 18),
            tokensForSale: ethers.parseUnits("100", 18),
            perAddressCap: ethers.parseUnits("100", 18)
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        await time.increaseTo(ctx.startTime + 1n);
        const { auction, alice, commitEndTime } = ctx;

        const qty = 60n;
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0);


        const revealed = await auction.revealedBids(await alice.getAddress(), 0);
        expect(revealed.isEarly).to.equal(true);
    });

    it("should set bonusPct to zero when reserve depleted", async function () {
        const overrides = {
            bonusReserve: 0n,
            tokensForSale: ethers.parseUnits("100", 18),
            perAddressCap: ethers.parseUnits("100", 18)
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        await time.increaseTo(ctx.startTime + 1n);
        const { auction, alice, commitEndTime } = ctx;

        const qty = 40n;
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, bid.qty, bid.nonce, 0);

        const revealed = await auction.revealedBids(await alice.getAddress(), 0);
        expect(revealed.bonusPct).to.equal(0n);
    });
});
