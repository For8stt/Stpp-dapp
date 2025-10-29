import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/admin.test.ts
describe("SecureLBP Admin & Edge Cases", function () {
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

        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;
        const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, {value: ethAmount});
        await tx.wait();
        pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
    });

    async function mineTo(ts: bigint) {
        await time.increaseTo(ts);
    }

    function buildCommit(user: any, amount: bigint, nonce: number, contractAddr: string) {
        return ethers.keccak256(
            ethers.solidityPackedKeccak256(
                ["address", "uint256", "uint256", "address"],
                [user.address, amount, nonce, contractAddr]
            )
        );
    }

    describe("Admin & Edge Cases", function () {
        it("should set treasury", async () => {
            const newTreasury = user2.address;
            await lbp.connect(owner).setTreasury(newTreasury);
            expect(await lbp.treasury()).to.equal(newTreasury);
        });

        it("should revert set treasury zero", async () => {
            await expect(lbp.connect(owner).setTreasury(ethers.ZeroAddress)).to.be.revertedWith("zero");
        });

        it("should rescue non-sale token", async () => {
            const OtherToken = await ethers.getContractFactory("TestToken");
            const otherToken = await OtherToken.deploy(ethers.parseEther("1000"));
            await otherToken.waitForDeployment();

            const amount = ethers.parseEther("100");
            await otherToken.transfer(await lbp.getAddress(), amount);

            const beforeBal = await otherToken.balanceOf(user1.address);
            await lbp.connect(owner).rescueERC20(await otherToken.getAddress(), user1.address, amount);
            const afterBal = await otherToken.balanceOf(user1.address);

            expect(afterBal - beforeBal).to.equal(amount);
        });

        it("should revert rescue sale token", async () => {
            const amount = ethers.parseEther("100");
            await expect(lbp.connect(owner).rescueERC20(await token.getAddress(), user1.address, amount)).to.be.revertedWith("cannot rescue sale token");
        });

        it("should set max cap", async () => {
            const cap = ethers.parseEther("2");
            await lbp.connect(owner).setMaxContributionPerAddress(cap);
            expect(await lbp.maxContributionPerAddress()).to.equal(cap);
        });

        it("should revert commit > cap", async () => {
            const cap = ethers.parseEther("2");
            await lbp.connect(owner).setMaxContributionPerAddress(cap);

            const amount = cap + ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await expect(lbp.connect(user1).commitBid(hash, { value: amount })).to.be.revertedWith("exceeds per-address cap");
        });

        it("should allow multiple commits <= cap", async () => {
            const cap = ethers.parseEther("2");
            await lbp.connect(owner).setMaxContributionPerAddress(cap);

            const amount1 = ethers.parseEther("1");
            const amount2 = ethers.parseEther("1");
            const nonce1 = 123;
            const nonce2 = 124;
            const hash1 = buildCommit(user1, amount1, nonce1, await lbp.getAddress());
            const hash2 = buildCommit(user1, amount2, nonce2, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash1, { value: amount1 });
            await lbp.connect(user1).commitBid(hash2, { value: amount2 });

            expect(await lbp.totalCommittedBy(user1.address)).to.equal(cap);
        });

        it("should revert zero bid/nonce mismatch", async () => {
            const nonce = 123;
            const hash = buildCommit(user1, 0n, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await expect(lbp.connect(user1).commitBid(hash, { value: 0 })).to.be.revertedWith("zero bid");

            const goodAmount = ONE_ETH;
            const goodNonce = 123;
            const goodHash = buildCommit(user1, goodAmount, goodNonce, await lbp.getAddress());

            await lbp.connect(user1).commitBid(goodHash, { value: goodAmount });

            await mineTo(await lbp.commitEnd() + 1n);
            await expect(lbp.connect(user1).revealBid(goodAmount + 1n, goodNonce)).to.be.revertedWith("amount mismatch or zero");
        });
    });
});
