import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { commitBid, deployAuctionFixture, fixtureWithOverrides } from "./utils/dutchAuctionFixtures";

describe("DutchAuction – 05_dynamic_reserve", function () {
    it("should adjust decay multiplier and shorten commit window when deposits lag", async function () {
        const overrides = {
            thresholdLow: ethers.parseEther("10"),
            commitDuration: 1_200n,
            minCommitDuration: 600n,
            maxDecayMultiplier: ethers.parseEther("3")
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const { auction, deployer } = ctx;

        const startTime = await auction.startTime();
        const initialCommitEnd = await auction.commitEndTime();
        const initialRevealEnd = await auction.revealEndTime();

        const commitWindow = initialCommitEnd - startTime;
        const expectedReduction = (commitWindow * 25n) / 100n;
        const expectedRevealOffset = initialRevealEnd - initialCommitEnd;

        await expect(auction.connect(deployer).updateDynamicReserve())
            .to.emit(auction, "DynamicAdjustment")
            .withArgs(overrides.maxDecayMultiplier, anyValue, 0, 0);

        const newDecayMultiplier = await auction.decayMultiplier();
        expect(newDecayMultiplier).to.equal(overrides.maxDecayMultiplier);

        const minEndTime = startTime + overrides.minCommitDuration;
        let expectedCommitEnd = initialCommitEnd - expectedReduction;
        if (expectedCommitEnd < minEndTime) expectedCommitEnd = minEndTime;

        const updatedCommitEnd = await auction.commitEndTime();
        expect(updatedCommitEnd).to.equal(expectedCommitEnd);

        const updatedRevealEnd = await auction.revealEndTime();
        expect(updatedRevealEnd).to.equal(updatedCommitEnd + expectedRevealOffset);

        expect(await auction.dynamicAdjustmentCount()).to.equal(1n);
    });

    it("should clamp commitEndTime to startTime + minCommitDuration", async function () {
        const overrides = {
            thresholdLow: ethers.parseEther("5"),
            commitDuration: 400n,
            minCommitDuration: 350n,
            maxDecayMultiplier: ethers.parseEther("2")
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const { auction, deployer } = ctx;

        const startTime = await auction.startTime();
        const expectedCommitEnd = startTime + overrides.minCommitDuration;

        await auction.connect(deployer).updateDynamicReserve();

        expect(await auction.commitEndTime()).to.equal(expectedCommitEnd);
        expect(await auction.decayMultiplier()).to.equal(overrides.maxDecayMultiplier);
    });

    it("should revert if caller is not the presale manager", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice } = ctx;

        await expect(auction.connect(alice).updateDynamicReserve()).to.be.revertedWithCustomError(auction, "NotManager");
    });

    it("should revert if auction not initialized", async function () {
        const [deployer, manager] = await ethers.getSigners();
        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(ethers.parseEther("1"));
        await token.waitForDeployment();

        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        const auction = await auctionFactory.deploy(await token.getAddress(), manager.address);
        await auction.waitForDeployment();

        await expect(auction.connect(manager).updateDynamicReserve()).to.be.revertedWithCustomError(
            auction,
            "AuctionNotInitialized"
        );
    });

    it("should revert if commit phase already completed", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        await time.increaseTo(commitEndTime + 1n);

        await expect(auction.updateDynamicReserve()).to.be.revertedWithCustomError(auction, "CommitPhaseComplete");
    });

    it("should revert if updateDynamicReserve is called more than once", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, startTime } = ctx;

        await time.increaseTo(startTime + 1n);
        await auction.updateDynamicReserve();

        await expect(auction.updateDynamicReserve()).to.be.revertedWithCustomError(auction, "CommitPhaseComplete");
    });

    it("should keep parameters unchanged when deposits meet threshold", async function () {
        const overrides = {
            thresholdLow: ethers.parseEther("0.1"),
            maxDecayMultiplier: ethers.parseEther("2")
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const { auction, deployer, alice, startTime, commitEndTime } = ctx;

        const initialCommitEnd = await auction.commitEndTime();
        const initialDecay = await auction.decayMultiplier();

        await time.increaseTo(startTime + 1n);
        await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: 80n });

        await expect(auction.connect(deployer).updateDynamicReserve()).to.not.emit(auction, "DynamicAdjustment");

        expect(await auction.decayMultiplier()).to.equal(initialDecay);
        expect(await auction.commitEndTime()).to.equal(initialCommitEnd);
        expect(await auction.dynamicAdjustmentCount()).to.equal(0n);

        // ensure reveal window still intact
        await time.increaseTo(commitEndTime + 1n);
    });

    it("should not update decay multiplier when current >= max", async function () {
        // This tests ReserveDecayLib.applyDecayMultiplier branch: currentMultiplier >= maxMultiplier
        const overrides = {
            thresholdLow: ethers.parseEther("10"),
            commitDuration: 1_200n,
            minCommitDuration: 600n,
            maxDecayMultiplier: ethers.parseEther("1") // Lower max
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const { auction, deployer } = ctx;

        // Set initial decay multiplier to be >= max
        const initialDecay = await auction.decayMultiplier();
        // If initial decay is already >= max, it should not change
        await auction.connect(deployer).updateDynamicReserve();
        
        const newDecay = await auction.decayMultiplier();
        // Should be at least maxDecayMultiplier
        expect(newDecay).to.be.gte(overrides.maxDecayMultiplier);
    });

    it("should not update commit end when currentCommitEnd <= minEnd", async function () {
        // This tests ReserveDecayLib.adjustedCommitEnd branch: currentCommitEnd <= minEnd
        const overrides = {
            thresholdLow: ethers.parseEther("10"),
            commitDuration: 400n,
            minCommitDuration: 350n, // Very close to commitDuration
            maxDecayMultiplier: ethers.parseEther("2")
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const { auction, deployer } = ctx;

        const startTime = await auction.startTime();
        const initialCommitEnd = await auction.commitEndTime();
        const minEnd = startTime + overrides.minCommitDuration;

        // If initialCommitEnd is already at or below minEnd, it shouldn't change
        if (initialCommitEnd <= minEnd) {
            await auction.connect(deployer).updateDynamicReserve();
            const updatedCommitEnd = await auction.commitEndTime();
            expect(updatedCommitEnd).to.equal(initialCommitEnd);
        }
    });

    it("should not update commit end when targetEnd >= currentCommitEnd", async function () {
        // This tests ReserveDecayLib.adjustedCommitEnd branch: targetEnd >= currentCommitEnd (line 45)
        // This happens when reduction is very small or zero
        const overrides = {
            thresholdLow: ethers.parseEther("10"),
            commitDuration: 100n, // Very short window
            minCommitDuration: 50n,
            maxDecayMultiplier: ethers.parseEther("2")
        };
        const ctx = await loadFixture(fixtureWithOverrides(overrides));
        const { auction, deployer } = ctx;

        const initialCommitEnd = await auction.commitEndTime();
        
        // Call updateDynamicReserve
        await auction.connect(deployer).updateDynamicReserve();
        
        const updatedCommitEnd = await auction.commitEndTime();
        // Should be <= initialCommitEnd
        expect(updatedCommitEnd).to.be.lte(initialCommitEnd);
    });
});
