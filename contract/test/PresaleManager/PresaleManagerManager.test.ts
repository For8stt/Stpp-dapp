import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const BPS_DENOMINATOR = 10_000n;

async function deployFixture() {
    const [owner, treasury, alice] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const totalSupply = ethers.parseUnits("1000000", 18);
    const token = await tokenFactory.deploy(totalSupply);
    await token.waitForDeployment();

    const managerFactory = await ethers.getContractFactory("PresaleManager");
    const manager = await managerFactory.deploy();
    await manager.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? 0);

    const auctionInput = {
        saleToken: await token.getAddress(),
        treasury: treasury.address,
        startTime: now + 120n,
        commitDuration: 300n,
        revealDuration: 300n,
        perAddressCap: ethers.parseUnits("1000", 18),
        softCap: ethers.parseEther("1"),
        tokensForSale: ethers.parseUnits("20", 18),
        bonusReserve: ethers.parseUnits("5", 18),
        earlyBonusWindow: 600n,
        earlyBonusPct: 500n,
        nonRevealPenaltyBps: 100n,
        lbpStableShareBps: 2_000n,
        thresholdLow: ethers.parseEther("5"),
        maxDecayMultiplier: ethers.parseEther("2"),
        minCommitDuration: 120n,
        demandCheckTime: now + 200n,
        vestingStart: now + 120n,
        vestingDuration: 0n,
        merkleRoot: ethers.ZeroHash,
        priceTicks: [2n, 1n]
    };

    const auctionAddress = await manager.createAuction.staticCall(auctionInput);
    await manager.createAuction(auctionInput);
    const auction = await ethers.getContractAt("DutchAuction", auctionAddress);

    await token.transfer(
        auctionAddress,
        auctionInput.tokensForSale + auctionInput.bonusReserve
    );

    return {
        manager,
        auction,
        token,
        owner,
        treasury,
        alice,
        config: auctionInput
    };
}

async function fullPipelineFixture() {
    const base = await deployFixture();
    const { manager, auction, token, treasury, alice, config } = base;

    const commitQty = ethers.parseUnits("10", 18);
    const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
    const deposit = commitQty * priceTicks[0];
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const commitHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32"], [0, commitQty, nonce])
    );

    await time.increaseTo(config.startTime + 1n);
    await auction.connect(alice).commit(commitHash, [], { value: deposit });

    await time.increaseTo(config.startTime + config.commitDuration + 1n);
    await auction.connect(alice).reveal(0, commitQty, nonce, 0);

    await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
    await manager.finalizeAuction(await auction.getAddress());

    const stableShare = (commitQty * priceTicks[1] * config.lbpStableShareBps) / BPS_DENOMINATOR;
    const lbpStart = config.startTime + config.commitDuration + config.revealDuration + 600n;
    const launchConfig = {
        startTime: lbpStart,
        endTime: config.startTime + config.commitDuration + config.revealDuration + 1_200n,
        poolStartWeightToken: 70n * 10n ** 16n,
        poolEndWeightToken: 30n * 10n ** 16n,
        poolSwapFee: 3n * 10n ** 15n,
        vestingStartTime: lbpStart,
        vestingCliffDuration: 0n,
        vestingFinalDuration: 0n,
        vestingCliffPercentBP: 0n
    };

    await manager.launchLBP(await auction.getAddress(), launchConfig);

    const recordAfterLaunch = await manager.getAuctionRecord(await auction.getAddress());
    const lbp = await ethers.getContractAt("SecureLBP", recordAfterLaunch.lbp);

    const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await escrowFactory.deploy(await token.getAddress(), await lbp.getAddress());
    await escrow.waitForDeployment();

    await time.increaseTo(launchConfig.endTime + 1n);
    await manager.finalizeLbp(await auction.getAddress(), await escrow.getAddress());

    return {
        ...base,
        lbp,
        launchConfig,
        commitQty,
        priceTicks,
        stableShare
    };
}

