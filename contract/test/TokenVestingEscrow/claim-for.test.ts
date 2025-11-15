import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployEscrowFixture } from "../utils/escrowFixtures";

describe("TokenVestingEscrow claimFor", function () {
    it("allows a third party to claim on behalf of a beneficiary", async function () {
        const { escrow, lbp, token, user, other } = await loadFixture(deployEscrowFixture);

        const allocation = ethers.parseEther("500");
        await lbp.setAllocation(user.address, allocation);
        await lbp.setVested(user.address, allocation);

        await token.transfer(await escrow.getAddress(), allocation);

        await expect(escrow.connect(other).claimFor(user.address))
            .to.emit(escrow, "Claimed")
            .withArgs(user.address, allocation, allocation);

        expect(await token.balanceOf(user.address)).to.equal(allocation);
        expect(await escrow.claimed(user.address)).to.equal(allocation);
        await expect(escrow.connect(other).claimFor(user.address)).to.be.revertedWithCustomError(
            escrow,
            "NothingClaimable"
        );
    });

    it("reverts when user is zero address", async function () {
        const { escrow, other } = await loadFixture(deployEscrowFixture);

        await expect(escrow.connect(other).claimFor(ethers.ZeroAddress)).to.be.revertedWithCustomError(
            escrow,
            "UserZero"
        );
    });
});
