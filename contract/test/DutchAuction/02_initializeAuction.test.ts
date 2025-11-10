import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("DutchAuction – 02_initializeAuction", function () {
    async function deployBaseFixture() {
        const [manager, treasury, lbpTokenRecipient, lbpStableRecipient, other] = await ethers.getSigners();

        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        const auction = await auctionFactory.deploy(await token.getAddress(), manager.address);
        await auction.waitForDeployment();

        const latestBlock = await ethers.provider.getBlock("latest");
        const now = BigInt(latestBlock?.timestamp ?? 0);

        const priceTicks = [
            ethers.parseUnits("0.003", 18),
            ethers.parseUnits("0.002", 18),
            ethers.parseUnits("0.001", 18)
        ];

        const baseConfig = {
            startTime: now + 600n,
            commitDuration: 900n,
            revealDuration: 600n,
            perAddressCap: 500n,
            softCap: ethers.parseEther("1"),
            tokensForSale: 1_000n,
            bonusReserve: 200n,
            earlyBonusWindow: 300n,
            earlyBonusPct: 800n,
            nonRevealPenaltyBps: 250n,
            lbpStableShareBps: 2_000n,
            thresholdLow: ethers.parseEther("0.5"),
            maxDecayMultiplier: ethers.parseEther("2"),
            minCommitDuration: 600n,
            vestingStart: now + 10_000n,
            vestingDuration: 3_600n,
            treasury: treasury.address,
            lbpTokenRecipient: lbpTokenRecipient.address,
            lbpStableRecipient: lbpStableRecipient.address,
            merkleRoot: ethers.ZeroHash,
            priceTicks
        };

        return {
            token,
            auction,
            manager,
            treasury,
            lbpTokenRecipient,
            lbpStableRecipient,
            other,
            baseConfig
        };
    }

    it("should initialize auction once with correct config values", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);

        const expectedCommitEnd = baseConfig.startTime + baseConfig.commitDuration;
        const expectedRevealEnd = expectedCommitEnd + baseConfig.revealDuration;

        await expect(auction.connect(manager).initializeAuction(baseConfig))
            .to.emit(auction, "AuctionInitialized")
            .withArgs(baseConfig.startTime, expectedCommitEnd, expectedRevealEnd, baseConfig.tokensForSale)
            .and.to.emit(auction, "VestingUpdated")
            .withArgs(baseConfig.vestingStart, baseConfig.vestingDuration);

        expect(await auction.initialized()).to.equal(true);
        expect(await auction.tokensForSale()).to.equal(baseConfig.tokensForSale);
        expect(await auction.bonusReserve()).to.equal(baseConfig.bonusReserve);
        expect(await auction.bonusReserveRemaining()).to.equal(baseConfig.bonusReserve);

        expect(await auction.startTime()).to.equal(baseConfig.startTime);
        expect(await auction.commitEndTime()).to.equal(expectedCommitEnd);
        expect(await auction.revealEndTime()).to.equal(expectedRevealEnd);

        expect(await auction.perAddressCap()).to.equal(baseConfig.perAddressCap);
        expect(await auction.softCap()).to.equal(baseConfig.softCap);
        expect(await auction.earlyBonusWindow()).to.equal(baseConfig.earlyBonusWindow);
        expect(await auction.earlyBonusPct()).to.equal(baseConfig.earlyBonusPct);

        expect(await auction.nonRevealPenaltyBps()).to.equal(baseConfig.nonRevealPenaltyBps);
        expect(await auction.lbpStableShareBps()).to.equal(baseConfig.lbpStableShareBps);
        expect(await auction.thresholdLow()).to.equal(baseConfig.thresholdLow);
        expect(await auction.maxDecayMultiplier()).to.equal(baseConfig.maxDecayMultiplier);
        expect(await auction.minCommitDuration()).to.equal(baseConfig.minCommitDuration);

        expect(await auction.vestingStart()).to.equal(baseConfig.vestingStart);
        expect(await auction.vestingDuration()).to.equal(baseConfig.vestingDuration);
        expect(await auction.treasury()).to.equal(baseConfig.treasury);
        expect(await auction.lbpTokenRecipient()).to.equal(baseConfig.lbpTokenRecipient);
        expect(await auction.lbpStableRecipient()).to.equal(baseConfig.lbpStableRecipient);
        expect(await auction.merkleRoot()).to.equal(baseConfig.merkleRoot);

        const length = await auction.priceTicksLength();
        expect(length).to.equal(baseConfig.priceTicks.length);
        for (let i = 0; i < baseConfig.priceTicks.length; i++) {
            expect(await auction.priceTicks(i)).to.equal(baseConfig.priceTicks[i]);
        }
    });

    it("should revert if called by non-manager address", async function () {
        const { auction, other, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(auction.connect(other).initializeAuction(baseConfig)).to.be.revertedWithCustomError(
            auction,
            "NotManager"
        );
    });

    it("should revert if called twice", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await auction.connect(manager).initializeAuction(baseConfig);
        await expect(auction.connect(manager).initializeAuction(baseConfig)).to.be.revertedWithCustomError(
            auction,
            "AuctionFinalizedAlready"
        );
    });

    it("should revert if treasury is zero address", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, treasury: ethers.ZeroAddress })
        ).to.be.revertedWithCustomError(auction, "TreasuryZero");
    });

    it("should revert if tokensForSale is zero", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, tokensForSale: 0n })
        ).to.be.revertedWithCustomError(auction, "TokensForSaleZero");
    });

    it("should revert if revealDuration is zero", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, revealDuration: 0n })
        ).to.be.revertedWithCustomError(auction, "RevealDurationZero");
    });

    it("should revert if commitDuration is shorter than minCommitDuration", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({
                ...baseConfig,
                commitDuration: baseConfig.minCommitDuration - 1n
            })
        ).to.be.revertedWithCustomError(auction, "CommitDurationTooShort");
    });

    it("should revert if priceTicks array is empty", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, priceTicks: [] })
        ).to.be.revertedWithCustomError(auction, "PriceTicksEmpty");
    });

    it("should revert if priceTicks are not strictly descending", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        const invalidTicks = [...baseConfig.priceTicks].reverse();
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, priceTicks: invalidTicks })
        ).to.be.revertedWithCustomError(auction, "InvalidPriceTicks");
    });

    it("should revert if nonRevealPenaltyBps exceeds 10000", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, nonRevealPenaltyBps: 10_001n })
        ).to.be.revertedWithCustomError(auction, "PenaltyTooHigh");
    });

    it("should revert if earlyBonusPct exceeds 10000", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, earlyBonusPct: 10_001n })
        ).to.be.revertedWithCustomError(auction, "BonusTooHigh");
    });

    it("should revert if lbpStableShareBps exceeds 10000", async function () {
        const { auction, manager, baseConfig } = await loadFixture(deployBaseFixture);
        await expect(
            auction.connect(manager).initializeAuction({ ...baseConfig, lbpStableShareBps: 10_001n })
        ).to.be.revertedWithCustomError(auction, "LbpShareTooHigh");
    });
});
