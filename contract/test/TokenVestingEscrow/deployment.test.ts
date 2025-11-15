import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployEscrowFixture } from "../utils/escrowFixtures";

describe("TokenVestingEscrow deployment", function () {
    it("stores token and SecureLBP addresses", async function () {
        const { escrow, token, lbp } = await loadFixture(deployEscrowFixture);

        expect(await escrow.token()).to.equal(await token.getAddress());
        expect(await escrow.secureLBP()).to.equal(await lbp.getAddress());
    });

    it("reverts when token does not match SecureLBP token", async function () {
        const { token } = await loadFixture(deployEscrowFixture);

        const OtherToken = await ethers.getContractFactory("TestToken");
        const otherToken = await OtherToken.deploy(ethers.parseEther("100"));
        await otherToken.waitForDeployment();

        const MockLBP = await ethers.getContractFactory("MockSecureLBPForEscrow");
        const lbp = await MockLBP.deploy(await token.getAddress());
        await lbp.waitForDeployment();

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        await expect(
            Escrow.deploy(await otherToken.getAddress(), await lbp.getAddress())
        ).to.be.revertedWithCustomError(Escrow, "TokenMismatch");
    });
});
