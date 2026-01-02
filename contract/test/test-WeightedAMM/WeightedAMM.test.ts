/**
 * Unit Tests for LBP Weighted AMM
 *
 * This test file contains basic unit tests for the core functionality of the Liquidity Bootstrap Pool (LBP) Weighted Automated Market Maker (AMM).
 * It verifies liquidity addition/removal, swaps in both directions, multi-user LP proportions, and dynamic weight updates over time.
 *
 * Structure:
 * - "should allow adding and removing liquidity correctly": Tests LP mint/burn, reserve resets to 0.
 * - "should swap token -> ETH and ETH -> token correctly": Tests swaps with reserve changes, non-zero reserves post-swap.
 * - "should handle LP proportions correctly with multiple users": Tests proportional LP for alice/bob, half removal.
 * - "should update weights dynamically over time": Tests initial/halfway/end weights with evm_increaseTime, sum=SCALE.
 *
 * Uses signers (owner, alice, bob) for multi-user Scenarios, closeTo for weight rounding.
 *
 * Run: npx hardhat test test/test-WeightedAMM/WeightedAMM.test.ts
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import type { LBPWeightedAMM, TestToken } from "../../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

//npx hardhat test test/WeightedAMM.test.ts
describe("WeightedAMM", function () {
    let token: TestToken;
    let amm: LBPWeightedAMM;
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    const initialTokenSupply = ethers.parseEther("1000000");
    const SCALE = ethers.parseEther("1");

    beforeEach(async function () {
        [owner, alice, bob] = await ethers.getSigners();

        const TokenFactory = await ethers.getContractFactory("TestToken");
        token = (await TokenFactory.deploy(initialTokenSupply)) as TestToken;
        await token.waitForDeployment();

        const aliceAmount = ethers.parseEther("100000");
        const bobAmount = ethers.parseEther("100000");
        await token.transfer(alice.address, aliceAmount);
        await token.transfer(bob.address, bobAmount);

        const AMMFactory = await ethers.getContractFactory("LBPWeightedAMM");
        const block = await ethers.provider.getBlock("latest");
        amm = (await AMMFactory.deploy(
            await token.getAddress(),
            ethers.parseEther("0.7"),
            ethers.parseEther("0.3"),
            block!.timestamp,
            block!.timestamp + 3600,
            ethers.parseEther("0.003")
        )) as LBPWeightedAMM;
        await amm.waitForDeployment();

        await token.connect(alice).approve(await amm.getAddress(), aliceAmount);
        await token.connect(bob).approve(await amm.getAddress(), bobAmount);
    });

    it("should allow adding and removing liquidity correctly", async function () {
        await amm.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });
        const aliceLP = await amm.balanceLP(alice.address);
        expect(aliceLP).to.be.gt(0n);

        await amm.connect(alice).removeLiquidity(aliceLP);
        expect(await amm.balanceLP(alice.address)).to.equal(0n);
        expect(await amm.reserveToken()).to.equal(0n);
        expect(await amm.reserveETH()).to.equal(0n);
    });

    it("should swap token -> ETH and ETH -> token correctly", async function () {
        await amm.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });

        // token -> ETH
        const tokenIn = ethers.parseEther("100");
        const tx1 = await amm.connect(bob).swapTokenForETH(tokenIn, 0n);
        await tx1.wait();
        expect(await amm.reserveToken()).to.equal(ethers.parseEther("1100"));
        expect(await amm.reserveETH()).to.be.lt(ethers.parseEther("10"));

        await amm.connect(bob).swapTokenForETH(tokenIn, 0n);

        // ETH -> token
        const ethIn = ethers.parseEther("1");
        const tx2 = await amm.connect(bob).swapETHForToken(0n, { value: ethIn });
        await tx2.wait();
        expect(await amm.reserveETH()).to.be.gt(0n);
        expect(await amm.reserveToken()).to.be.lt(ethers.parseEther("1200"));

        await amm.connect(bob).swapETHForToken(0n, { value: ethIn });

        expect(await amm.reserveToken()).to.be.gt(0n);
        expect(await amm.reserveETH()).to.be.gt(0n);
    });

    it("should handle LP proportions correctly with multiple users", async function () {
        await amm.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });
        await amm.connect(bob).addLiquidity(ethers.parseEther("500"), { value: ethers.parseEther("5") });

        const totalLP = await amm.totalSupplyLP();
        expect(totalLP).to.be.gt(0n);

        const bobLP = await amm.balanceLP(bob.address);
        const halfBob = bobLP / 2n;
        await amm.connect(bob).removeLiquidity(halfBob);
        const newBobLP = await amm.balanceLP(bob.address);
        expect(newBobLP).to.equal(halfBob);
    });

    it("should update weights dynamically over time", async function () {
        // Check initial weights right after deploy (before any tx that mines blocks)
        let [wToken, wETH] = await amm.currentWeights();
        expect(wToken).to.be.closeTo(ethers.parseEther("0.7"), ethers.parseEther("0.001"));
        expect(wETH).to.be.closeTo(ethers.parseEther("0.3"), ethers.parseEther("0.001"));
        expect(wToken + wETH).to.equal(SCALE);

        await amm.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });

        // fast forward 30 minutes (halfway: 0.7 → 0.5, approx due to small initial elapsed)
        await ethers.provider.send("evm_increaseTime", [1800]);
        await ethers.provider.send("evm_mine", []);

        [wToken, wETH] = await amm.currentWeights();
        expect(wToken).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.001"));
        expect(wETH).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.001"));
        expect(wToken + wETH).to.equal(SCALE);
    });

    it("should handle increasing weights (startWeightToken < endWeightToken)", async function () {
        // Test the branch in currentWeights when weights increase
        const AMMFactory = await ethers.getContractFactory("LBPWeightedAMM");
        const block = await ethers.provider.getBlock("latest");
        const increasingAmm = await AMMFactory.deploy(
            await token.getAddress(),
            ethers.parseEther("0.3"), // start
            ethers.parseEther("0.7"), // end (increasing)
            block!.timestamp,
            block!.timestamp + 3600,
            ethers.parseEther("0.003")
        );
        await increasingAmm.waitForDeployment();

        let [wToken, wETH] = await increasingAmm.currentWeights();
        expect(wToken).to.be.closeTo(ethers.parseEther("0.3"), ethers.parseEther("0.001"));

        // Fast forward halfway
        await ethers.provider.send("evm_increaseTime", [1800]);
        await ethers.provider.send("evm_mine", []);

        [wToken, wETH] = await increasingAmm.currentWeights();
        expect(wToken).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.001"));
        expect(wToken + wETH).to.equal(SCALE);
    });

    it("should use liqFromEth when liqFromEth < liqFromToken", async function () {
        // Test the branch in addLiquidity: liqFromEth < liqFromToken
        await amm.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });

        // Add liquidity where ETH proportion is smaller
        // This should use liqFromEth branch
        const aliceLPBefore = await amm.balanceLP(alice.address);
        await amm.connect(alice).addLiquidity(ethers.parseEther("2000"), { value: ethers.parseEther("5") }); // More tokens, less ETH
        const aliceLPAfter = await amm.balanceLP(alice.address);
        
        expect(aliceLPAfter).to.be.gt(aliceLPBefore);
    });

    it("should revert on invalid constructor parameters", async function () {
        const AMMFactory = await ethers.getContractFactory("LBPWeightedAMM");
        const block = await ethers.provider.getBlock("latest");

        await expect(
            AMMFactory.deploy(
                ethers.ZeroAddress, // zero token
                ethers.parseEther("0.7"),
                ethers.parseEther("0.3"),
                block!.timestamp,
                block!.timestamp + 3600,
                ethers.parseEther("0.003")
            )
        ).to.be.revertedWithCustomError(AMMFactory, "ZeroToken");

        await expect(
            AMMFactory.deploy(
                await token.getAddress(),
                ethers.parseEther("0.7"),
                ethers.parseEther("0.3"),
                block!.timestamp + 3600, // start >= end
                block!.timestamp,
                ethers.parseEther("0.003")
            )
        ).to.be.revertedWithCustomError(AMMFactory, "InvalidTimes");

        await expect(
            AMMFactory.deploy(
                await token.getAddress(),
                0n, // zero weight
                ethers.parseEther("0.3"),
                block!.timestamp,
                block!.timestamp + 3600,
                ethers.parseEther("0.003")
            )
        ).to.be.revertedWithCustomError(AMMFactory, "WeightsZero");

        await expect(
            AMMFactory.deploy(
                await token.getAddress(),
                ethers.parseEther("1.1"), // > SCALE
                ethers.parseEther("0.3"),
                block!.timestamp,
                block!.timestamp + 3600,
                ethers.parseEther("0.003")
            )
        ).to.be.revertedWithCustomError(AMMFactory, "WeightAboveMax");

        await expect(
            AMMFactory.deploy(
                await token.getAddress(),
                ethers.parseEther("0.7"),
                ethers.parseEther("0.3"),
                block!.timestamp,
                block!.timestamp + 3600,
                ethers.parseEther("0.003")
            )
        ).to.not.be.reverted; // Valid deployment
    });
});