import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    buildCommitHash,
    fixtureWithOverrides,
    randomNonce
} from "../DutchAuction/utils/dutchAuctionFixtures";

describe("Scenario – soft cap failure and refunds", function () {
    async function failingAuctionFixture() {
        const overrides = {
            softCap: ethers.parseEther("50"),
            tokensForSale: ethers.parseUnits("150", 18),
            perAddressCap: ethers.parseUnits("150", 18),
            bonusReserve: 0n
        };
        return fixtureWithOverrides(overrides)();
    }

    it("handles refunds for revealed, unrevealed, and reverting recipients", async function () {
        const ctx = await loadFixture(failingAuctionFixture);
        const { auction, alice, bob, deployer, priceTicks, startTime, commitEndTime, revealEndTime } = ctx;

        await time.increaseTo(startTime + 1n);

        const qtyAliceWhole = 60n;
        const qtyBobWhole = 40n;
        const qtyRejectorWhole = 20n;
        const qtyAliceWei = qtyAliceWhole * 10n**18n;
        const qtyBobWei = qtyBobWhole * 10n**18n;
        const qtyRejectorWei = qtyRejectorWhole * 10n**18n;
        const nonceAlice = randomNonce();
        const nonceBob = randomNonce();
        const nonceRejector = randomNonce();

        const depositAlice = (qtyAliceWei * priceTicks[0]) / 10n**18n;
        const depositBob = (qtyBobWei * priceTicks[0]) / 10n**18n;
        const depositRejector = (qtyRejectorWei * priceTicks[0]) / 10n**18n;

        await auction.connect(alice).commit(buildCommitHash(0n, qtyAliceWei, nonceAlice), [], { value: depositAlice });
        await auction.connect(bob).commit(buildCommitHash(0n, qtyBobWei, nonceBob), [], { value: depositBob });

        const rejectorFactory = await ethers.getContractFactory("RefundRejector");
        const rejector = await rejectorFactory.deploy(await auction.getAddress());
        await rejector.waitForDeployment();
        await rejector.commitBid(buildCommitHash(0n, qtyRejectorWei, nonceRejector), { value: depositRejector });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qtyAliceWei, nonceAlice, 0);
        // Bob and refund rejector intentionally leave commits unrevealed.

        await time.increaseTo(revealEndTime + 1n);
        await auction.connect(deployer).finalize();
        expect(await auction.successful()).to.equal(false);

        await expect(auction.connect(alice).refundUnsuccessful())
            .to.emit(auction, "RefundIssued")
            .withArgs(await alice.getAddress(), depositAlice);
        expect(await auction.revealedDeposit(await alice.getAddress())).to.equal(0n);

        await expect(auction.connect(bob).refundUnsuccessful())
            .to.emit(auction, "RefundIssued")
            .withArgs(await bob.getAddress(), depositBob);
        const bobCommit = await auction.commits(await bob.getAddress(), 0);
        expect(bobCommit.withdrawn).to.equal(true);
        expect(bobCommit.revealed).to.equal(false);

        await expect(rejector.triggerRefund()).to.be.revertedWithCustomError(auction, "TransferFailed");
        const rejectorCommit = await auction.commits(await rejector.getAddress(), 0);
        expect(rejectorCommit.withdrawn).to.equal(false);
    });
});
