import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

describe("SecureLBP – 04_fee_oracle", function () {
    it("should use oracle fee when oracle returns valid fee", async function () {
        const { lbp } = await loadFixture(deployLbpWithPoolFixture);

        const oracleAddr = await lbp.oracle();
        const oracle = await ethers.getContractAt("LBPOracle", oracleAddr);

        await oracle.setFeeBP(350, 350);
        await oracle.computeAdaptiveFee();
        expect(await lbp.currentFeeBP()).to.equal(350n);
    });

    it("should clamp oracle fee to max 10000 BP if too high", async function () {
        const { lbp } = await loadFixture(deployLbpWithPoolFixture);
        const oracle = await ethers.getContractAt("LBPOracle", await lbp.oracle());

        await oracle.setFeeBP(15000, 15000);
        await oracle.computeAdaptiveFee();
        expect(await lbp.currentFeeBP()).to.equal(10000n);
    });

    it("should fallback to linear fee decay when oracle is unset", async function () {
        const { lbp, owner, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        const initialFee = await lbp.initialFeeBP();
        const finalFee = await lbp.finalFeeBP();
        const duration = endTime - startTime;

        await time.increaseTo(startTime - 1n);
        expect(await lbp.currentFeeBP()).to.equal(initialFee);

        const midTimestamp = startTime + duration / 2n;
        await time.increaseTo(midTimestamp);
        const expectedMidFee = initialFee - ((initialFee - finalFee) * (midTimestamp - startTime)) / duration;
        expect(await lbp.currentFeeBP()).to.equal(expectedMidFee);

        await time.increaseTo(endTime + 1n);
        expect(await lbp.currentFeeBP()).to.equal(finalFee);
    });

    it("should calculate fee based on elapsed time between startTime and endTime", async function () {
        const { lbp, owner, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);
        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        const initialFee = await lbp.initialFeeBP();
        const finalFee = await lbp.finalFeeBP();
        const duration = endTime - startTime;

        const checkpoints = [startTime + duration / 4n, startTime + duration / 2n, startTime + (duration * 3n) / 4n];
        for (const checkpoint of checkpoints) {
            await time.increaseTo(checkpoint);
            const expected = initialFee - ((initialFee - finalFee) * (checkpoint - startTime)) / duration;
            expect(await lbp.currentFeeBP()).to.equal(expected);
        }
    });

    it("should return finalFeeBP after endTime", async function () {
        const { lbp, owner, endTime } = await loadFixture(deployLbpWithPoolFixture);
        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        await time.increaseTo(endTime + 10n);
        expect(await lbp.currentFeeBP()).to.equal(await lbp.finalFeeBP());
    });

    it("should handle oracle revert gracefully (fallback to internal logic)", async function () {
        const { lbp, owner, startTime } = await loadFixture(deployLbpWithPoolFixture);

        const RevertingOracle = await ethers.getContractFactory("RevertingOracle");
        const revertingOracle = await RevertingOracle.deploy();
        await revertingOracle.waitForDeployment();

        await lbp.connect(owner).setOracle(await revertingOracle.getAddress());

        await time.increaseTo(startTime + 1n);
        const initialFee = await lbp.initialFeeBP();
        const finalFee = await lbp.finalFeeBP();
        const duration = (await lbp.endTime()) - startTime;
        const elapsed = 1n;
        const expected = initialFee - ((initialFee - finalFee) * elapsed) / duration;
        expect(await lbp.currentFeeBP()).to.equal(expected);
    });

    describe("legacy fee behaviours", function () {
        it("uses fallback linear schedule when oracle unset", async function () {
            const { lbp, owner, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

            await lbp.connect(owner).setOracle(ethers.ZeroAddress);

            await time.increaseTo(startTime - 10n);
            expect(await lbp.currentFeeBP()).to.equal(await lbp.initialFeeBP());

            await time.increaseTo((startTime + endTime) / 2n);
            const midFee = await lbp.currentFeeBP();
            expect(midFee).to.be.lt(await lbp.initialFeeBP());
            expect(midFee).to.be.gt(await lbp.finalFeeBP());

            await time.increaseTo(endTime + 1n);
            expect(await lbp.currentFeeBP()).to.equal(await lbp.finalFeeBP());
        });

        it("pulls fee from oracle when available", async function () {
            const { lbp } = await loadFixture(deployLbpWithPoolFixture);

            const oracleAddr = await lbp.oracle();
            const oracle = await ethers.getContractAt("LBPOracle", oracleAddr);

            await oracle.setFeeBP(300, 800);
            await oracle.computeAdaptiveFee();
            expect(await lbp.currentFeeBP()).to.equal(300n);

            await oracle.setFeeBP(700, 900);
            await oracle.computeAdaptiveFee();
            expect(await lbp.currentFeeBP()).to.equal(700n);
        });
    });
});