// npx hardhat test test/PresaleManager/PresaleManagerManager.test.ts
describe("PresaleManager", function () {
    it("tracks created auctions and exposes them via getAllAuctions", async function () {
        const { manager } = await loadFixture(deployFixture);

        const auctions = await manager.getAllAuctions();
        expect(auctions.length).to.equal(1);
        expect(await manager.isManagedAuction(auctions[0])).to.equal(true);
    });

    it("runs the full auction → LBP → vesting pipeline", async function () {
        const { manager, auction, token, treasury, alice, config } = await loadFixture(deployFixture);

        const commitQty = ethers.parseUnits("10", 18);
        const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
        const deposit = commitQty * priceTicks[0];
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const commitHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32"], [0, commitQty, nonce])
        );

        await time.increaseTo(config.startTime + 1n);
        await auction.connect(alice).commit(commitHash, [], { value: deposit });

        await time.increaseTo(config.startTime + config.commitDuration + 1n);
        await auction.connect(alice).reveal(0, commitQty, nonce, 0);

        await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
        await expect(manager.finalizeAuction(await auction.getAddress()))
            .to.emit(auction, "AuctionFinalized")
            .withArgs(true, priceTicks[1], commitQty, commitQty * priceTicks[1]);

        const stableShare = (commitQty * priceTicks[1] * config.lbpStableShareBps) / BPS_DENOMINATOR;
        const lbpStart = config.startTime + config.commitDuration + config.revealDuration + 600n;
        const launchConfig = {
            startTime: lbpStart,
            endTime: config.startTime + config.commitDuration + config.revealDuration + 1_200n,
            poolStartWeightToken: 70n * 10n ** 16n,
            poolEndWeightToken: 30n * 10n ** 16n,
            poolSwapFee: 3n * 10n ** 15n,
            vestingStartTime: lbpStart,
            vestingCliffDuration: 0n,
            vestingFinalDuration: 0n,
            vestingCliffPercentBP: 0n
        };

        const launchTx = await manager.launchLBP(await auction.getAddress(), launchConfig);
        await expect(launchTx)
            .to.emit(manager, "LBPInitialized")
            .withArgs(
                await auction.getAddress(),
                anyValue,
                anyValue,
                config.tokensForSale - commitQty,
                stableShare
            );

        const recordAfterLaunch = await manager.getAuctionRecord(await auction.getAddress());
        const lbpAddress = recordAfterLaunch.lbp;
        expect(lbpAddress).to.not.equal(ethers.ZeroAddress);

        const lbp = await ethers.getContractAt("SecureLBP", lbpAddress);
        expect(await lbp.poolInitialized()).to.equal(true);

        expect(recordAfterLaunch.lbpTokensProvided).to.equal(config.tokensForSale - commitQty);
        expect(recordAfterLaunch.lbpEthProvided).to.equal(stableShare);

        const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await escrowFactory.deploy(await token.getAddress(), lbpAddress);
        await escrow.waitForDeployment();

        await time.increaseTo(launchConfig.endTime + 1n);
        const expectedAllocated = await lbp.totalTokensAllocated();
        await expect(manager.finalizeLbp(await auction.getAddress(), await escrow.getAddress()))
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), expectedAllocated);

        const recordAfterFinalize = await manager.getAuctionRecord(await auction.getAddress());
        expect(recordAfterFinalize.lbpFinalized).to.equal(true);
        expect(recordAfterFinalize.vestingEscrow).to.equal(await escrow.getAddress());
        const lbpEthRaised = await lbp.totalEthRaised();
        expect(recordAfterFinalize.ethRaisedDuringLBP).to.equal(lbpEthRaised);
        expect(await token.balanceOf(await escrow.getAddress())).to.equal(expectedAllocated);

        const withdrawable = await auction.ethForTreasury();
        await manager.withdrawAuctionProceeds(await auction.getAddress(), treasury.address);
        expect(await auction.ethForTreasury()).to.equal(0n);
        expect(await manager.getAuctionRecord(await auction.getAddress())).to.exist;
        expect(withdrawable).to.be.gt(0n);
    });

    it("reverts finalizeLbp when escrow token mismatches sale token", async function () {
        const { manager, auction, token, treasury, alice, config } = await loadFixture(deployFixture);

        const commitQty = ethers.parseUnits("10", 18);
        const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
        const deposit = commitQty * priceTicks[0];
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const commitHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32"], [0, commitQty, nonce])
        );

        await time.increaseTo(config.startTime + 1n);
        await auction.connect(alice).commit(commitHash, [], { value: deposit });

        await time.increaseTo(config.startTime + config.commitDuration + 1n);
        await auction.connect(alice).reveal(0, commitQty, nonce, 0);

        await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
        await manager.finalizeAuction(await auction.getAddress());

        const stableShare = (commitQty * priceTicks[1] * config.lbpStableShareBps) / BPS_DENOMINATOR;
        const lbpStart = config.startTime + config.commitDuration + config.revealDuration + 600n;
        const launchConfig = {
            startTime: lbpStart,
            endTime: config.startTime + config.commitDuration + config.revealDuration + 1_200n,
            poolStartWeightToken: 70n * 10n ** 16n,
            poolEndWeightToken: 30n * 10n ** 16n,
            poolSwapFee: 3n * 10n ** 15n,
            vestingStartTime: lbpStart,
            vestingCliffDuration: 0n,
            vestingFinalDuration: 0n,
            vestingCliffPercentBP: 0n
        };

        await manager.launchLBP(await auction.getAddress(), launchConfig);
        await time.increaseTo(launchConfig.endTime + 1n);

        const otherTokenFactory = await ethers.getContractFactory("TestToken");
        const otherToken = await otherTokenFactory.deploy(ethers.parseUnits("1000", 18));
        await otherToken.waitForDeployment();

        const fakeEscrowFactory = await ethers.getContractFactory("MockEscrowWrongToken");
        const fakeEscrow = await fakeEscrowFactory.deploy(await otherToken.getAddress());
        await fakeEscrow.waitForDeployment();

        await expect(
            manager.finalizeLbp(await auction.getAddress(), await fakeEscrow.getAddress())
        ).to.be.revertedWithCustomError(manager, "EscrowTokenMismatch");
    });

    describe("LBP withdrawals via manager", function () {
        it("withdrawLbpTokens forwards partial token withdrawals to SecureLBP", async function () {
            const { manager, auction, lbp, token, treasury } = await loadFixture(fullPipelineFixture);

            await manager.unwindLbpAll(await auction.getAddress());

            const lbpAddress = await lbp.getAddress();
            const treasuryBefore = await token.balanceOf(treasury.address);
            const contractBalance = await token.balanceOf(lbpAddress);
            expect(contractBalance).to.be.gt(0n);
            const partial = contractBalance / 2n;

            await expect(manager.withdrawLbpTokens(await auction.getAddress(), partial))
                .to.emit(lbp, "TokensWithdrawn")
                .withArgs(treasury.address, partial);

            expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + partial);
            expect(await token.balanceOf(lbpAddress)).to.equal(contractBalance - partial);
        });

        it("withdrawLbpAllTokens drains all remaining tokens", async function () {
            const { manager, auction, lbp, token, treasury } = await loadFixture(fullPipelineFixture);

            await manager.unwindLbpAll(await auction.getAddress());

            const lbpAddress = await lbp.getAddress();
            const contractBalance = await token.balanceOf(lbpAddress);
            expect(contractBalance).to.be.gt(0n);
            const treasuryBefore = await token.balanceOf(treasury.address);

            await expect(manager.withdrawLbpAllTokens(await auction.getAddress()))
                .to.emit(lbp, "TokensWithdrawn")
                .withArgs(treasury.address, contractBalance);

            expect(await token.balanceOf(lbpAddress)).to.equal(0n);
            expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + contractBalance);
        });
    });
});
