import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture, deployLbpWithoutPoolFixture } from "../utils/lbpFixtures";

const INITIAL_POOL_TOKENS = ethers.parseEther("10000");
const INITIAL_POOL_ETH = ethers.parseEther("100");
const START_WEIGHT = ethers.parseUnits("0.7", 18);
const END_WEIGHT = ethers.parseUnits("0.3", 18);
const SWAP_FEE = ethers.parseUnits("0.003", 18);

async function mintTokensToLbp(lbp: any, amount: bigint) {
    const tokenAddr = await lbp.token();
    const token = await ethers.getContractAt("TestToken", tokenAddr);
    await token.mint(await lbp.getAddress(), amount);
}

describe("SecureLBP – 02_initPool", function () {
    it("should initialize the LBP pool only once", async function () {
        const { lbp, owner, startTime, endTime } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await expect(
            lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH })
        ).to.emit(lbp, "PoolInitialized");

        expect(await lbp.poolInitialized()).to.be.true;

        const poolAddress = await lbp.pool();
        const pool = await ethers.getContractAt("LBPWeightedAMM", poolAddress);

        expect(await pool.owner()).to.equal(await lbp.getAddress());
        expect(await pool.reserveToken()).to.equal(INITIAL_POOL_TOKENS);
        expect(await pool.reserveETH()).to.equal(INITIAL_POOL_ETH);
        expect(await pool.startTime()).to.equal(startTime);
        expect(await pool.endTime()).to.equal(endTime);
        expect(await pool.startWeightToken()).to.equal(START_WEIGHT);
        expect(await pool.endWeightToken()).to.equal(END_WEIGHT);
        expect(await pool.swapFee()).to.equal(SWAP_FEE);
    });

    it("should deploy a new LBPWeightedAMM pool with correct parameters", async function () {
        const { lbp, owner, startTime, endTime } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH });
        const pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());

        expect(await pool.startTime()).to.equal(startTime);
        expect(await pool.endTime()).to.equal(endTime);
        expect(await pool.startWeightToken()).to.equal(START_WEIGHT);
        expect(await pool.endWeightToken()).to.equal(END_WEIGHT);
        expect(await pool.swapFee()).to.equal(SWAP_FEE);
    });

    it("should transfer ETH and token liquidity to pool using addLiquidity", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH });

        const pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
        expect(await pool.reserveToken()).to.equal(INITIAL_POOL_TOKENS);
        expect(await pool.reserveETH()).to.equal(INITIAL_POOL_ETH);
        expect(await pool.totalSupplyLP()).to.be.gt(0n);
    });

    it("should set poolInitialized = true", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH });
        expect(await lbp.poolInitialized()).to.be.true;
    });

    it("should emit PoolInitialized event", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await expect(
            lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH })
        ).to.emit(lbp, "PoolInitialized");
    });

    it("should revert if tokenAmount == 0 or msg.value == 0", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await expect(
            lbp.connect(owner).initPoolFromAuction(0, { value: INITIAL_POOL_ETH })
        ).to.be.revertedWithCustomError(lbp, "ZeroAmounts");

        await expect(
            lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: 0 })
        ).to.be.revertedWithCustomError(lbp, "ZeroAmounts");
    });

    it("should revert if function is called twice", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);

        await expect(
            lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH })
        ).to.be.revertedWithCustomError(lbp, "PoolAlreadyInitialized");
    });

    it("should revert if called by non-owner", async function () {
        const { lbp, user1 } = await loadFixture(deployLbpWithoutPoolFixture);
        await mintTokensToLbp(lbp, INITIAL_POOL_TOKENS);

        await expect(
            lbp.connect(user1).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH })
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert if contract lacks enough tokens", async function () {
        const { lbp, owner, startTime } = await loadFixture(deployLbpWithoutPoolFixture);

        await time.increaseTo(startTime - 5n);
        await expect(
            lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH })
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should interpolate pool weights from start to end time", async function () {
        const { pool, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        // Before startTime, weights remain at the configured starting ratio.
        const [tokenWeightStart, ethWeightStart] = await pool.currentWeights();
        expect(tokenWeightStart).to.equal(START_WEIGHT);
        expect(ethWeightStart).to.equal(ethers.parseUnits("0.3", 18));

        // Midway through the schedule weights should move linearly toward the end ratio.
        const midpoint = startTime + (endTime - startTime) / 2n;
        await time.increaseTo(midpoint);
        const [tokenWeightMid, ethWeightMid] = await pool.currentWeights();
        expect(tokenWeightMid).to.equal(ethers.parseUnits("0.5", 18));
        expect(ethWeightMid).to.equal(ethers.parseUnits("0.5", 18));

        // After the endTime the pool should lock at the final weights.
        await time.increaseTo(endTime + 1n);
        const [tokenWeightEnd, ethWeightEnd] = await pool.currentWeights();
        expect(tokenWeightEnd).to.equal(END_WEIGHT);
        expect(ethWeightEnd).to.equal(ethers.parseUnits("0.7", 18));
    });
});
