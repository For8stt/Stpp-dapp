import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/core.test.ts
describe("SecureLBP Core", function () {
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
            presaleManager.address
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
        return ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, BigInt(nonce), contractAddr]
        );
    }

    describe("Core LBP", function () {
        it("should commit success: In window, check collectedETH/totalCommittedBy", async () => {
            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash, { value: amount });

            expect(await lbp.collectedETH()).to.equal(amount);
            expect(await lbp.totalCommittedBy(user1.address)).to.equal(amount);
            const commit = await lbp.getCommit(user1.address, hash);
            expect(commit.amountETH).to.equal(amount);
            expect(commit.processed).to.be.false;
        });

        it("should reveal success: Commit first, reveal, check allocations >0", async () => {
            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbp.commitEnd() + 1n);
            const tx = await lbp.connect(user1).revealBid(amount, nonce);
            await tx.wait();

            const alloc = await lbp.allocations(user1.address);
            expect(alloc).to.be.gt(0n);
            const commit = await lbp.getCommit(user1.address, hash);
            expect(commit.processed).to.be.true;
        });

        it("multiple commits/reveals per user: 2 hashes, sum committed/alloc", async () => {
            const amount1 = ONE_ETH;
            const amount2 = ethers.parseEther("0.5");
            const totalAmount = amount1 + amount2;
            const nonce1 = 123;
            const nonce2 = 456;
            const hash1 = buildCommit(user1, amount1, nonce1, await lbp.getAddress());
            const hash2 = buildCommit(user1, amount2, nonce2, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash1, { value: amount1 });
            await lbp.connect(user1).commitBid(hash2, { value: amount2 });

            expect(await lbp.totalCommittedBy(user1.address)).to.equal(totalAmount);

            await mineTo(await lbp.commitEnd() + 1n);
            await lbp.connect(user1).revealBid(amount1, nonce1);
            await lbp.connect(user1).revealBid(amount2, nonce2);

            const totalAlloc = await lbp.allocations(user1.address);
            expect(totalAlloc).to.be.gt(0n);
            const commit1 = await lbp.getCommit(user1.address, hash1);
            const commit2 = await lbp.getCommit(user1.address, hash2);
            expect(commit1.processed).to.be.true;
            expect(commit2.processed).to.be.true;
        });

        it("should penalize non-revealed: Skip reveal, penalize, pendingRefunds = 90%", async () => {
            const amount = ONE_ETH;
            const nonce = 42;
            const hash = buildCommit(user2, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user2).commitBid(hash, { value: amount });

            await mineTo(await lbp.revealEnd() + 5n);
            await lbp.connect(owner).penalizeNonRevealed(user2.address, hash, 1000);

            expect(await lbp.pendingRefunds(user2.address)).to.equal(amount * 90n / 100n);
            expect(await lbp.collectedETH()).to.equal(0n);
        });

        it("should withdraw refund: After penalize, balance += refund", async () => {
            const amount = ONE_ETH;
            const nonce = 42;
            const hash = buildCommit(user2, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user2).commitBid(hash, { value: amount });

            await mineTo(await lbp.revealEnd() + 5n);
            await lbp.connect(owner).penalizeNonRevealed(user2.address, hash, 1000);

            const beforeBal = await ethers.provider.getBalance(user2.address);
            await lbp.connect(user2).withdrawRefund();
            const afterBal = await ethers.provider.getBalance(user2.address);

            const refund = amount * 90n / 100n;
            expect(afterBal - beforeBal).to.be.closeTo(refund, ethers.parseEther("0.01"));
            expect(await lbp.pendingRefunds(user2.address)).to.equal(0n);
        });

        it("should revert commit out of window", async () => {
            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await expect(lbp.connect(user1).commitBid(hash, { value: amount })).to.be.revertedWith("not in commit window");

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbp.commitEnd() + 1n);
            await expect(lbp.connect(user1).commitBid(hash, { value: amount })).to.be.revertedWith("not in commit window");
        });

        it("should revert reveal out of window", async () => {
            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash, { value: amount });

            await expect(lbp.connect(user1).revealBid(amount, nonce)).to.be.revertedWith("not in reveal window");

            await mineTo(await lbp.commitEnd() + 1n);
            await lbp.connect(user1).revealBid(amount, nonce);

            await mineTo(await lbp.revealEnd() + 1n);
            await expect(lbp.connect(user1).revealBid(amount, nonce)).to.be.revertedWith("not in reveal window");
        });

        it("reveal quote from pool: Reveal, tokensBought = pool.quoteETHForToken(net)", async () => {
            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbp.commitEnd() + 1n);
            await lbp.connect(user1).revealBid(amount, nonce);

            const quotedTokens = await pool.quoteETHForToken(amount);
            const alloc = await lbp.allocations(user1.address);
            expect(alloc).to.equal(quotedTokens);
        });

        it("reveal revert without pool: Commit, reveal — revert 'pool not init'", async () => {
            const now = await time.latest();
            const start = now + 10;
            const commitEnd = start + 60;
            const revealEnd = commitEnd + 60;

            const LBP = await ethers.getContractFactory("SecureLBP");
            const lbpNoPool = (await LBP.deploy(
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
            await lbpNoPool.waitForDeployment();

            await token.mint(await lbpNoPool.getAddress(), ethers.parseEther("100000"));
            await lbpNoPool.connect(owner).setOracle(await oracle.getAddress());

            const amount = ONE_ETH;
            const nonce = 123;
            const hash = buildCommit(user1, amount, nonce, await lbpNoPool.getAddress());

            await mineTo(await lbpNoPool.startTime() + 1n);
            await lbpNoPool.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbpNoPool.commitEnd() + 1n);
            await expect(lbpNoPool.connect(user1).revealBid(amount, nonce))
                .to.be.revertedWith("pool not init");
        });

        it("pool weights should evolve over time", async () => {
            const startTime = await lbp.startTime();
            const revealEnd = await lbp.revealEnd();

            await time.increaseTo(startTime + 1n);
            let [weightToken] = await pool.currentWeights();
            expect(weightToken).to.be.closeTo(POOL_START_WEIGHT, ethers.parseUnits("0.01", 18)); // 0.01 tolerance

            const midTime = startTime + (revealEnd - startTime) / 2n;
            await time.increaseTo(midTime);
            [weightToken] = await pool.currentWeights();
            expect(weightToken).to.be.gt(POOL_END_WEIGHT);
            expect(weightToken).to.be.lt(POOL_START_WEIGHT);

            await time.increaseTo(revealEnd + 1n);
            [weightToken] = await pool.currentWeights();
            expect(weightToken).to.be.closeTo(POOL_END_WEIGHT, ethers.parseUnits("0.01", 18));
        });


    });

});