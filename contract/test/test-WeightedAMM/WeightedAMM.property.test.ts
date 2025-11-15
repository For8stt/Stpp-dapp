/**
 * Fuzz & Property Testing Suite for LBP Weighted AMM
 *
 * This test file performs fuzz and property-based testing for the Liquidity Bootstrap Pool (LBP) Weighted Automated Market Maker (AMM).
 * It verifies core invariants (properties) like non-negative outputs, reserve bounds, proportional LP removal, and weight sums,
 * using both deterministic unit tests and randomized fuzzing (50 iterations with random inputs) to ensure robustness.
 *
 * Structure:
 * - Unit Property Tests: Deterministic checks for swap outputs (>=0, <= reserves), reverts on zero input, non-negative reserves, and weight sum = SCALE.
 * - Fuzz & Property Testing: Randomized iterations for swaps (out bounds/reverts), addLiquidity (LP/reserves growth), removeLiquidity (proportional decrease),
 *   and currentWeights (sum=SCALE, valid range [0.3-0.7]).
 *
 * No metrics logged; focuses on pass/fail assertions for safety and correctness under random loads.
 * Uses delta inference for outputs (no callStatic) and evm_increaseTime for time-based weights.
 *
 * Run: npx hardhat test test/test-WeightedAMM/WeightedAMM.property.test.ts
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import type { LBPWeightedAMM, TestToken } from "../../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { randomBytes } from "crypto"; // For simple fuzzing randomness

// Helper to generate random uint256 in range (0, max)
function randomUint(max: bigint): bigint {
    const buf = randomBytes(32);
    let num = BigInt("0x" + buf.toString("hex"));
    return (num % max) + 1n; // 1 to max
}


// npx hardhat test test/WeightedAMM.property.test.ts
describe("WeightedAMM Fuzz & Property Testing", function () {
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

    const FUZZ_ITERATIONS = 50; // Number of random iterations for fuzzing
    const MAX_TOKEN_IN = ethers.parseEther("1000"); // Max random input for fuzz
    const MAX_ETH_IN = ethers.parseEther("10");


    describe("Unit Property Tests", function () { // New sub-describe for deterministic properties
        beforeEach(async function () {
            // Seed liquidity with owner (transfer if needed, but owner has tokens)
            await token.approve(await amm.getAddress(), ethers.parseEther("10000"));
            await amm.addLiquidity(ethers.parseEther("1000"), { value: ethers.parseEther("10") });
        });

        it("amountOut must be ≥ 0 and ≤ balanceOut for token->ETH", async function () {
            const tokenIn = ethers.parseEther("1");
            await token.approve(await amm.getAddress(), tokenIn); // Owner approves for swap

            // Execute swap and infer out from reserve delta (no callStatic)
            const balanceETHBefore = await amm.reserveETH();
            const reserveETHStart = await amm.reserveETH();
            const tx = await amm.swapTokenForETH(tokenIn, 0n);
            await tx.wait();
            const reserveETHAfter = await amm.reserveETH();

            const out = reserveETHStart - reserveETHAfter;
            expect(out).to.be.gte(0n);
            expect(out).to.be.lte(balanceETHBefore);
        });

        it("if amountIn = 0 → amountOut = 0", async function () {
            // Since no callStatic, check that it reverts (implying calc would be 0, but execution blocked)
            await expect(amm.swapTokenForETH(0n, 0n)).to.be.revertedWithCustomError(amm, "ZeroTokenInput");

            await expect(amm.swapETHForToken(0n, { value: 0 })).to.be.revertedWithCustomError(amm, "ZeroEth");
        });

        it("reserves should never go negative after swap", async function () {
            const ethIn = ethers.parseEther("1");
            await amm.swapETHForToken(0n, { value: ethIn });

            const reserveToken = await amm.reserveToken();
            const reserveETH = await amm.reserveETH();

            expect(reserveToken).to.be.gte(0n);
            expect(reserveETH).to.be.gte(0n);
        });

        it("weights sum must always equal SCALE", async function () {
            const [wToken, wETH] = await amm.currentWeights();
            expect(wToken + wETH).to.equal(SCALE);
        });
    });

    describe("Fuzz & Property Testing", function () {
        beforeEach(async function () {
            // Setup initial liquidity for swap properties
            await amm.connect(alice).addLiquidity(ethers.parseEther("10000"), { value: ethers.parseEther("100") });
        });

        it("swapTokenForETH: amountOut always >= 0 and <= reserveETH", async function () {
            const reserveETHBefore = await amm.reserveETH();

            for (let i = 0; i < FUZZ_ITERATIONS; i++) {
                const tokenIn = randomUint(MAX_TOKEN_IN);

                // Execute swap and check via reserves change (since no callStatic, infer out from delta)
                const reserveETHStart = await amm.reserveETH();
                await token.connect(bob).approve(await amm.getAddress(), tokenIn);
                const tx = await amm.connect(bob).swapTokenForETH(tokenIn, 0n);
                await tx.wait();
                const reserveETHAfter = await amm.reserveETH();

                const ethOut = reserveETHStart - reserveETHAfter;
                expect(ethOut).to.be.gte(0n);
                expect(ethOut).to.be.lte(reserveETHBefore);
            }
        });

        it("swapTokenForETH: when tokenIn = 0, out = 0", async function () {
            const tokenIn = 0n;
            // Since no callStatic, expect revert on execution
            await expect(amm.connect(bob).swapTokenForETH(tokenIn, 0n)).to.be.revertedWithCustomError(
                amm,
                "ZeroTokenInput"
            );
        });

        it("swapETHForToken: amountOut always >= 0 and <= reserveToken", async function () {
            const reserveTokenBefore = await amm.reserveToken();

            for (let i = 0; i < FUZZ_ITERATIONS; i++) {
                const ethIn = randomUint(MAX_ETH_IN);

                // Execute swap and check via reserves change
                const reserveTokenStart = await amm.reserveToken();
                const tx = await amm.connect(bob).swapETHForToken(0n, { value: ethIn });
                await tx.wait();
                const reserveTokenAfter = await amm.reserveToken();

                const tokenOut = reserveTokenStart - reserveTokenAfter;
                expect(tokenOut).to.be.gte(0n);
                expect(tokenOut).to.be.lte(reserveTokenBefore);
            }
        });

        it("swapETHForToken: when ethIn = 0, out = 0", async function () {
            const ethIn = 0n;
            // Expect revert on execution
            await expect(amm.connect(bob).swapETHForToken(0n, { value: ethIn })).to.be.revertedWithCustomError(
                amm,
                "ZeroEth"
            );
        });

        it("addLiquidity: lpMinted always >= 0 and reserves increase", async function () {
            const initialReserveToken = await amm.reserveToken();
            const initialReserveETH = await amm.reserveETH();
            const initialTotalLP = await amm.totalSupplyLP();

            for (let i = 0; i < FUZZ_ITERATIONS; i++) {
                const tokenAmount = randomUint(ethers.parseEther("1000"));
                const ethAmount = randomUint(ethers.parseEther("10"));

                // Since no callStatic, execute and check
                const totalLPBefore = await amm.totalSupplyLP();
                await amm.connect(alice).addLiquidity(tokenAmount, { value: ethAmount });
                const lpMinted = (await amm.totalSupplyLP()) - totalLPBefore;

                expect(lpMinted).to.be.gte(0n);

                expect(await amm.reserveToken()).to.be.gt(initialReserveToken);
                expect(await amm.reserveETH()).to.be.gt(initialReserveETH);
                expect(await amm.totalSupplyLP()).to.be.gt(initialTotalLP);
            }
        });

        it("removeLiquidity: returns proportional amounts, reserves decrease", async function () {
            // First add some LP to alice (on top of beforeEach)
            const aliceToken = ethers.parseEther("5000");
            const aliceEth = ethers.parseEther("50");
            await amm.connect(alice).addLiquidity(aliceToken, { value: aliceEth });
            let currentAliceLP = await amm.balanceLP(alice.address);

            for (let i = 0; i < FUZZ_ITERATIONS; i++) {
                // Use current balance to avoid over-removal
                if (currentAliceLP <= 0n) break; // Stop if depleted
                const maxLp = currentAliceLP / 10n || 1n;
                const lpAmount = randomUint(maxLp);

                // Calc expected based on CURRENT state (before removal)
                const currentReserveToken = await amm.reserveToken();
                const currentReserveETH = await amm.reserveETH();
                const currentTotalLP = await amm.totalSupplyLP();

                const expectedTokenOutCalc = (currentReserveToken * lpAmount) / currentTotalLP;
                const expectedEthOutCalc = (currentReserveETH * lpAmount) / currentTotalLP;

                expect(expectedTokenOutCalc).to.be.gte(0n);
                expect(expectedEthOutCalc).to.be.gte(0n);

                // Execute
                const reserveTokenBefore = await amm.reserveToken();
                const reserveETHBefore = await amm.reserveETH();
                await amm.connect(alice).removeLiquidity(lpAmount);

                // Update current LP
                currentAliceLP = await amm.balanceLP(alice.address);

                // Check deltas match expected exactly (since same calc)
                const actualTokenOut = reserveTokenBefore - await amm.reserveToken();
                const actualEthOut = reserveETHBefore - await amm.reserveETH();
                expect(actualTokenOut).to.equal(expectedTokenOutCalc);
                expect(actualEthOut).to.equal(expectedEthOutCalc);

                // Check decrease per iteration
                expect(await amm.reserveToken()).to.be.lt(reserveTokenBefore);
                expect(await amm.reserveETH()).to.be.lt(reserveETHBefore);
                expect(await amm.totalSupplyLP()).to.be.lt(currentTotalLP);
            }
        });

        it("currentWeights: sum always = SCALE, weights in valid range", async function () {
            for (let i = 0; i < FUZZ_ITERATIONS; i++) {
                // Random time offset: 0 to 2 hours
                const offset = Math.floor(Math.random() * 7200);
                await ethers.provider.send("evm_increaseTime", [offset]);
                await ethers.provider.send("evm_mine", []);

                const [wToken, wETH] = await amm.currentWeights();
                expect(wToken + wETH).to.equal(SCALE);
                expect(wToken).to.be.gte(ethers.parseEther("0.3")); // Min endWeight
                expect(wToken).to.be.lte(ethers.parseEther("0.7")); // Max startWeight
                expect(wETH).to.be.gte(ethers.parseEther("0.3"));
                expect(wETH).to.be.lte(ethers.parseEther("0.7"));
            }
        });
    });
});
