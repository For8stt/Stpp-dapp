import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployEscrowFixture } from "../utils/escrowFixtures";

describe("TokenVestingEscrow edge cases", function () {
    it("reverts claim when nothing vested", async function () {
        const { escrow, lbp, token, user } = await loadFixture(deployEscrowFixture);

        const allocation = ethers.parseEther("100");
        await lbp.setAllocation(user.address, allocation);
        await lbp.setVested(user.address, 0n);

        await token.transfer(await escrow.getAddress(), allocation);

        await expect(escrow.connect(user).claim()).to.be.revertedWithCustomError(escrow, "NothingClaimable");
    });

    it("claimable returns zero after full claim", async function () {
        const { escrow, lbp, token, user } = await loadFixture(deployEscrowFixture);

        const allocation = ethers.parseEther("250");
        await lbp.setAllocation(user.address, allocation);
        await lbp.setVested(user.address, allocation);

        await token.transfer(await escrow.getAddress(), allocation);
        await escrow.connect(user).claim();

        expect(await escrow.claimable(user.address)).to.equal(0n);
        await expect(escrow.connect(user).claim()).to.be.revertedWithCustomError(escrow, "NothingClaimable");
    });

    it("guards against reentrancy attacks", async function () {
        const [owner, user] = await ethers.getSigners();

        const Reentrant = await ethers.getContractFactory("ReentrantToken");
        const token = await Reentrant.deploy(ethers.parseEther("1000"));
        await token.waitForDeployment();

        const MockLBP = await ethers.getContractFactory("MockSecureLBPForEscrow");
        const lbp = await MockLBP.deploy(await token.getAddress());
        await lbp.waitForDeployment();

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await token.setEscrow(await escrow.getAddress());

        const allocation = ethers.parseEther("100");
        await lbp.setAllocation(user.address, allocation);
        await lbp.setVested(user.address, allocation);

        await token.connect(owner).transfer(await escrow.getAddress(), allocation);

        await expect(
            escrow.connect(user).claim()
        ).to.be.revertedWith("ReentrancyGuard: reentrant call");

        expect(await token.balanceOf(user.address)).to.equal(0n);
    });
});
