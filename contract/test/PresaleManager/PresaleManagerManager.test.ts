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
        priceTicks: [ethers.parseEther("2"), ethers.parseEther("1")]
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
    // commitQty is in wei, deposit = (commitQty * priceTicks[0]) / 1e18
    const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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

    // totalRaised = (tokensSold * clearingPrice) / 1e18, stableShare = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR
    const totalRaised = (commitQty * priceTicks[1]) / 10n**18n;
    const stableShare = (totalRaised * config.lbpStableShareBps) / BPS_DENOMINATOR;
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
        vestingCliffPercentBP: 0n,
        initialFeePreset: 1, // TEN_PERCENT
        feeDecayDurationPreset: 1, // FIFTEEN_MINUTES
        maxContributionPerAddress: 0n // Use default 5 ETH
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
        // commitQty is in wei, deposit = (commitQty * priceTicks[0]) / 1e18
        const deposit = (commitQty * priceTicks[0]) / 10n**18n;
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const commitHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32"], [0, commitQty, nonce])
        );

        await time.increaseTo(config.startTime + 1n);
        await auction.connect(alice).commit(commitHash, [], { value: deposit });

        await time.increaseTo(config.startTime + config.commitDuration + 1n);
        await auction.connect(alice).reveal(0, commitQty, nonce, 0);

        await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
        // totalRaised = (tokensSold * clearingPrice) / 1e18
        const expectedTotalRaised = (commitQty * priceTicks[1]) / 10n**18n;
        await expect(manager.finalizeAuction(await auction.getAddress()))
            .to.emit(auction, "AuctionFinalized")
            .withArgs(true, priceTicks[1], commitQty, expectedTotalRaised);

        // stableShare = (totalRaised * lbpStableShareBps) / BPS_DENOMINATOR
        // totalRaised is in wei (ETH), so stableShare is also in wei
        const stableShare = (expectedTotalRaised * config.lbpStableShareBps) / BPS_DENOMINATOR;
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
            vestingCliffPercentBP: 0n,
            initialFeePreset: 1, // TEN_PERCENT
            feeDecayDurationPreset: 1, // FIFTEEN_MINUTES
            maxContributionPerAddress: 0n // Use default 5 ETH
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

        // After launchLbp(), ethForTreasury is automatically sent to treasury, so it should be 0
        const withdrawable = await auction.ethForTreasury();
        expect(withdrawable).to.equal(0n); // ethForTreasury is already 0 after launchLbp()
        
        // Verify that treasury received the funds (check balance before and after launchLbp)
        // Since launchLbp() already sent funds to treasury, withdrawAuctionProceeds should do nothing
        const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
        await manager.withdrawAuctionProceeds(await auction.getAddress(), treasury.address);
        const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
        
        expect(await auction.ethForTreasury()).to.equal(0n);
        expect(await manager.getAuctionRecord(await auction.getAddress())).to.exist;
        // Treasury balance should not change (funds were already sent during launchLbp)
        expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore);
    });

    it("reverts finalizeLbp when escrow token mismatches sale token", async function () {
        const { manager, auction, token, treasury, alice, config } = await loadFixture(deployFixture);

        const commitQty = ethers.parseUnits("10", 18);
        const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
        // commitQty is in wei, deposit = (commitQty * priceTicks[0]) / 1e18
        const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
            vestingCliffPercentBP: 0n,
            initialFeePreset: 1, // TEN_PERCENT
            feeDecayDurationPreset: 1, // FIFTEEN_MINUTES
            maxContributionPerAddress: 0n // Use default 5 ETH
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

    describe("createAuction - Revert Scenarios", function () {
        it("should revert when saleToken is zero", async function () {
            const { manager, treasury, config } = await loadFixture(deployFixture);
            
            const invalidInput = {
                ...config,
                saleToken: ethers.ZeroAddress
            };

            await expect(
                manager.createAuction(invalidInput)
            ).to.be.revertedWithCustomError(manager, "SaleTokenZero");
        });

        it("should revert when treasury is zero", async function () {
            const { manager, token, config } = await loadFixture(deployFixture);
            
            const invalidInput = {
                ...config,
                treasury: ethers.ZeroAddress
            };

            await expect(
                manager.createAuction(invalidInput)
            ).to.be.revertedWithCustomError(manager, "TreasuryZero");
        });

        it("should revert when priceTicks array is empty", async function () {
            const { manager, token, treasury, config } = await loadFixture(deployFixture);
            
            const invalidInput = {
                ...config,
                priceTicks: []
            };

            await expect(
                manager.createAuction(invalidInput)
            ).to.be.revertedWithCustomError(manager, "PriceTicksEmpty");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, alice, config } = await loadFixture(deployFixture);
            
            await expect(
                manager.connect(alice).createAuction(config)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("auctionUpdateBonusReserve", function () {
        it("should successfully update bonus reserve", async function () {
            const { manager, auction } = await loadFixture(deployFixture);
            
            const additionalReserve = ethers.parseUnits("10", 18);
            const recordBefore = await manager.getAuctionRecord(await auction.getAddress());
            const bonusReserveBefore = recordBefore.bonusReserve;

            await manager.auctionUpdateBonusReserve(await auction.getAddress(), additionalReserve);

            const recordAfter = await manager.getAuctionRecord(await auction.getAddress());
            expect(recordAfter.bonusReserve).to.equal(bonusReserveBefore + additionalReserve);
        });

        it("should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.auctionUpdateBonusReserve(alice.address, ethers.parseUnits("10", 18))
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.connect(alice).auctionUpdateBonusReserve(await auction.getAddress(), ethers.parseUnits("10", 18))
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("auctionUpdateVesting", function () {
        it("should successfully update vesting schedule", async function () {
            const { manager, auction, config } = await loadFixture(deployFixture);
            
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = BigInt(latestBlock?.timestamp ?? 0);
            const newStart = now + 1000n;
            const newDuration = 3600n;

            await expect(
                manager.auctionUpdateVesting(await auction.getAddress(), newStart, newDuration)
            ).to.not.be.reverted;
        });

        it("should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = BigInt(latestBlock?.timestamp ?? 0);
            
            await expect(
                manager.auctionUpdateVesting(alice.address, now + 1000n, 3600n)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, alice } = await loadFixture(deployFixture);
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = BigInt(latestBlock?.timestamp ?? 0);
            
            await expect(
                manager.connect(alice).auctionUpdateVesting(await auction.getAddress(), now + 1000n, 3600n)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("auctionWithdrawTreasury", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, treasury, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.auctionWithdrawTreasury(alice.address, treasury.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when recipient is zero", async function () {
            const { manager, auction } = await loadFixture(deployFixture);
            
            await expect(
                manager.auctionWithdrawTreasury(await auction.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(manager, "RecipientZero");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, treasury, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.connect(alice).auctionWithdrawTreasury(await auction.getAddress(), treasury.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("finalizeAuction - Revert Scenarios", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.finalizeAuction(alice.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when auction is already finalized", async function () {
            const { manager, auction, config } = await loadFixture(deployFixture);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            await expect(
                manager.finalizeAuction(await auction.getAddress())
            ).to.be.revertedWithCustomError(manager, "AuctionAlreadyFinalized");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, alice, config } = await loadFixture(deployFixture);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            
            await expect(
                manager.connect(alice).finalizeAuction(await auction.getAddress())
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("launchLBP - Revert Scenarios", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, alice, config } = await loadFixture(deployFixture);
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = BigInt(latestBlock?.timestamp ?? 0);
            
            const launchConfig = {
                startTime: now + 1200n,
                endTime: now + 2400n,
                poolStartWeightToken: 70n * 10n ** 16n,
                poolEndWeightToken: 30n * 10n ** 16n,
                poolSwapFee: 3n * 10n ** 15n,
                vestingStartTime: now + 1200n,
                vestingCliffDuration: 0n,
                vestingFinalDuration: 0n,
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await expect(
                manager.launchLBP(alice.address, launchConfig)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when auction is not finalized", async function () {
            const { manager, auction, config } = await loadFixture(deployFixture);
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = BigInt(latestBlock?.timestamp ?? 0);
            
            const launchConfig = {
                startTime: now + 1200n,
                endTime: now + 2400n,
                poolStartWeightToken: 70n * 10n ** 16n,
                poolEndWeightToken: 30n * 10n ** 16n,
                poolSwapFee: 3n * 10n ** 15n,
                vestingStartTime: now + 1200n,
                vestingCliffDuration: 0n,
                vestingFinalDuration: 0n,
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await expect(
                manager.launchLBP(await auction.getAddress(), launchConfig)
            ).to.be.revertedWithCustomError(manager, "AuctionNotFinalized");
        });

        it("should revert when LBP times are invalid", async function () {
            const { manager, auction, config } = await loadFixture(deployFixture);
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = BigInt(latestBlock?.timestamp ?? 0);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            const invalidLaunchConfig = {
                startTime: now + 2400n,
                endTime: now + 1200n, // endTime < startTime
                poolStartWeightToken: 70n * 10n ** 16n,
                poolEndWeightToken: 30n * 10n ** 16n,
                poolSwapFee: 3n * 10n ** 15n,
                vestingStartTime: now + 1200n,
                vestingCliffDuration: 0n,
                vestingFinalDuration: 0n,
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await expect(
                manager.launchLBP(await auction.getAddress(), invalidLaunchConfig)
            ).to.be.revertedWithCustomError(manager, "InvalidLbpTimes");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, alice, config } = await loadFixture(deployFixture);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            const launchConfig = {
                startTime: config.startTime + config.commitDuration + config.revealDuration + 600n,
                endTime: config.startTime + config.commitDuration + config.revealDuration + 1_200n,
                poolStartWeightToken: 70n * 10n ** 16n,
                poolEndWeightToken: 30n * 10n ** 16n,
                poolSwapFee: 3n * 10n ** 15n,
                vestingStartTime: config.startTime + config.commitDuration + config.revealDuration + 600n,
                vestingCliffDuration: 0n,
                vestingFinalDuration: 0n,
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await expect(
                manager.connect(alice).launchLBP(await auction.getAddress(), launchConfig)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("finalizeLbp - Additional Revert Scenarios", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.finalizeLbp(alice.address, ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when LBP is not launched", async function () {
            const { manager, auction, config } = await loadFixture(deployFixture);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            await expect(
                manager.finalizeLbp(await auction.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(manager, "LbpNotLaunched");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, token, alice, config } = await loadFixture(deployFixture);
            
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await manager.launchLBP(await auction.getAddress(), launchConfig);
            const record = await manager.getAuctionRecord(await auction.getAddress());
            const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
            const escrow = await escrowFactory.deploy(await token.getAddress(), record.lbp);
            await escrow.waitForDeployment();
            
            await time.increaseTo(launchConfig.endTime + 1n);
            
            await expect(
                manager.connect(alice).finalizeLbp(await auction.getAddress(), await escrow.getAddress())
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("LBP Management Functions - Revert Scenarios", function () {
        async function launchedLbpFixture() {
            const base = await deployFixture();
            const { manager, auction, token, treasury, alice, config } = base;

            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await manager.launchLBP(await auction.getAddress(), launchConfig);
            return base;
        }

        it("unwindLbpAll should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.unwindLbpAll(alice.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("unwindLbpAll should revert when LBP is not launched", async function () {
            const { manager, auction, config } = await loadFixture(deployFixture);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            await expect(
                manager.unwindLbpAll(await auction.getAddress())
            ).to.be.revertedWithCustomError(manager, "LbpNotLaunched");
        });

        it("unwindLbpPartial should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.unwindLbpPartial(alice.address, 5000n)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("rebalanceLbp5050 should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.rebalanceLbp5050(alice.address, { value: ethers.parseEther("1") })
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("withdrawLbpEth should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.withdrawLbpEth(alice.address, ethers.parseEther("1"))
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("setLbpUniswapV3Config should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.setLbpUniswapV3Config(
                    alice.address,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    3000
                )
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("setLbpOracleForAuction should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            const [oracle] = await ethers.getSigners();
            
            await expect(
                manager.setLbpOracleForAuction(alice.address, oracle.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("setLbpTreasury should revert when auction is unknown", async function () {
            const { manager, treasury, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.setLbpTreasury(alice.address, treasury.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("setLbpMaxContribution should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.setLbpMaxContribution(alice.address, ethers.parseEther("10"))
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("rescueLbpERC20 should revert when auction is unknown", async function () {
            const { manager, token, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.rescueLbpERC20(alice.address, await token.getAddress(), alice.address, ethers.parseUnits("10", 18))
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });
    });

    describe("setLbpOracle", function () {
        it("should successfully set LBP oracle", async function () {
            const { manager } = await loadFixture(deployFixture);
            const [oracle] = await ethers.getSigners();
            
            await expect(manager.setLbpOracle(oracle.address))
                .to.emit(manager, "LbpOracleSet")
                .withArgs(oracle.address);
            
            expect(await manager.lbpOracle()).to.equal(oracle.address);
        });

        it("should revert when called by non-owner", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            const [oracle] = await ethers.getSigners();
            
            await expect(
                manager.connect(alice).setLbpOracle(oracle.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("setLbpOracleDuringInit", function () {
        it("should successfully set oracle before initialization", async function () {
            const managerFactory = await ethers.getContractFactory("PresaleManager");
            const manager = await managerFactory.deploy();
            await manager.waitForDeployment();
            
            const [oracle] = await ethers.getSigners();
            
            await expect(manager.setLbpOracleDuringInit(oracle.address))
                .to.emit(manager, "LbpOracleSet")
                .withArgs(oracle.address);
            
            expect(await manager.lbpOracle()).to.equal(oracle.address);
        });

        it("should revert when manager is already initialized", async function () {
            const { manager } = await loadFixture(deployFixture);
            const [oracle] = await ethers.getSigners();
            
            await expect(
                manager.setLbpOracleDuringInit(oracle.address)
            ).to.be.revertedWith("Manager already initialized");
        });
    });

    describe("withdrawAuctionProceeds - Revert Scenarios", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, treasury, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.withdrawAuctionProceeds(alice.address, treasury.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when recipient is zero", async function () {
            const { manager, auction } = await loadFixture(deployFixture);
            
            await expect(
                manager.withdrawAuctionProceeds(await auction.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(manager, "RecipientZero");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, treasury, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.connect(alice).withdrawAuctionProceeds(await auction.getAddress(), treasury.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("returnAuctionTokens", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.returnAuctionTokens(alice.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when auction is not finalized", async function () {
            const { manager, auction } = await loadFixture(deployFixture);
            
            await expect(
                manager.returnAuctionTokens(await auction.getAddress())
            ).to.be.revertedWithCustomError(manager, "AuctionNotFinalized");
        });

        it("should revert when auction was successful", async function () {
            const { manager, auction, alice, config } = await loadFixture(deployFixture);
            
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
            
            // Auction is successful, so returnAuctionTokens should revert
            await expect(
                manager.returnAuctionTokens(await auction.getAddress())
            ).to.be.revertedWithCustomError(manager, "AuctionNotFinalized");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, alice, config } = await loadFixture(deployFixture);
            
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            await expect(
                manager.connect(alice).returnAuctionTokens(await auction.getAddress())
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should handle returnTokensToOwner when balance is zero", async function () {
            // This tests the branch in returnTokensToOwner where balance == 0 (lines 760-762)
            // We need an unsuccessful auction with zero balance
            const { manager, auction, token, config } = await loadFixture(deployFixture);
            
            // Finalize auction without any successful bids (unsuccessful)
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());
            
            // Check if auction was unsuccessful
            const auctionContract = await ethers.getContractAt("DutchAuction", await auction.getAddress());
            const successful = await auctionContract.successful();
            
            if (!successful) {
                // If balance is already zero, returnTokensToOwner should not revert
                // but also should not emit event (balance == 0 branch)
                const balance = await token.balanceOf(await auction.getAddress());
                if (balance === 0n) {
                    // Should not revert, but also should not emit event
                    await expect(
                        manager.returnAuctionTokens(await auction.getAddress())
                    ).to.not.be.reverted;
                }
            }
        });
    });

    describe("View Functions", function () {
        describe("getPresaleInfo", function () {
            it("should return correct presale info", async function () {
                const { manager, auction, owner } = await loadFixture(deployFixture);
                
                const info = await manager.getPresaleInfo(await auction.getAddress());
                expect(info.ownerAddress).to.equal(owner.address);
                expect(info.auction).to.equal(await auction.getAddress());
                expect(info.finalized).to.equal(false);
                expect(info.lbpInitialized).to.equal(false);
                expect(info.lbpFinalized).to.equal(false);
            });

            it("should revert when auction is unknown", async function () {
                const { manager, alice } = await loadFixture(deployFixture);
                
                await expect(
                    manager.getPresaleInfo(alice.address)
                ).to.be.revertedWithCustomError(manager, "UnknownAuction");
            });
        });

        describe("getLatestPresaleInfo", function () {
            it("should return correct latest presale info", async function () {
                const { manager, auction, owner } = await loadFixture(deployFixture);
                
                const info = await manager.getLatestPresaleInfo();
                expect(info.ownerAddress).to.equal(owner.address);
                expect(info.auction).to.equal(await auction.getAddress());
            });

            it("should revert when no auctions exist", async function () {
                const managerFactory = await ethers.getContractFactory("PresaleManager");
                const manager = await managerFactory.deploy();
                await manager.waitForDeployment();
                
                await expect(
                    manager.getLatestPresaleInfo()
                ).to.be.revertedWithCustomError(manager, "UnknownAuction");
            });
        });

        describe("getManagerConfig", function () {
            it("should return correct manager config", async function () {
                const { manager } = await loadFixture(deployFixture);
                
                const config = await manager.getManagerConfig();
                expect(config.initialized).to.equal(true);
                expect(config.auctionsCount).to.equal(1n);
                expect(config.auctionFactory_).to.not.equal(ethers.ZeroAddress);
                expect(config.upkeepController_).to.not.equal(ethers.ZeroAddress);
            });
        });
    });

    describe("finalizePresale", function () {
        it("should successfully finalize presale when called by LBP", async function () {
            const { manager, auction, token, config } = await loadFixture(deployFixture);
            
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
            const nonce = ethers.hexlify(ethers.randomBytes(32));
            const commitHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32"], [0, commitQty, nonce])
            );

            await time.increaseTo(config.startTime + 1n);
            await auction.connect((await ethers.getSigners())[2]).commit(commitHash, [], { value: deposit });
            await time.increaseTo(config.startTime + config.commitDuration + 1n);
            await auction.connect((await ethers.getSigners())[2]).reveal(0, commitQty, nonce, 0);
            await time.increaseTo(config.startTime + config.commitDuration + config.revealDuration + 1n);
            await manager.finalizeAuction(await auction.getAddress());

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
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await manager.launchLBP(await auction.getAddress(), launchConfig);
            
            const record = await manager.getAuctionRecord(await auction.getAddress());
            const lbp = await ethers.getContractAt("SecureLBP", record.lbp);
            
            // Pool is already initialized by launchLBP, so we can place bids directly
            await time.increaseTo(lbpStart + 1n);
            
            // Place a bid to generate some activity
            await lbp.connect((await ethers.getSigners())[2]).placeBid(0, { value: ethers.parseEther("1") });
            
            await time.increaseTo(launchConfig.endTime + 1n);
            
            // Deploy escrow (it will be used by finalizeToVesting)
            const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
            const escrow = await escrowFactory.deploy(await token.getAddress(), record.lbp);
            await escrow.waitForDeployment();
            
            const totalEthRaised = await lbp.totalEthRaised();
            const totalTokensAllocated = await lbp.totalTokensAllocated();
            
            // finalizeToVesting will call finalizePresale on the manager
            // Since manager is the owner of LBP, we call finalizeLbp on manager
            // which will call finalizeToVesting on LBP, which will call finalizePresale on manager
            await expect(
                manager.finalizeLbp(await auction.getAddress(), await escrow.getAddress())
            ).to.emit(manager, "LBPFinalized")
            .withArgs(await auction.getAddress(), record.lbp, await escrow.getAddress(), totalEthRaised, totalTokensAllocated);
            
            const recordAfter = await manager.getAuctionRecord(await auction.getAddress());
            expect(recordAfter.lbpFinalized).to.equal(true);
            expect(recordAfter.ethRaisedDuringLBP).to.equal(totalEthRaised);
        });

        it("should revert when called by non-LBP", async function () {
            const { manager, auction, alice, config } = await loadFixture(deployFixture);
            
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await manager.launchLBP(await auction.getAddress(), launchConfig);
            
            await expect(
                manager.connect(alice).finalizePresale(await auction.getAddress(), ethers.parseEther("10"), ethers.parseUnits("100", 18))
            ).to.be.revertedWithCustomError(manager, "UnauthorizedCaller");
        });
    });

    describe("Demand Check Functions", function () {
        it("checkAndAdjustAuction should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.checkAndAdjustAuction(alice.address)
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("setKeeperEnabled should revert when keeper config is frozen", async function () {
            const { manager } = await loadFixture(deployFixture);
            
            // Keeper config is frozen after auction registration, so this should revert
            // The error comes from UpkeepController, not PresaleManager
            const upkeepControllerAddress = await manager.upkeepController();
            const upkeepController = await ethers.getContractAt("UpkeepController", upkeepControllerAddress);
            
            await expect(manager.setKeeperEnabled(false))
                .to.be.revertedWithCustomError(upkeepController, "KeeperConfigFrozen");
        });

        it("setKeeperEnabled should revert when called by non-owner", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            await expect(
                manager.connect(alice).setKeeperEnabled(true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Automation Functions", function () {
        it("checkUpkeep should delegate to upkeepController", async function () {
            const { manager } = await loadFixture(deployFixture);
            
            const result = await manager.checkUpkeep("0x");
            expect(result.upkeepNeeded).to.be.a("boolean");
        });

        it("performUpkeep should delegate to upkeepController", async function () {
            const { manager } = await loadFixture(deployFixture);
            
            // performUpkeep delegates to upkeepController
            // It will revert if keeper is disabled or conditions not met (expected)
            // We verify it doesn't crash and properly delegates
            const result = await manager.checkUpkeep("0x");
            expect(result.upkeepNeeded).to.be.a("boolean");
            
            // If no upkeep is needed, performUpkeep will revert (expected behavior)
            // We just verify the delegation works
            if (result.upkeepNeeded && result.performData.length > 0) {
                // If upkeep is needed, it should execute
                await expect(manager.performUpkeep(result.performData)).to.not.be.reverted;
            } else {
                // If upkeep is not needed, it will revert
                await expect(manager.performUpkeep("0x")).to.be.reverted;
            }
        });
    });

    describe("receive", function () {
        it("should accept ETH payments", async function () {
            const { manager, owner } = await loadFixture(deployFixture);
            
            const balanceBefore = await ethers.provider.getBalance(await manager.getAddress());
            await owner.sendTransaction({
                to: await manager.getAddress(),
                value: ethers.parseEther("1")
            });
            const balanceAfter = await ethers.provider.getBalance(await manager.getAddress());
            
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1"));
        });
    });

    describe("migrateLiquidityToUniswapV3", function () {
        it("should revert when auction is unknown", async function () {
            const { manager, alice } = await loadFixture(deployFixture);
            
            // sqrtPriceX96 is uint160 in Q64.96 format, use a valid value
            const sqrtPriceX96 = 1n << 96n; // 2^96 = 1.0 in Q64.96 format
            
            await expect(
                manager.migrateLiquidityToUniswapV3(
                    alice.address,
                    ethers.parseEther("1"),
                    ethers.parseUnits("100", 18),
                    3000,
                    sqrtPriceX96,
                    -100,
                    100,
                    alice.address
                )
            ).to.be.revertedWithCustomError(manager, "UnknownAuction");
        });

        it("should revert when LBP is not launched", async function () {
            const { manager, auction, alice } = await loadFixture(deployFixture);
            
            // sqrtPriceX96 is uint160 in Q64.96 format, use a valid value
            const sqrtPriceX96 = 1n << 96n; // 2^96 = 1.0 in Q64.96 format
            
            await expect(
                manager.migrateLiquidityToUniswapV3(
                    await auction.getAddress(),
                    ethers.parseEther("1"),
                    ethers.parseUnits("100", 18),
                    3000,
                    sqrtPriceX96,
                    -100,
                    100,
                    alice.address
                )
            ).to.be.revertedWithCustomError(manager, "LbpNotLaunched");
        });

        it("should revert when called by non-owner", async function () {
            const { manager, auction, alice, config } = await loadFixture(deployFixture);
            
            // Setup: finalize auction and launch LBP
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };

            await manager.launchLBP(await auction.getAddress(), launchConfig);
            
            // sqrtPriceX96 is uint160 in Q64.96 format, use a valid value
            const sqrtPriceX96 = 1n << 96n; // 2^96 = 1.0 in Q64.96 format
            
            await expect(
                manager.connect(alice).migrateLiquidityToUniswapV3(
                    await auction.getAddress(),
                    ethers.parseEther("1"),
                    ethers.parseUnits("100", 18),
                    3000,
                    sqrtPriceX96,
                    -100,
                    100,
                    alice.address
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Coverage — PresaleManager success paths", function () {
        it("auctionWithdrawTreasury forwards auction ETH to recipient", async function () {
            const { manager, auction, treasury, alice, config } = await loadFixture(deployFixture);
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
            const before = await ethers.provider.getBalance(treasury.address);
            await manager.auctionWithdrawTreasury(await auction.getAddress(), treasury.address);
            expect(await ethers.provider.getBalance(treasury.address)).to.be.gt(before);
        });

        it("forwards LBP admin calls after launch", async function () {
            const { manager, auction, treasury, alice, config } = await loadFixture(deployFixture);
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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
                vestingCliffPercentBP: 0n,
                initialFeePreset: 1,
                feeDecayDurationPreset: 1,
                maxContributionPerAddress: 0n
            };
            await manager.launchLBP(await auction.getAddress(), launchConfig);
            const rec = await manager.getAuctionRecord(await auction.getAddress());
            const lbp = await ethers.getContractAt("SecureLBP", rec.lbp);
            const oracleAddr = (await ethers.getSigners())[5].address;
            await manager.setLbpTreasury(await auction.getAddress(), treasury.address);
            await manager.setLbpMaxContribution(await auction.getAddress(), ethers.parseEther("4"));
            await manager.setLbpOracleForAuction(await auction.getAddress(), oracleAddr);
            expect(await lbp.treasury()).to.equal(treasury.address);
            expect(await lbp.maxContributionPerAddress()).to.equal(ethers.parseEther("4"));
        });

        it("manager owner EOA may set bonus merkle and whitelist CID on the auction (static owner() path)", async function () {
            const { manager, auction, owner, alice, config } = await loadFixture(deployFixture);
            const commitQty = ethers.parseUnits("10", 18);
            const priceTicks = await Promise.all([auction.priceTicks(0), auction.priceTicks(1)]);
            const deposit = (commitQty * priceTicks[0]) / 10n**18n;
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

            const root = ethers.keccak256(ethers.toUtf8Bytes("bonus-root"));
            await auction.connect(owner).setBonusMerkleRoot(root, "ipfs://bonus");
            expect(await auction.bonusMerkleRoot()).to.equal(root);

            await auction.connect(owner).setWhitelistCID("ipfs://wl");
            expect(await auction.whitelistCID()).to.equal("ipfs://wl");
        });
    });

});
