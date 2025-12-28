import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BPS_DENOMINATOR, buildCommitHash, fixtureWithOverrides, randomNonce } from "./utils/dutchAuctionFixtures";

async function launchReadyFixture() {
    const signers = await ethers.getSigners();
    const stableRecipient = signers[4];
    const tokenRecipient = signers[5];

    const ctx = await fixtureWithOverrides({
        tokensForSale: ethers.parseUnits("200", 18),
        perAddressCap: ethers.parseUnits("200", 18),
        bonusReserve: 0n,
        softCap: ethers.parseEther("0.05"),
        lbpStableShareBps: 1_500n,
        lbpTokenRecipient: await tokenRecipient.getAddress(),
        lbpStableRecipient: await stableRecipient.getAddress()
    })();

    const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;
    await time.increaseTo(startTime + 1n);

    const qtyWhole = 120n;
    const qtyWei = qtyWhole * 10n**18n;
    const nonce = randomNonce();
    // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
    await auction
        .connect(alice)
        .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

    await time.increaseTo(commitEndTime + 1n);
    await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();

    const tokensSold = await auction.tokensSold();
    const unsoldTokens = ctx.config.tokensForSale - tokensSold;
    const totalRaised = await auction.totalRaised();
    const expectedStableShare = (totalRaised * ctx.config.lbpStableShareBps) / BPS_DENOMINATOR;

    return {
        ...ctx,
        tokenRecipient,
        stableRecipient,
        unsoldTokens,
        expectedStableShare
    };
}

async function unfinalizedFixture() {
    const signers = await ethers.getSigners();
    const stableRecipient = signers[4];
    const tokenRecipient = signers[5];

    const ctx = await fixtureWithOverrides({
        tokensForSale: ethers.parseUnits("150", 18),
        perAddressCap: ethers.parseUnits("150", 18),
        bonusReserve: 0n,
        softCap: 0n,
        lbpStableShareBps: 1_000n,
        lbpTokenRecipient: await tokenRecipient.getAddress(),
        lbpStableRecipient: await stableRecipient.getAddress()
    })();

    const { auction, alice, startTime, priceTicks } = ctx;
    await time.increaseTo(startTime + 1n);
    const nonce = randomNonce();
    const qtyWhole = 100n;
    const qtyWei = qtyWhole * 10n**18n;
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
    await auction
        .connect(alice)
        .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

    return { ...ctx, nonce, qty: qtyWei };
}

async function unsuccessfulFixture() {
    const signers = await ethers.getSigners();
    const stableRecipient = signers[4];
    const tokenRecipient = signers[5];

    const ctx = await fixtureWithOverrides({
        softCap: ethers.parseEther("10"),
        tokensForSale: ethers.parseUnits("150", 18),
        perAddressCap: ethers.parseUnits("150", 18),
        bonusReserve: 0n,
        lbpStableShareBps: 1_000n,
        lbpTokenRecipient: await tokenRecipient.getAddress(),
        lbpStableRecipient: await stableRecipient.getAddress()
    })();

    const { auction, startTime, commitEndTime, revealEndTime } = ctx;

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();
    expect(await auction.successful()).to.equal(false);

    return ctx;
}

async function soldOutFixture() {
    const signers = await ethers.getSigners();
    const stableRecipient = signers[4];
    const tokenRecipient = signers[5];

    const ctx = await fixtureWithOverrides({
        tokensForSale: ethers.parseUnits("120", 18),
        perAddressCap: ethers.parseUnits("120", 18),
        softCap: 0n,
        bonusReserve: 0n,
        lbpStableShareBps: 500n,
        lbpTokenRecipient: await tokenRecipient.getAddress(),
        lbpStableRecipient: await stableRecipient.getAddress()
    })();

    const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks, config } = ctx;

    await time.increaseTo(startTime + 1n);
    const nonce = randomNonce();
    // config.tokensForSale is now in wei
    const qtyWei = config.tokensForSale;
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
    await auction
        .connect(alice)
        .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

    await time.increaseTo(commitEndTime + 1n);
    await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();
    expect(await auction.tokensSold()).to.equal(config.tokensForSale);

    return ctx;
}

