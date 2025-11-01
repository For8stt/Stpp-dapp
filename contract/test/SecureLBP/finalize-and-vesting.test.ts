import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    deployLbpWithPoolFixture,
    deployLbpWithBidsFixture,
    deployLbpWithoutPoolFixture
} from "../utils/lbpFixtures";

describe("SecureLBP finalizeToVesting", function () {
    it("reverts when LBP not ended", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithPoolFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("not ended");
    });

    it("reverts when pool not initialised", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(deployLbpWithoutPoolFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await time.increaseTo(endTime + 1n);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("pool not init");
    });

    it("reverts when vestingEscrow is zero address", async function () {
        const { lbp, owner, startTime, endTime, token } = await loadFixture(deployLbpWithPoolFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await time.increaseTo(startTime + 1n);
        await time.increaseTo(endTime + 1n);

        await expect(
            lbp.connect(owner).finalizeToVesting(ethers.ZeroAddress)
        ).to.be.revertedWith("escrow zero");
    });

    it("transfers totalTokensAllocated to escrow, stores address and emits events", async function () {
        const { lbp, owner, token, presaleManager, auction } = await loadFixture(deployLbpWithBidsFixture);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        const tokensAllocated = await lbp.totalTokensAllocated();
        const ethRaised = await lbp.totalEthRaised();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        )
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), tokensAllocated)
            .and.to.emit(lbp, "PoolFinalized")
            .withArgs(tokensAllocated, ethRaised)
            .and.to.emit(presaleManager, "FinalizeCalled")
            .withArgs(auction, ethRaised, tokensAllocated);

        expect(await token.balanceOf(await escrow.getAddress())).to.equal(tokensAllocated);
        expect(await token.balanceOf(await lbp.getAddress())).to.equal(0n);
        expect(await lbp.vestingEscrow()).to.equal(await escrow.getAddress());
    });

    it("calls presaleManager finalize even with multiple allocations", async function () {
        const { lbp, owner, token, presaleManager, auction, user1, user2, startTime, endTime } =
            await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") });
        await lbp.connect(user2).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        const tokensAllocated = await lbp.totalTokensAllocated();
        const ethRaised = await lbp.totalEthRaised();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        )
            .to.emit(presaleManager, "FinalizeCalled")
            .withArgs(auction, ethRaised, tokensAllocated);
    });

});
