import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

const BP_SCALE = 10_000n;

describe("SecureLBP – 10_vesting_claims", function () {
    it("returns zero vested before finalize", async function () {
        const { lbp, user1, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);

        expect(await lbp.vestedAmount(user1.address)).to.equal(0n);
    });

    it("computes vestedAmount across cliff and final phases", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        const vestingStart = endTime + 100n;
        const cliffDuration = 50n;
        const finalDuration = 200n;
        const cliffPercent = 2_000n; // 20%

        await lbp.connect(owner).configureVesting(vestingStart, cliffDuration, finalDuration, cliffPercent);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        const allocation = await lbp.getUserAllocation(user1.address);
        expect(allocation).to.be.gt(0n);

        expect(await lbp.vestedAmount(user1.address)).to.equal(0n);

        await time.increaseTo(vestingStart - 1n);
        expect(await lbp.vestedAmount(user1.address)).to.equal(0n);

        await time.increaseTo(vestingStart + cliffDuration);
        const cliffAmount = (allocation * cliffPercent) / BP_SCALE;
        expect(await lbp.vestedAmount(user1.address)).to.equal(cliffAmount);

        await time.increaseTo(vestingStart + finalDuration + 1n);
        expect(await lbp.vestedAmount(user1.address)).to.equal(allocation);
    });

    it("defaults to full vesting immediately when not configured", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        const allocation = await lbp.getUserAllocation(user1.address);
        expect(await lbp.vestedAmount(user1.address)).to.equal(allocation);
    });

    it("returns zero vested for users without allocations", async function () {
        const { lbp, owner, user1, user2, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        expect(await lbp.getUserAllocation(user2.address)).to.equal(0n);
        expect(await lbp.vestedAmount(user2.address)).to.equal(0n);
    });

    it("scales vesting output with user allocations", async function () {
        const { lbp, owner, user1, user2, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        const vestingStart = endTime + 200n;
        const cliffDuration = 60n;
        const finalDuration = 600n;
        const cliffPercent = 1_500n; // 15%

        await lbp.connect(owner).configureVesting(vestingStart, cliffDuration, finalDuration, cliffPercent);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        await lbp.connect(user2).placeBid(0, { value: ethers.parseEther("3") });

        await time.increaseTo(endTime + 1n);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        const allocation1 = await lbp.getUserAllocation(user1.address);
        const allocation2 = await lbp.getUserAllocation(user2.address);
        expect(allocation1).to.be.gt(0n);
        expect(allocation2).to.be.gt(allocation1);

        await time.increaseTo(vestingStart + cliffDuration);
        const expectedCliff1 = (allocation1 * cliffPercent) / BP_SCALE;
        const expectedCliff2 = (allocation2 * cliffPercent) / BP_SCALE;

        expect(await lbp.vestedAmount(user1.address)).to.equal(expectedCliff1);
        expect(await lbp.vestedAmount(user2.address)).to.equal(expectedCliff2);

        await time.increaseTo(vestingStart + finalDuration + 1n);
        expect(await lbp.vestedAmount(user1.address)).to.equal(allocation1);
        expect(await lbp.vestedAmount(user2.address)).to.equal(allocation2);
    });
});