async function zeroTokenRecipientFixture() {
    const ctx = await fixtureWithOverrides({
        tokensForSale: ethers.parseUnits("100", 18),
        perAddressCap: ethers.parseUnits("100", 18),
        softCap: ethers.parseEther("0.05"),
        bonusReserve: 0n,
        lbpStableShareBps: 1_000n,
        lbpTokenRecipient: ethers.ZeroAddress,
        lbpStableRecipient: ethers.Wallet.createRandom().address
    })();

    const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

    await time.increaseTo(startTime + 1n);
    const nonce = randomNonce();
    const qtyWhole = 60n;
    const qtyWei = qtyWhole * 10n**18n;
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

describe("DutchAuction – 07_launch_lbp", function () {
    describe("success paths", function () {
        it("should launch LBP after successful finalize", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, deployer } = ctx;

            await expect(auction.connect(deployer).launchLbp()).to.not.be.reverted;
            expect(await auction.lbpLaunched()).to.equal(true);
        });

        it("should transfer unsold tokens to lbpTokenRecipient", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, token, deployer, tokenRecipient, unsoldTokens } = ctx;
            const recipientAddress = await tokenRecipient.getAddress();

            const balanceBefore = await token.balanceOf(recipientAddress);
            await auction.connect(deployer).launchLbp();
            const balanceAfter = await token.balanceOf(recipientAddress);

            expect(balanceAfter - balanceBefore).to.equal(unsoldTokens);
        });

        it("should send correct ETH share to lbpStableRecipient", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, deployer, stableRecipient, expectedStableShare } = ctx;
            const stableAddress = await stableRecipient.getAddress();

            const balanceBefore = await ethers.provider.getBalance(stableAddress);
            await auction.connect(deployer).launchLbp();
            const balanceAfter = await ethers.provider.getBalance(stableAddress);

            expect(balanceAfter - balanceBefore).to.equal(expectedStableShare);
        });

        it("should decrease ethForTreasury by stable portion sent to LBP", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, deployer, expectedStableShare } = ctx;

            const treasuryBefore = await auction.ethForTreasury();
            const treasuryAddress = await auction.treasury();
            const treasuryBalanceBefore = await ethers.provider.getBalance(treasuryAddress);
            
            await auction.connect(deployer).launchLbp();
            
            const treasuryAfter = await auction.ethForTreasury();
            const treasuryBalanceAfter = await ethers.provider.getBalance(treasuryAddress);

            // After launchLbp(), ethForTreasury should be 0 (all remaining ETH sent to treasury)
            expect(treasuryAfter).to.equal(0n);
            // Treasury should receive the remaining ETH (treasuryBefore - expectedStableShare)
            expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(treasuryBefore - expectedStableShare);
        });

        it("should emit LBPLaunched event", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, deployer, tokenRecipient, stableRecipient, unsoldTokens, expectedStableShare } = ctx;

            await expect(auction.connect(deployer).launchLbp())
                .to.emit(auction, "LBPLaunched")
                .withArgs(
                    await tokenRecipient.getAddress(),
                    await stableRecipient.getAddress(),
                    unsoldTokens,
                    expectedStableShare
                );
        });
    });

    describe("reverts", function () {
        it("should revert if auction not finalized", async function () {
            const ctx = await loadFixture(unfinalizedFixture);
            await expect(ctx.auction.connect(ctx.deployer).launchLbp()).to.be.revertedWithCustomError(
                ctx.auction,
                "AuctionNotFinalized"
            );
        });

        it("should revert if auction was unsuccessful", async function () {
            const ctx = await loadFixture(unsuccessfulFixture);
            await expect(ctx.auction.connect(ctx.deployer).launchLbp()).to.be.revertedWithCustomError(
                ctx.auction,
                "AuctionNotFinalized"
            );
        });

        it("should revert if LBP was already launched", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, deployer } = ctx;

            await auction.connect(deployer).launchLbp();
            await expect(auction.connect(deployer).launchLbp()).to.be.revertedWithCustomError(
                auction,
                "LBPAlreadyLaunched"
            );
        });

        it("should revert if no unsold tokens remain", async function () {
            const ctx = await loadFixture(soldOutFixture);
            await expect(ctx.auction.connect(ctx.deployer).launchLbp()).to.be.revertedWithCustomError(
                ctx.auction,
                "NoInventoryForLBP"
            );
        });

        it("should revert if lbpTokenRecipient is zero address", async function () {
            const ctx = await loadFixture(zeroTokenRecipientFixture);
            await expect(ctx.auction.connect(ctx.deployer).launchLbp()).to.be.revertedWithCustomError(
                ctx.auction,
                "LbpTokenRecipientZero"
            );
        });

        it("should revert if lbpStableRecipient is zero when ETH needs to be sent", async function () {
            const ctx = await fixtureWithOverrides({
                tokensForSale: ethers.parseUnits("180", 18),
                perAddressCap: ethers.parseUnits("180", 18),
                softCap: ethers.parseEther("0.05"),
                bonusReserve: 0n,
                lbpStableShareBps: 2_000n,
                lbpTokenRecipient: ethers.Wallet.createRandom().address,
                lbpStableRecipient: ethers.ZeroAddress
            })();

            const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qtyWhole = 100n;
            const qtyWei = qtyWhole * 10n**18n;
            const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

            await time.increaseTo(revealEndTime + 1n);
            await auction.connect(ctx.deployer).finalize();

            await expect(auction.connect(ctx.deployer).launchLbp()).to.be.revertedWithCustomError(
                auction,
                "LbpStableRecipientZero"
            );
        });

        it("should revert if stable portion cannot be funded from treasury balance", async function () {
            const ctx = await loadFixture(launchReadyFixture);
            const { auction, deployer } = ctx;
            const auctionAddress = await auction.getAddress();

            await ethers.provider.send("hardhat_setBalance", [auctionAddress, "0x0"]);
            await expect(auction.connect(deployer).launchLbp()).to.be.revertedWithCustomError(auction, "TransferFailed");
        });
    });
});
