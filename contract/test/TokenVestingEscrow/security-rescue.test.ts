import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployEscrowFixture } from "../utils/escrowFixtures";

describe("TokenVestingEscrow security & rescue", function () {
    it("allows only owner to rescue non-sale tokens", async function () {
        const { escrow, owner, other } = await loadFixture(deployEscrowFixture);

        const OtherToken = await ethers.getContractFactory("TestToken");
        const otherToken = await OtherToken.deploy(ethers.parseEther("1000"));
        await otherToken.waitForDeployment();

        await otherToken.transfer(await escrow.getAddress(), ethers.parseEther("100"));

        await expect(
            escrow.connect(other).rescueERC20(await otherToken.getAddress(), other.address, 1)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        const balanceBefore = await otherToken.balanceOf(owner.address);
        await escrow.connect(owner).rescueERC20(
            await otherToken.getAddress(),
            owner.address,
            ethers.parseEther("25")
        );

        expect(await otherToken.balanceOf(owner.address)).to.equal(balanceBefore + ethers.parseEther("25"));
        expect(await otherToken.balanceOf(await escrow.getAddress())).to.equal(ethers.parseEther("75"));
    });

    it("cannot rescue sale token", async function () {
        const { escrow, owner, token } = await loadFixture(deployEscrowFixture);

        await token.transfer(await escrow.getAddress(), ethers.parseEther("10"));

        await expect(
            escrow.connect(owner).rescueERC20(await token.getAddress(), owner.address, 1)
        ).to.be.revertedWithCustomError(escrow, "RescueSaleToken");
    });
});
