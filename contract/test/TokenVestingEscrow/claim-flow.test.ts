import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithBidsFixture } from "../utils/lbpFixtures";

describe("TokenVestingEscrow claim flow", function () {
    it("allows users to pull tokens after SecureLBP finalisation", async function () {
        const { lbp, owner, user1, user2, token } = await loadFixture(deployLbpWithBidsFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        const allocationUser1 = await lbp.getUserAllocation(user1.address);
        const allocationUser2 = await lbp.getUserAllocation(user2.address);
        expect(allocationUser1).to.be.gt(0n);
        expect(allocationUser2).to.be.gt(0n);

        await expect(escrow.connect(user1).claim()).to.be.revertedWithCustomError(escrow, "NothingClaimable");

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        await expect(escrow.connect(user1).claim())
            .to.emit(escrow, "Claimed")
            .withArgs(user1.address, allocationUser1, allocationUser1);

        expect(await token.balanceOf(user1.address)).to.equal(allocationUser1);
        expect(await escrow.claimed(user1.address)).to.equal(allocationUser1);

        await expect(escrow.connect(user2).claim())
            .to.emit(escrow, "Claimed")
            .withArgs(user2.address, allocationUser2, allocationUser2);

        expect(await token.balanceOf(user2.address)).to.equal(allocationUser2);
        expect(await escrow.claimed(user2.address)).to.equal(allocationUser2);
    });
});
