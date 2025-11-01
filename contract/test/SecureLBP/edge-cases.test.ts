import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithBidsFixture } from "../utils/lbpFixtures";

describe("SecureLBP finalize edge cases", function () {
    it("cannot be called twice", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("already finalized");
    });

    it("reverts when contract token balance is zero", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        const lbpAddress = await lbp.getAddress();
        const balance = await token.balanceOf(lbpAddress);
        expect(balance).to.be.gt(0n);

        await ethers.provider.send("hardhat_impersonateAccount", [lbpAddress]);
        const lbpSigner = await ethers.getSigner(lbpAddress);
        await token.connect(lbpSigner).transfer(owner.address, balance);
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [lbpAddress]);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("insufficient tokens");
    });

    it("reverts when token balance is below totalTokensAllocated", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        const lbpAddress = await lbp.getAddress();
        const balance = await token.balanceOf(lbpAddress);
        expect(balance).to.be.gt(1n);

        await ethers.provider.send("hardhat_impersonateAccount", [lbpAddress]);
        const lbpSigner = await ethers.getSigner(lbpAddress);
        await token.connect(lbpSigner).transfer(owner.address, balance - 1n);
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [lbpAddress]);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("insufficient tokens");
    });
});
