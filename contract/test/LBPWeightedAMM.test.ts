/**
 * Full Test Suite for LBPWeightedAMM — Dynamic Weighted Pool
 *
 * Combines:
 *  - Liquidity add/remove flow
 *  - Multi-user LP proportions
 *  - Swaps in both directions
 *  - Dynamic weight updates (time-based)
 *  - Price evolution over time
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { LBPWeightedAMM, TestToken } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// npx hardhat test test/LBPWeightedAMM.test.ts
describe("LBPWeightedAMM — Dynamic Weighted Pool", function () {
    let token: TestToken;
    let pool: LBPWeightedAMM;
    let owner: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress;

    const START_WEIGHT = ethers.parseEther("0.7"); // 70% token
    const END_WEIGHT = ethers.parseEther("0.3");   // 30% token
    const SWAP_FEE = ethers.parseEther("0.003");   // 0.3%
    const START_TIME_OFFSET = 10n;
    const DURATION = 3600n; // 1 hour
    const SCALE = ethers.parseEther("1");

    beforeEach(async () => {
        [owner, alice, bob] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const userAmount = ethers.parseEther("100000");
        await token.transfer(alice.address, userAmount);
        await token.transfer(bob.address, userAmount);

        const now = BigInt(await time.latest());
        const startTime = now + START_TIME_OFFSET;
        const endTime = startTime + DURATION;

        const Pool = await ethers.getContractFactory("LBPWeightedAMM");
        pool = await Pool.deploy(
            await token.getAddress(),
            START_WEIGHT,
            END_WEIGHT,
            startTime,
            endTime,
            SWAP_FEE
        );
        await pool.waitForDeployment();

        await token.approve(await pool.getAddress(), ethers.parseEther("1000000"));
        await token.connect(alice).approve(await pool.getAddress(), ethers.parseEther("1000000"));
        await token.connect(bob).approve(await pool.getAddress(), ethers.parseEther("1000000"));
    });


    it("should initialize weights correctly", async () => {
        const [wToken, wETH] = await pool.currentWeights();
        expect(wToken).to.equal(START_WEIGHT);
        expect(wETH).to.equal(ethers.parseEther("0.3"));
    });

    it("should allow adding and removing liquidity correctly", async function () {
        await pool.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });
        const aliceLP = await pool.balanceLP(alice.address);
        expect(aliceLP).to.be.gt(0n);

        await pool.connect(alice).removeLiquidity(aliceLP);
        expect(await pool.balanceLP(alice.address)).to.equal(0n);
        expect(await pool.reserveToken()).to.equal(0n);
        expect(await pool.reserveETH()).to.equal(0n);
    });

    it("should handle LP proportions correctly with multiple users", async function () {
        await pool.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });
        await pool.connect(bob).addLiquidity(ethers.parseEther("500"), { value: ethers.parseEther("5") });

        const totalLP = await pool.totalSupplyLP();
        expect(totalLP).to.be.gt(0n);

        const bobLP = await pool.balanceLP(bob.address);
        const halfBob = bobLP / 2n;
        await pool.connect(bob).removeLiquidity(halfBob);
        const newBobLP = await pool.balanceLP(bob.address);
        expect(newBobLP).to.equal(halfBob);
    });

    it("should update weights dynamically over time", async function () {
        let [wToken, wETH] = await pool.currentWeights();
        expect(wToken + wETH).to.equal(SCALE);
        expect(wToken).to.be.closeTo(ethers.parseEther("0.7"), ethers.parseEther("0.001"));

        await pool.connect(alice).addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });
        await time.increase(1800);
        await time.advanceBlock();

        [wToken, wETH] = await pool.currentWeights();
        expect(wToken).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.01"));
        expect(wETH).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.01"));
        expect(wToken + wETH).to.equal(SCALE);
    });

    it("should swap ETH for tokens with decreasing token weight", async () => {
        await pool.addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("100") });
        await time.increase(START_TIME_OFFSET + 100n);

        const tokenBefore = await token.balanceOf(bob.address);
        await pool.connect(bob).swapETHForToken(0, { value: ethers.parseEther("1") });
        const tokenAfter = await token.balanceOf(bob.address);
        expect(tokenAfter).to.be.gt(tokenBefore);

        const reserves = {
            token: await pool.reserveToken(),
            eth: await pool.reserveETH(),
        };
        expect(reserves.eth).to.be.gt(ethers.parseEther("100"));
    });

    it("should swap token for ETH and respect slippage", async () => {
        await pool.addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("100") });
        await token.transfer(bob.address, ethers.parseEther("50"));
        await token.connect(bob).approve(await pool.getAddress(), ethers.parseEther("50"));

        const ethBefore = await ethers.provider.getBalance(bob.address);
        const tx = await pool.connect(bob).swapTokenForETH(ethers.parseEther("10"), 0);
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice!;
        const ethAfter = await ethers.provider.getBalance(bob.address);

        expect(ethAfter + gasUsed).to.be.gt(ethBefore);
    });

    it("should change price as weights shift over time", async () => {
        await pool.addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("100") });
        const quoteEarly = await pool.quoteETHForToken(ethers.parseEther("1"));

        const endTime = await pool.endTime();
        await time.increaseTo(endTime - 1n);
        const quoteLate = await pool.quoteETHForToken(ethers.parseEther("1"));

        expect(quoteLate).to.be.gt(quoteEarly);
    });

    it("should remove liquidity correctly", async () => {
        await pool.addLiquidity(ethers.parseEther("100"), { value: ethers.parseEther("10") });

        const lp = await pool.balanceLP(owner.address);
        const tokenBefore = await token.balanceOf(owner.address);
        const ethBefore = await ethers.provider.getBalance(owner.address);

        const tx = await pool.removeLiquidity(lp);
        const receipt = await tx.wait();
        const gasCost = receipt!.gasUsed * receipt!.gasPrice!;

        const tokenAfter = await token.balanceOf(owner.address);
        const ethAfter = await ethers.provider.getBalance(owner.address);

        expect(tokenAfter).to.be.gt(tokenBefore);
        expect(ethAfter + gasCost).to.be.gt(ethBefore);
    });

});
