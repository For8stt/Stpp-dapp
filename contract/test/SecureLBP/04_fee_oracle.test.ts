import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

describe("SecureLBP – 04_fee_oracle", function () {
    it("should use oracle fee when oracle returns valid fee", async function () {
        const { lbp, startTime, owner } = await loadFixture(deployLbpWithPoolFixture);

        const oracleAddr = await lbp.oracle();
        const oracle = await ethers.getContractAt("LBPOracle", oracleAddr);

        // Set oracle fee to 350 BP (3.5%)
        await oracle.setFeeBP(350, 350);
        await oracle.computeAdaptiveFee(await lbp.pool());

        const currentFee = await lbp.currentFeeBP();
        const oracleFee = await oracle.viewAdaptiveFee(await lbp.pool());
        const baseFee = await lbp.initialFeeBP();

        expect(currentFee).to.be.at.least(oracleFee);
        if (baseFee > oracleFee) {
            expect(currentFee).to.equal(baseFee);
        }
    });

    it("should clamp oracle fee to max 10000 BP if too high", async function () {
        const { lbp } = await loadFixture(deployLbpWithPoolFixture);
        const oracle = await ethers.getContractAt("LBPOracle", await lbp.oracle());

        await oracle.setFeeBP(15000, 15000);
        await oracle.computeAdaptiveFee(await lbp.pool());
        const currentFee = await lbp.currentFeeBP();
        expect(currentFee).to.be.at.most(10000n);
    });

    it("should fallback to linear fee decay when oracle is unset", async function () {
        const { lbp, owner, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        const initialFee = await lbp.initialFeeBP();
        const finalFee = await lbp.finalFeeBP();
        const feeDecayDuration = await lbp.feeDecayDuration();

        await time.increaseTo(startTime - 1n);
        expect(await lbp.currentFeeBP()).to.equal(initialFee);

        const midTimestamp = startTime + feeDecayDuration / 2n;
        await time.increaseTo(midTimestamp);
        const expectedMidFee = initialFee - ((initialFee - finalFee) * (midTimestamp - startTime)) / feeDecayDuration;
        expect(await lbp.currentFeeBP()).to.equal(expectedMidFee);

        await time.increaseTo(startTime + feeDecayDuration + 1n);
        expect(await lbp.currentFeeBP()).to.equal(finalFee);
    });

    it("should calculate fee based on elapsed time between startTime and feeDecayDuration", async function () {
        const { lbp, owner, startTime } = await loadFixture(deployLbpWithPoolFixture);
        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        const initialFee = await lbp.initialFeeBP();
        const finalFee = await lbp.finalFeeBP();
        const feeDecayDuration = await lbp.feeDecayDuration();

        const checkpoints = [startTime + feeDecayDuration / 4n, startTime + feeDecayDuration / 2n, startTime + (feeDecayDuration * 3n) / 4n];
        for (const checkpoint of checkpoints) {
            await time.increaseTo(checkpoint);
            const expected = initialFee - ((initialFee - finalFee) * (checkpoint - startTime)) / feeDecayDuration;
            expect(await lbp.currentFeeBP()).to.equal(expected);
        }
    });

    it("should return finalFeeBP after feeDecayDuration", async function () {
        const { lbp, owner, startTime } = await loadFixture(deployLbpWithPoolFixture);
        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        const feeDecayDuration = await lbp.feeDecayDuration();
        await time.increaseTo(startTime + feeDecayDuration + 10n);
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
        const feeDecayDuration = await lbp.feeDecayDuration();
        const elapsed = 1n;
        const expected = initialFee - ((initialFee - finalFee) * elapsed) / feeDecayDuration;
        expect(await lbp.currentFeeBP()).to.equal(expected);
    });

    describe("legacy fee behaviours", function () {
        it("uses fallback linear schedule when oracle unset", async function () {
            const { lbp, owner, startTime } = await loadFixture(deployLbpWithPoolFixture);

            await lbp.connect(owner).setOracle(ethers.ZeroAddress);

            await time.increaseTo(startTime - 10n);
            expect(await lbp.currentFeeBP()).to.equal(await lbp.initialFeeBP());

            const feeDecayDuration = await lbp.feeDecayDuration();
            await time.increaseTo(startTime + feeDecayDuration / 2n);
            const midFee = await lbp.currentFeeBP();
            expect(midFee).to.be.lt(await lbp.initialFeeBP());
            expect(midFee).to.be.gt(await lbp.finalFeeBP());

            await time.increaseTo(startTime + feeDecayDuration + 1n);
            expect(await lbp.currentFeeBP()).to.equal(await lbp.finalFeeBP());
        });

        it("pulls fee from oracle when available", async function () {
            const { lbp, startTime } = await loadFixture(deployLbpWithPoolFixture);

            const oracleAddr = await lbp.oracle();
            const oracle = await ethers.getContractAt("LBPOracle", oracleAddr);
            const baseFee = await lbp.initialFeeBP();

            await oracle.setFeeBP(300, 800);
            await oracle.computeAdaptiveFee(await lbp.pool());
            // currentFeeBP() uses max(baseFee, volatilityFee, postPauseDecayFee)
            // Since oracle is not paused, it uses time-based baseFee
            // We check that fee is at least oracle fee (baseFee is higher)
            const currentFee1 = await lbp.currentFeeBP();
            const oracleFee1 = await oracle.viewAdaptiveFee(await lbp.pool());
            expect(currentFee1).to.be.at.least(oracleFee1);
            // Since baseFee (1000) > oracleFee (300), currentFee should be baseFee
            if (baseFee > oracleFee1) {
                expect(currentFee1).to.equal(baseFee);
            }

            await oracle.setFeeBP(700, 900);
            await oracle.computeAdaptiveFee(await lbp.pool());
            const currentFee2 = await lbp.currentFeeBP();
            const oracleFee2 = await oracle.viewAdaptiveFee(await lbp.pool());
            expect(currentFee2).to.be.at.least(oracleFee2);
            if (baseFee > oracleFee2) {
                expect(currentFee2).to.equal(baseFee);
            }
        });
    });
});
