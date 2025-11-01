import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

describe("SecureLBP allocations", function () {
    it("tracks allocations when users place bids", async function () {
        const { lbp, token, user1, user2, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const bid1 = ethers.parseEther("1");
        const bid2 = ethers.parseEther("2");

        await lbp.connect(user1).placeBid(0, { value: bid1 });
        await lbp.connect(user2).placeBid(0, { value: bid2 });

        const allocation1 = await lbp.allocations(user1.address);
        const allocation2 = await lbp.allocations(user2.address);

        expect(allocation1).to.be.gt(0n);
        expect(allocation2).to.be.gt(allocation1);

        const totalAllocated = await lbp.totalTokensAllocated();
        expect(totalAllocated).to.equal(allocation1 + allocation2);

        expect(await token.balanceOf(user1.address)).to.equal(0n);
        expect(await token.balanceOf(user2.address)).to.equal(0n);
    });

    it("getUserAllocation mirrors allocations mapping", async function () {
        const { lbp, user1, user2, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const bid = ethers.parseEther("1");
        await lbp.connect(user1).placeBid(0, { value: bid });
        await lbp.connect(user2).placeBid(0, { value: bid });

        expect(await lbp.getUserAllocation(user1.address)).to.equal(await lbp.allocations(user1.address));
        expect(await lbp.getUserAllocation(user2.address)).to.equal(await lbp.allocations(user2.address));
    });
});
