import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/pool.test.ts
describe("SecureLBP Pool Initialization", function () {
    let token: TestToken;
    let vesting: TestVesting;
    let oracle: LBPOracle;
    let feed: MockPriceFeed;
    let lbp: SecureLBP;
    let pool: LBPWeightedAMM;
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
            presaleManager.address
        )) as SecureLBP;
        await lbp.waitForDeployment();

        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));
        await lbp.connect(owner).setOracle(await oracle.getAddress());
    });

    async function initPoolLocal() {
        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;
        const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, {value: ethAmount});
        await tx.wait();
        pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
    }

    describe("Pool Initialization", function () {
        it("should init pool from auction proceeds", async () => {
            expect(await lbp.poolInitialized()).to.equal(false);

            const ethAmount = INITIAL_POOL_ETH;
            const tokenAmount = INITIAL_POOL_TOKENS;
            const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, {value: ethAmount});
            await tx.wait();

            expect(await lbp.poolInitialized()).to.equal(true);
            pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
            expect(await pool.reserveToken()).to.equal(tokenAmount);
            expect(await pool.reserveETH()).to.equal(ethAmount);
            expect(await pool.totalSupplyLP()).to.be.gt(0n);
        });
        it("initPoolFromAuction Success: Call with valid amounts, check reserves/LP", async () => {
            expect(await lbp.poolInitialized()).to.equal(false);

            const ethAmount = INITIAL_POOL_ETH;
            const tokenAmount = INITIAL_POOL_TOKENS;
            const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });
            await tx.wait();

            expect(await lbp.poolInitialized()).to.equal(true);

            pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
            expect(await pool.reserveToken()).to.equal(tokenAmount);
            expect(await pool.reserveETH()).to.equal(ethAmount);
            expect(await pool.totalSupplyLP()).to.be.gt(0n);
        });

        it("initPoolFromAuction Already Init Revert", async () => {
            const ethAmount = INITIAL_POOL_ETH;
            const tokenAmount = INITIAL_POOL_TOKENS;
            await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });

            await expect(
                lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount })
            ).to.be.revertedWith("pool already init");
        });

        it("initPoolFromAuction Zero Amounts Revert", async () => {
            await expect(
                lbp.connect(owner).initPoolFromAuction(0, { value: INITIAL_POOL_ETH })
            ).to.be.revertedWith("zero amounts");

            await expect(
                lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: 0 })
            ).to.be.revertedWith("zero amounts");
        });


        it("initPoolFromAuction Gas: measure gas (~3M, expected for deploy)", async () => {
            const ethAmount = INITIAL_POOL_ETH;
            const tokenAmount = INITIAL_POOL_TOKENS;

            const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });
            const receipt = await tx.wait();

            // console.log("Gas used for initPoolFromAuction:", receipt!.gasUsed.toString());
            expect(receipt!.gasUsed).to.be.lt(3500000n);
        });
    });
});