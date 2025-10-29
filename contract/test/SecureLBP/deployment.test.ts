import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/deployment.test.ts
describe("SecureLBP Deployment", function () {
    let token: TestToken;
    let vesting: TestVesting;
    let oracle: LBPOracle;
    let feed: MockPriceFeed;
    let lbp: SecureLBP;
    let owner: any, user1: any, user2: any, treasury: any, presaleManager: any;

    const INITIAL_POOL_TOKENS = ethers.parseEther("10000");
    const INITIAL_POOL_ETH = ethers.parseEther("100");
    const POOL_START_WEIGHT = ethers.parseUnits("0.7", 18);
    const POOL_END_WEIGHT = ethers.parseUnits("0.3", 18);
    const POOL_SWAP_FEE = ethers.parseUnits("0.003", 18);

    beforeEach(async () => {
        [owner, user1, user2, treasury, presaleManager] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        feed = (await MockFeed.deploy(ethers.parseUnits("2000", 8))) as MockPriceFeed;
        await feed.waitForDeployment();

        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = (await Oracle.deploy(await feed.getAddress())) as LBPOracle;
        await oracle.waitForDeployment();

        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = (await Vesting.deploy()) as TestVesting;
        await vesting.waitForDeployment();

        const now = await time.latest();
        const start = now + 10;
        const commitEnd = start + 60;
        const revealEnd = commitEnd + 60;

        const LBP = await ethers.getContractFactory("SecureLBP");
        lbp = (await LBP.deploy(
            await token.getAddress(),
            start,
            commitEnd,
            revealEnd,
            treasury.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            ethers.ZeroAddress,
            ethers.ZeroAddress
        )) as SecureLBP;
        await lbp.waitForDeployment();

        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));
        await lbp.connect(owner).setOracle(await oracle.getAddress());
    });

    describe("Deployment", function () {
        it("should deploy with valid params", async () => {
            const now = await time.latest();
            const start = now + 10;
            const commitEnd = start + 60;
            const revealEnd = commitEnd + 60;

            const LBP = await ethers.getContractFactory("SecureLBP");
            const newLbp = (await LBP.deploy(
                await token.getAddress(),
                start,
                commitEnd,
                revealEnd,
                treasury.address,
                POOL_START_WEIGHT,
                POOL_END_WEIGHT,
                POOL_SWAP_FEE,
                ethers.ZeroAddress,
                ethers.ZeroAddress
            )) as SecureLBP;
            await newLbp.waitForDeployment();

            expect(await newLbp.token()).to.equal(await token.getAddress());
            expect(await newLbp.startTime()).to.equal(start);
            expect(await newLbp.commitEnd()).to.equal(commitEnd);
            expect(await newLbp.revealEnd()).to.equal(revealEnd);
            expect(await newLbp.treasury()).to.equal(treasury.address);
            expect(await newLbp.poolStartWeightToken()).to.equal(POOL_START_WEIGHT);
            expect(await newLbp.poolEndWeightToken()).to.equal(POOL_END_WEIGHT);
            expect(await newLbp.poolSwapFee()).to.equal(POOL_SWAP_FEE);

            expect(await newLbp.poolInitialized()).to.be.false;
            expect(await newLbp.oracle()).to.equal(ethers.ZeroAddress);
            expect(await newLbp.collectedETH()).to.equal(0n);
        });
    });

    describe("Deployment Errors", function () {
        it("should revert on zero token", async () => {
            const now = await time.latest();
            const start = now + 10;
            const commitEnd = start + 60;
            const revealEnd = commitEnd + 60;

            const LBP = await ethers.getContractFactory("SecureLBP");
            await expect(
                LBP.deploy(
                    ethers.ZeroAddress,
                    start,
                    commitEnd,
                    revealEnd,
                    treasury.address,
                    POOL_START_WEIGHT,
                    POOL_END_WEIGHT,
                    POOL_SWAP_FEE,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress
                )
            ).to.be.revertedWith("zero token");
        });

        it("should revert on invalid times", async () => {
            const now = await time.latest();
            const start = now + 10;
            const commitEnd = start - 5;
            const revealEnd = commitEnd + 60;

            const LBP = await ethers.getContractFactory("SecureLBP");
            await expect(
                LBP.deploy(
                    await token.getAddress(),
                    start,
                    commitEnd,
                    revealEnd,
                    treasury.address,
                    POOL_START_WEIGHT,
                    POOL_END_WEIGHT,
                    POOL_SWAP_FEE,
                    presaleManager.address,
                    owner.address
                )
            ).to.be.revertedWith("invalid times");
        });

        it("should revert on zero treasury", async () => {
            const now = await time.latest();
            const start = now + 10;
            const commitEnd = start + 60;
            const revealEnd = commitEnd + 60;

            const LBP = await ethers.getContractFactory("SecureLBP");
            await expect(
                LBP.deploy(
                    await token.getAddress(),
                    start,
                    commitEnd,
                    revealEnd,
                    ethers.ZeroAddress,
                    POOL_START_WEIGHT,
                    POOL_END_WEIGHT,
                    POOL_SWAP_FEE,
                    presaleManager.address,
                    owner.address
                )
            ).to.be.revertedWith("zero treasury");
        });
    });
});
