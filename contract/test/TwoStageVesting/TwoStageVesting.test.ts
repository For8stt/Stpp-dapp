import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const BP_SCALE = 10_000n;

async function deployVestingFixture() {
    const [owner, registrar, alice, bob, carol] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const totalSupply = ethers.parseEther("1000000");
    const token = await tokenFactory.deploy(totalSupply);
    await token.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? 0);
    const startTime = now + 60n;
    const cliffDuration = 30n * 24n * 60n * 60n; // 30 days
    const finalDuration = 90n * 24n * 60n * 60n; // 90 days
    const cliffPercentBP = 2_000n; // 20%

    const vestingFactory = await ethers.getContractFactory("TwoStageVesting");
    const vesting = await vestingFactory.deploy(
        await token.getAddress(),
        startTime,
        cliffDuration,
        finalDuration,
        cliffPercentBP
    );
    await vesting.waitForDeployment();

    await vesting.connect(owner).setRegistrar(await registrar.getAddress());

    const totalEscrow = ethers.parseEther("10000");
    await token.transfer(await vesting.getAddress(), totalEscrow);

    return {
        owner,
        registrar,
        alice,
        bob,
        carol,
        token,
        vesting,
        startTime,
        cliffDuration,
        finalDuration,
        cliffPercentBP
    };
}

describe("TwoStageVesting", function () {
    it("registers allocations only via authorised registrar", async function () {
        const { registrar, vesting, alice, bob } = await loadFixture(deployVestingFixture);

        const users = [alice.address, bob.address];
        const amounts = [ethers.parseEther("1000"), ethers.parseEther("2000")];

        await expect(vesting.connect(registrar).registerAllocations(users, amounts))
            .to.emit(vesting, "AllocationRegistered")
            .withArgs(alice.address, amounts[0])
            .to.emit(vesting, "AllocationRegistered")
            .withArgs(bob.address, amounts[1]);

        expect(await vesting.totalAllocation(alice.address)).to.equal(amounts[0]);
        expect(await vesting.totalAllocation(bob.address)).to.equal(amounts[1]);
    });

    it("reverts registerAllocations from non-registrar", async function () {
        const { vesting, alice, registrar } = await loadFixture(deployVestingFixture);

        await expect(
            vesting.registerAllocations([alice.address], [ethers.parseEther("1")])
        ).to.be.revertedWith("unauthorised");

        // registrar must still behave correctly after revert
        await vesting.connect(registrar).registerAllocations([alice.address], [ethers.parseEther("1")]);
        expect(await vesting.totalAllocation(alice.address)).to.equal(ethers.parseEther("1"));
    });

    it("enforces cliff → partial → final vesting schedule", async function () {
        const { registrar, vesting, token, alice, startTime, cliffDuration, finalDuration, cliffPercentBP } =
            await loadFixture(deployVestingFixture);

        const allocation = ethers.parseEther("100");
        await vesting.connect(registrar).registerAllocations([alice.address], [allocation]);

        // Before start time: nothing claimable
        await time.increaseTo(startTime - 10n);
        await expect(vesting.connect(alice).claim()).to.be.revertedWith("nothing claimable");

        // Between start and cliff: still nothing
        await time.increaseTo(startTime + 10n);
        await expect(vesting.connect(alice).claim()).to.be.revertedWith("nothing claimable");

        // Move to cliff timestamp
        await time.increaseTo(startTime + cliffDuration);
        const cliffAmount = (allocation * cliffPercentBP) / BP_SCALE;
        await expect(vesting.connect(alice).claim())
            .to.emit(vesting, "Claimed")
            .withArgs(alice.address, cliffAmount, cliffAmount);

        expect(await token.balanceOf(alice.address)).to.equal(cliffAmount);
        expect(await vesting.claimed(alice.address)).to.equal(cliffAmount);

        // Between cliff and final: no additional payout until final
        await time.increaseTo(startTime + cliffDuration + (finalDuration - cliffDuration) / 2n);
        await expect(vesting.connect(alice).claim()).to.be.revertedWith("nothing claimable");

        // After final duration: full amount released
        await time.increaseTo(startTime + finalDuration + 1n);
        await expect(vesting.connect(alice).claim())
            .to.emit(vesting, "Claimed")
            .withArgs(alice.address, allocation - cliffAmount, allocation);

        expect(await token.balanceOf(alice.address)).to.equal(allocation);
        expect(await vesting.claimed(alice.address)).to.equal(allocation);
    });

    it("handles multiple beneficiaries and prevents double-claim", async function () {
        const { registrar, vesting, token, alice, bob, startTime, cliffDuration, finalDuration, cliffPercentBP } =
            await loadFixture(deployVestingFixture);

        const allocationAlice = ethers.parseEther("500");
        const allocationBob = ethers.parseEther("300");
        await vesting
            .connect(registrar)
            .registerAllocations([alice.address, bob.address], [allocationAlice, allocationBob]);

        await time.increaseTo(startTime + cliffDuration);

        const aliceCliff = (allocationAlice * cliffPercentBP) / BP_SCALE;
        await vesting.connect(alice).claim();
        await expect(vesting.connect(alice).claim()).to.be.revertedWith("nothing claimable");

        expect(await token.balanceOf(alice.address)).to.equal(aliceCliff);

        await time.increaseTo(startTime + finalDuration + 1n);

        await vesting.connect(alice).claim();
        await vesting.connect(bob).claim();

        expect(await token.balanceOf(alice.address)).to.equal(allocationAlice);
        expect(await token.balanceOf(bob.address)).to.equal(allocationBob);
        expect(await vesting.claimed(alice.address)).to.equal(allocationAlice);
        expect(await vesting.claimed(bob.address)).to.equal(allocationBob);
    });
});
