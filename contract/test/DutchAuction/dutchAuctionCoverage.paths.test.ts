import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployAuctionFixture, commitBid } from "./utils/dutchAuctionFixtures";

describe("DutchAuction – coverage paths (<90% line targets)", function () {
    it("transferManager updates presale manager", async function () {
        const [deployer, newManager] = await ethers.getSigners();
        const { auction } = await loadFixture(deployAuctionFixture);
        await auction.connect(deployer).transferManager(newManager.address);
        expect(await auction.presaleManager()).to.equal(newManager.address);
    });

    it("view counters reflect commits and reveals", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice } = ctx;
        await time.increaseTo(ctx.config.startTime + 1n);
        const bid = await commitBid(ctx, { signer: alice, priceTickIndex: 0n, qty: ethers.parseUnits("10", 18) });
        expect(await auction.commitsCount(alice.address)).to.equal(1n);
        expect(await auction.revealedBidsCount(alice.address)).to.equal(0n);
        await time.increaseTo(ctx.config.startTime + ctx.config.commitDuration + 1n);
        await auction.connect(alice).reveal(0n, bid.qty, bid.nonce, 0n);
        expect(await auction.revealedBidsCount(alice.address)).to.equal(1n);
    });

    it("earlyParticipantsCount is readable", async function () {
        const { auction } = await loadFixture(deployAuctionFixture);
        expect(await auction.earlyParticipantsCount()).to.equal(0n);
    });
});
