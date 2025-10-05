import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/oracle.test.ts
describe("SecureLBP Oracle & Fee", function () {
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
    const ONE_ETH = ethers.parseEther("1");

    beforeEach(async () => {
        [owner, user1, user2, treasury, presaleManager] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        feed = await MockFeed.deploy(ethers.parseUnits("2000", 8)) as MockPriceFeed;
        await feed.waitForDeployment();

        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = await Oracle.deploy(await feed.getAddress()) as LBPOracle;
        await oracle.waitForDeployment();

        // Set a shorter pause duration for testing
        await oracle.setPauseDuration(30); // 30 seconds

        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = await Vesting.deploy() as TestVesting;
        await vesting.waitForDeployment();

        const now = await time.latest();
        const start = now + 10;
        const commitEnd = start + 60;
        const revealEnd = commitEnd + 60;

        const LBP = await ethers.getContractFactory("SecureLBP");
        lbp = await LBP.deploy(
            await token.getAddress(),
            start,
            commitEnd,
            revealEnd,
            treasury.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            presaleManager.address
        ) as SecureLBP;
        await lbp.waitForDeployment();

        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));
        await lbp.connect(owner).setOracle(await oracle.getAddress());

        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;
        const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });
        await tx.wait();
        pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
    });

    async function mineTo(ts: bigint) {
        await time.increaseTo(ts);
    }

    function buildCommit(user: any, amount: bigint, nonce: number, contractAddr: string) {
        return ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, nonce, contractAddr]
        );
    }

    describe("Oracle & Fee", function () {
        it("should use adaptive fee from oracle (stable price)", async () => {
            await oracle.computeAdaptiveFee();
            const oracleFee = await oracle.viewAdaptiveFee();
            expect(oracleFee).to.equal(100n);

            await mineTo(await lbp.startTime() + 1n);
            const lbpFee = await lbp.currentFeeBP();
            expect(lbpFee).to.equal(oracleFee);
        });

        it("should fallback to linear fee if oracle fails", async () => {
            await lbp.connect(owner).setOracle(ethers.ZeroAddress);

            await mineTo(await lbp.startTime() + 10n);
            const lbpFee = await lbp.currentFeeBP();
            expect(lbpFee).to.be.closeTo(925n, 10n);
        });
        it("Adaptive Fee on Drop: small/large price drop", async () => {
            await feed.setPrice(ethers.parseUnits("1800", 8));
            await oracle.computeAdaptiveFee();
            const smallDropFee = await oracle.viewAdaptiveFee();
            expect(smallDropFee).to.equal(100n);
            expect(await oracle.isPaused()).to.be.false;

            await feed.setPrice(ethers.parseUnits("1000", 8));
            await oracle.computeAdaptiveFee();
            const largeDropFee = await oracle.viewAdaptiveFee();
            expect(largeDropFee).to.equal(1000n); // 10%
            expect(await oracle.isPaused()).to.be.true;
        });



        it("should revert commit when oracle paused", async () => {
            await feed.setPrice(ethers.parseUnits("1000", 8));
            await oracle.computeAdaptiveFee();

            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await expect(lbp.connect(user1).commitBid(hash, { value: amount })).to.be.revertedWith("paused by oracle");
        });

        it("should resume after pause duration", async () => {
            // Move to commit window
            await mineTo(await lbp.startTime() + 1n);

            // Trigger pause
            await feed.setPrice(ethers.parseUnits("1000", 8));
            await oracle.computeAdaptiveFee();
            expect(await oracle.isPaused()).to.be.true;

            // Advance time past pause duration
            const pauseDuration = await oracle.pauseDuration();
            await mineTo(BigInt(await time.latest()) + pauseDuration + 1n);

            expect(await oracle.isPaused()).to.be.false;

            // Perform commit after pause
            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());
            await lbp.connect(user1).commitBid(hash, { value: amount });
        });
    });
});