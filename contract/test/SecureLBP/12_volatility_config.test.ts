import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

describe("SecureLBP – 12_volatility_config", function () {
    it("should set volatility window", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        const newWindow = 120n;
        await expect(
            lbp.connect(owner).setVolatilityWindow(newWindow)
        ).to.not.be.reverted;
    });

    it("should revert when setting volatility window to zero", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setVolatilityWindow(0)
        ).to.be.revertedWith("Window must be > 0");
    });

    it("should set volatility fee params", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        const thresholdLowBP = 500n; // 5%
        const thresholdHighBP = 1000n; // 10%
        const feeMediumBP = 300n; // 3%
        const feeHighBP = 500n; // 5%
        const maxFeeBP = 1000n; // 10%
        
        await expect(
            lbp.connect(owner).setVolatilityFeeParams(
                thresholdLowBP,
                thresholdHighBP,
                feeMediumBP,
                feeHighBP,
                maxFeeBP
            )
        ).to.not.be.reverted;
    });

    it("should revert when thresholdLow >= thresholdHigh", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setVolatilityFeeParams(
                1000n, // thresholdLow
                500n,  // thresholdHigh (less than low)
                300n,
                500n,
                1000n
            )
        ).to.be.revertedWith("Low threshold must be < high");
    });

    it("should revert when medium fee > max fee", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setVolatilityFeeParams(
                500n,
                1000n,
                1500n, // medium fee > max
                500n,
                1000n
            )
        ).to.be.revertedWith("Medium fee must be <= max");
    });

    it("should revert when high fee > max fee", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setVolatilityFeeParams(
                500n,
                1000n,
                300n,
                1500n, // high fee > max
                1000n
            )
        ).to.be.revertedWith("High fee must be <= max");
    });

    it("should revert when max fee > 100%", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setVolatilityFeeParams(
                500n,
                1000n,
                300n,
                500n,
                10001n // > 10000 BP (100%)
            )
        ).to.be.revertedWith("Max fee must be <= 100%");
    });

    it("should set post pause decay window", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        const decayWindow = 300n;
        const step1Duration = 60n;
        const step2Duration = 120n;
        
        await expect(
            lbp.connect(owner).setPostPauseDecayWindow(
                decayWindow,
                step1Duration,
                step2Duration
            )
        ).to.not.be.reverted;
    });

    it("should revert when decay window is zero", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayWindow(0, 60n, 120n)
        ).to.be.revertedWith("Decay window must be > 0");
    });

    it("should revert when step1 duration is zero", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayWindow(300n, 0, 120n)
        ).to.be.revertedWith("Step 1 duration must be > 0");
    });

    it("should revert when step2 duration is zero", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayWindow(300n, 60n, 0)
        ).to.be.revertedWith("Step 2 duration must be > 0");
    });

    it("should revert when steps don't fit in window", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayWindow(
                100n,  // window
                60n,   // step1
                50n    // step2 (60 + 50 = 110 > 100)
            )
        ).to.be.revertedWith("Steps must fit in window");
    });

    it("should set post pause decay fees", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        const step1Fee = 1000n; // 10%
        const step2Fee = 500n;  // 5%
        const step3Fee = 300n;   // 3%
        
        await expect(
            lbp.connect(owner).setPostPauseDecayFees(step1Fee, step2Fee, step3Fee)
        ).to.not.be.reverted;
    });

    it("should revert when step1 fee > 100%", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayFees(10001n, 500n, 300n)
        ).to.be.revertedWith("Step 1 fee must be <= 100%");
    });

    it("should revert when step2 fee > 100%", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayFees(1000n, 10001n, 300n)
        ).to.be.revertedWith("Step 2 fee must be <= 100%");
    });

    it("should revert when step3 fee > 100%", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayFees(1000n, 500n, 10001n)
        ).to.be.revertedWith("Step 3 fee must be <= 100%");
    });

    it("should revert when fees don't decrease", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(owner).setPostPauseDecayFees(500n, 1000n, 300n) // step2 > step1
        ).to.be.revertedWith("Fees must decrease");
    });

    it("should revert when called by non-owner", async function () {
        const { lbp, user1 } = await loadFixture(deployLbpWithPoolFixture);
        
        await expect(
            lbp.connect(user1).setVolatilityWindow(120n)
        ).to.be.revertedWith("Ownable: caller is not the owner");
        
        await expect(
            lbp.connect(user1).setVolatilityFeeParams(500n, 1000n, 300n, 500n, 1000n)
        ).to.be.revertedWith("Ownable: caller is not the owner");
        
        await expect(
            lbp.connect(user1).setPostPauseDecayWindow(300n, 60n, 120n)
        ).to.be.revertedWith("Ownable: caller is not the owner");
        
        await expect(
            lbp.connect(user1).setPostPauseDecayFees(1000n, 500n, 300n)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });
});

