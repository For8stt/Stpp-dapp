/**
 * Gas Profiling Test Suite for LBP Weighted AMM
 *
 * This test file profiles gas consumption for key operations in the Liquidity Bootstrap Pool (LBP) Weighted Automated Market Maker (AMM):
 * addLiquidity, removeLiquidity, swapTokenForETH, and swapETHForToken. It measures gas used via transaction receipts and logs averages.
 * Highlights expensive ops like PRBMath.pow (in _calcOutGivenIn) for swaps (~50k-100k gas). Optimizations: Use fixed-point math alternatives or pre-compute weights.
 *
 * Structure:
 * - "gas for addLiquidity": Profiles initial and subsequent adds, expect <250k gas (initial sqrt heavy).
 * - "gas for removeLiquidity": Proportional removal, expect <120k gas.
 * - "gas for swapTokenForETH": Token->ETH swap, expect <150k gas (pow heavy).
 * - "gas for swapETHForToken": ETH->Token swap, expect <150k gas.
 *
 * Logs gasUsed for each tx and averages. Run with --gas-reporter for full report.
 *
 * Run: npx hardhat test test/test-WeightedAMM/WeightedAMM.gas.test.ts
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import type { LBPWeightedAMM, TestToken } from "../../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("WeightedAMM Gas Profiling", function () {
    let token: TestToken;
    let amm: LBPWeightedAMM;
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    const initialTokenSupply = ethers.parseEther("1000000");
    const SCALE = ethers.parseEther("1");
    const TEST_AMOUNT = ethers.parseEther("1000");
    const TEST_ETH = ethers.parseEther("10");

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

    describe("Gas Profiling Tests", function () {
        it("profile gas for addLiquidity (initial and subsequent)", async function () {
            // Initial add (sqrt calc)
            const initialTx = await amm.connect(alice).addLiquidity(TEST_AMOUNT, { value: TEST_ETH });
            const initialReceipt = await initialTx.wait()!;
            const initialGas = initialReceipt!.gasUsed;

            // Subsequent add (proportional)
            await amm.connect(alice).addLiquidity(TEST_AMOUNT, { value: TEST_ETH });
            const subsequentTx = await amm.connect(bob).addLiquidity(TEST_AMOUNT / 2n, { value: TEST_ETH / 2n });
            const subsequentReceipt = await subsequentTx.wait()!;
            const subsequentGas = subsequentReceipt!.gasUsed;

            // console.log(`Initial addLiquidity gas: ${initialGas}`);
            // console.log(`Subsequent addLiquidity gas: ${subsequentGas}`);
            expect(initialGas).to.be.lt(250000n); // Adjusted for sqrt + first LP overhead
            expect(subsequentGas).to.be.lt(100000n);
        });

        it("profile gas for removeLiquidity", async function () {
            // Add LP first
            await amm.connect(alice).addLiquidity(TEST_AMOUNT, { value: TEST_ETH });
            const aliceLP = await amm.balanceLP(alice.address);

            // Remove half
            const removeTx = await amm.connect(alice).removeLiquidity(aliceLP / 2n);
            const receipt = await removeTx.wait()!;
            const gasUsed = receipt!.gasUsed;

            // console.log(`removeLiquidity gas: ${gasUsed}`);
            expect(gasUsed).to.be.lt(120000n); // Proportional calc cheap
        });

        it("profile gas for swapTokenForETH (pow heavy)", async function () {
            // Seed LP
            await amm.connect(alice).addLiquidity(TEST_AMOUNT, { value: TEST_ETH });

            // Small swap
            const smallTx = await amm.connect(bob).swapTokenForETH(ethers.parseEther("10"), 0n);
            const smallReceipt = await smallTx.wait()!;
            const smallGas = smallReceipt!.gasUsed;

            // Large swap (higher impact)
            const largeTx = await amm.connect(bob).swapTokenForETH(ethers.parseEther("500"), 0n);
            const largeReceipt = await largeTx.wait()!;
            const largeGas = largeReceipt!.gasUsed;

            // console.log(`Small swapTokenForETH gas: ${smallGas}`);
            // console.log(`Large swapTokenForETH gas: ${largeGas}`);
            expect(smallGas).to.be.lt(150000n); // Pow ~50k gas
            expect(largeGas).to.be.lt(200000n);
        });

        it("profile gas for swapETHForToken (pow heavy)", async function () {
            // Seed LP
            await amm.connect(alice).addLiquidity(TEST_AMOUNT, { value: TEST_ETH });

            // Small swap
            const smallTx = await amm.connect(bob).swapETHForToken(0n, { value: ethers.parseEther("0.1") });
            const smallReceipt = await smallTx.wait()!;
            const smallGas = smallReceipt!.gasUsed;

            // Large swap
            const largeTx = await amm.connect(bob).swapETHForToken(0n, { value: ethers.parseEther("5") });
            const largeReceipt = await largeTx.wait()!;
            const largeGas = largeReceipt!.gasUsed;

            // console.log(`Small swapETHForToken gas: ${smallGas}`);
            // console.log(`Large swapETHForToken gas: ${largeGas}`);
            expect(smallGas).to.be.lt(150000n); // Similar to token swap
            expect(largeGas).to.be.lt(200000n);
        });

    });
});