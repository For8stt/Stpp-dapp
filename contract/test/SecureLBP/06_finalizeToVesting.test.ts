import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    deployLbpWithPoolFixture,
    deployLbpWithoutPoolFixture,
    deployLbpWithBidsFixture
} from "../utils/lbpFixtures";

async function deployEscrow(tokenAddress: string, lbpAddress: string) {
    const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await Escrow.deploy(tokenAddress, lbpAddress);
    await escrow.waitForDeployment();
    return escrow;
}

describe("SecureLBP – 06_finalizeToVesting", function () {
    it("should allow owner to finalize only after endTime", async function () {
        const { lbp, owner, user1, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await expect(
            lbp.connect(user1).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.not.be.reverted;
    });

    it("should transfer totalTokensAllocated to vestingEscrow", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const totalTokensAllocated = await lbp.totalTokensAllocated();

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        expect(await token.balanceOf(await escrow.getAddress())).to.equal(totalTokensAllocated);
    });

    it("should set finalized = true and store vestingEscrow address", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        expect(await lbp.finalized()).to.equal(true);
        expect(await lbp.vestingEscrow()).to.equal(await escrow.getAddress());
    });

    it("should emit FinalizedToVesting and PoolFinalized events", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const totalTokens = await lbp.totalTokensAllocated();
        const totalEth = await lbp.totalEthRaised();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        )
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), totalTokens)
            .and.to.emit(lbp, "PoolFinalized")
            .withArgs(totalTokens, totalEth);
    });

    it("should call presaleManager.finalizePresale(...) if presaleManager and auction are set", async function () {
        const { lbp, owner, token, presaleManager, auction } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const totalTokens = await lbp.totalTokensAllocated();
        const totalEth = await lbp.totalEthRaised();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        )
            .to.emit(presaleManager, "FinalizeCalled")
            .withArgs(auction, totalEth, totalTokens);
    });

    it("should revert if pool not initialized", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(deployLbpWithoutPoolFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await time.increaseTo(endTime + 1n);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "PoolNotInitialized");
    });

    it("should revert if called before endTime", async function () {
        const { lbp, owner, token, startTime } = await loadFixture(deployLbpWithPoolFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await time.increaseTo(startTime - 1n);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "NotEnded");
    });

    it("should revert if vestingEscrow is zero address", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithBidsFixture);

        await expect(
            lbp.connect(owner).finalizeToVesting(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(lbp, "EscrowZero");
    });

    it("should revert if available token balance < totalTokensAllocated", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const lbpAddress = await lbp.getAddress();
        const balance = await token.balanceOf(lbpAddress);

        await ethers.provider.send("hardhat_impersonateAccount", [lbpAddress]);
        const lbpSigner = await ethers.provider.getSigner(lbpAddress);
        await owner.sendTransaction({ to: lbpAddress, value: ethers.parseEther("1") });
        await token.connect(lbpSigner).transfer(owner.address, balance);
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [lbpAddress]);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "InsufficientTokens");
    });

    it("should revert if finalize is called twice", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "AlreadyFinalized");
    });
});
