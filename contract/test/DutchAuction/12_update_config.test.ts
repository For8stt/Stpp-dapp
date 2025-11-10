import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployAuctionFixture } from "./utils/dutchAuctionFixtures";

describe("DutchAuction – 12_update_config", function () {
    it("should allow owner to updateBonusReserve and increase bonusReserveRemaining", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction } = ctx;

        const initialReserve = await auction.bonusReserve();
        const initialRemaining = await auction.bonusReserveRemaining();

        await auction.updateBonusReserve(25n);

        expect(await auction.bonusReserve()).to.equal(initialReserve + 25n);
        expect(await auction.bonusReserveRemaining()).to.equal(initialRemaining + 25n);
    });

    it("should revert updateBonusReserve if amount is zero", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction } = ctx;

        await expect(auction.updateBonusReserve(0)).to.be.revertedWithCustomError(auction, "InvalidReserveIncrease");
    });

    it("should allow owner to updateVesting and emit VestingUpdated", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction } = ctx;

        const newStart = (await auction.vestingStart()) + 1_000n;
        const newDuration = 5_000n;

        await expect(auction.updateVesting(newStart, newDuration))
            .to.emit(auction, "VestingUpdated")
            .withArgs(newStart, newDuration);
    });

    it("should update vestingStart and vestingDuration correctly", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction } = ctx;

        const newStart = (await auction.vestingStart()) + 2_000n;
        const newDuration = 7_200n;

        await auction.updateVesting(newStart, newDuration);

        expect(await auction.vestingStart()).to.equal(newStart);
        expect(await auction.vestingDuration()).to.equal(newDuration);
    });

    it("should revert updateBonusReserve if called by non-owner", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice } = ctx;

        await expect(auction.connect(alice).updateBonusReserve(10n)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert updateVesting if called by non-owner", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, bob } = ctx;

        await expect(auction.connect(bob).updateVesting(0, 0)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow initializeAuction to be called twice", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, config, deployer } = ctx;

        await expect(
            auction.connect(deployer).initializeAuction({
                startTime: config.startTime,
                commitDuration: config.commitDuration,
                revealDuration: config.revealDuration,
                perAddressCap: config.perAddressCap,
                softCap: config.softCap,
                tokensForSale: config.tokensForSale,
                bonusReserve: config.bonusReserve,
                earlyBonusWindow: config.earlyBonusWindow,
                earlyBonusPct: config.earlyBonusPct,
                nonRevealPenaltyBps: config.nonRevealPenaltyBps,
                lbpStableShareBps: config.lbpStableShareBps,
                thresholdLow: config.thresholdLow,
                maxDecayMultiplier: config.maxDecayMultiplier,
                minCommitDuration: config.minCommitDuration,
                vestingStart: config.vestingStart,
                vestingDuration: config.vestingDuration,
                treasury: config.treasury,
                lbpTokenRecipient: config.lbpTokenRecipient,
                lbpStableRecipient: config.lbpStableRecipient,
                merkleRoot: config.merkleRoot,
                priceTicks: config.priceTicks
            })
        ).to.be.revertedWithCustomError(auction, "AuctionFinalizedAlready");
    });

    it("should not allow changes to auction config after auction has started (time > startTime)", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, config, deployer, startTime } = ctx;

        await time.increaseTo(startTime + 1n);

        await expect(
            auction.connect(deployer).initializeAuction({
                startTime: config.startTime,
                commitDuration: config.commitDuration,
                revealDuration: config.revealDuration,
                perAddressCap: config.perAddressCap,
                softCap: config.softCap,
                tokensForSale: config.tokensForSale,
                bonusReserve: config.bonusReserve,
                earlyBonusWindow: config.earlyBonusWindow,
                earlyBonusPct: config.earlyBonusPct,
                nonRevealPenaltyBps: config.nonRevealPenaltyBps,
                lbpStableShareBps: config.lbpStableShareBps,
                thresholdLow: config.thresholdLow,
                maxDecayMultiplier: config.maxDecayMultiplier,
                minCommitDuration: config.minCommitDuration,
                vestingStart: config.vestingStart,
                vestingDuration: config.vestingDuration,
                treasury: config.treasury,
                lbpTokenRecipient: config.lbpTokenRecipient,
                lbpStableRecipient: config.lbpStableRecipient,
                merkleRoot: config.merkleRoot,
                priceTicks: config.priceTicks
            })
        ).to.be.revertedWithCustomError(auction, "AuctionFinalizedAlready");
    });
});
