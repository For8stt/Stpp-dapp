import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/flow.test.ts
describe("SecureLBP Full Flow", function () {
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
        feed = await MockFeed.deploy(ethers.parseUnits("2000", 8));
        await feed.waitForDeployment();

        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = await Oracle.deploy(await feed.getAddress());
        await oracle.waitForDeployment();

        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = await Vesting.deploy();
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
        );
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
            [user.address, amount, BigInt(nonce), contractAddr]
        );
    }

    describe("Full Flow", function () {
        it("should success flow: commit/reveal/finalize with pool", async () => {
            await mineTo(await lbp.startTime() + 1n);
            const amount = ONE_ETH;
            const nonce = 99;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            await lbp.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbp.commitEnd() + 1n);
            const netAmount = amount * 990n / 1000n;
            await pool.quoteETHForToken(netAmount);
            await lbp.connect(user1).revealBid(amount, nonce);

            const poolEndTime = await pool.endTime();
            await mineTo(poolEndTime + 1n);

            const beforePoolToken = await pool.reserveToken();
            const beforePoolETH = await pool.reserveETH();

            await pool.currentWeights();

            try {
                await vesting.registerAllocations([user1.address], [ethers.parseEther("100")]);
            } catch (error) {}

            const tx = await lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address]);
            await tx.wait();

            const vested = await vesting.allocations(user1.address);
            expect(vested).to.be.gt(0n);
            expect(await pool.reserveETH()).to.be.gt(beforePoolETH);
            expect(await pool.reserveToken()).to.be.lt(beforePoolToken);
        });

        it("should fail flow: penalize non-reveal, withdraw refund", async () => {
            await mineTo(await lbp.startTime() + 1n);
            const amount = ONE_ETH;
            const nonce = 42;
            const hash = buildCommit(user2, amount, nonce, await lbp.getAddress());

            await lbp.connect(user2).commitBid(hash, { value: amount });

            await mineTo(await lbp.revealEnd() + 5n);
            await lbp.connect(owner).penalizeNonRevealed(user2.address, hash, 1000);

            const beforeBal = await ethers.provider.getBalance(user2.address);
            await lbp.connect(user2).withdrawRefund();
            const afterBal = await ethers.provider.getBalance(user2.address);

            expect(afterBal - beforeBal).to.be.closeTo(amount * 90n / 100n, ethers.parseEther("0.01"));
        });

        it("should handle pause flow: oracle anomaly during commit, revert, unpause success", async () => {
            await mineTo(await lbp.startTime() + 1n);
            const amount = ONE_ETH;
            const nonce = 99;
            const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

            // Тригеримо падіння ціни → oracle ставить паузу
            await feed.setPrice(ethers.parseUnits("1000", 8));
            await oracle.computeAdaptiveFee();

            await expect(lbp.connect(user1).commitBid(hash, { value: amount }))
                .to.be.revertedWith("paused by oracle");

            // Пропускаємо час паузи
            const pauseDuration = await oracle.pauseDuration();
            const now = await time.latest();
            await mineTo(BigInt(now) + pauseDuration + 1n);

            // Перевіряємо, що oracle розпаузавався
            expect(await oracle.isPaused()).to.be.false;

            // Щоб бути впевненими, що commit-вікно не закінчилося, пересуваємо LBP трохи вперед (на новий цикл)
            const commitEnd = await lbp.commitEnd();
            const revealEnd = await lbp.revealEnd();
            const endOfAuction = revealEnd + 10n;

            if ((await time.latest()) >= commitEnd) {
                // Пропускаємо весь старий аукціон і починаємо новий (імітаційно)
                // Це просто для тесту — у реальному світі це було б нове деплої
                const LBP = await ethers.getContractFactory("SecureLBP");
                const now2 = BigInt(await time.latest());
                const start2 = now2 + 10n;
                const commitEnd2 = start2 + 60n;
                const revealEnd2 = commitEnd2 + 60n;

                lbp = await LBP.deploy(
                    await token.getAddress(),
                    start2,
                    commitEnd2,
                    revealEnd2,
                    (await ethers.getSigners())[3].address,
                    POOL_START_WEIGHT,
                    POOL_END_WEIGHT,
                    POOL_SWAP_FEE,
                    (await ethers.getSigners())[4].address
                );
                await lbp.waitForDeployment();
                await lbp.connect(owner).setOracle(await oracle.getAddress());
                await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));

                const tx = await lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH });
                await tx.wait();

                pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
                await mineTo(start2 + 1n);

              const newHash = buildCommit(user1, amount, nonce, await lbp.getAddress());
                await lbp.connect(user1).commitBid(newHash, { value: amount });
            } else {
                await lbp.connect(user1).commitBid(hash, { value: amount });
            }

            await lbp.connect(user1).commitBid(hash, { value: amount });

            // Далі звичний reveal + finalize flow
            await mineTo(await lbp.commitEnd() + 1n);
            const netAmount = amount * 990n / 1000n;
            await pool.quoteETHForToken(netAmount);
            await lbp.connect(user1).revealBid(amount, nonce);

            const poolEndTime = await pool.endTime();
            await mineTo(poolEndTime + 1n);

            const beforePoolToken = await pool.reserveToken();
            const beforePoolETH = await pool.reserveETH();

            const tx2 = await lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address]);
            await tx2.wait();

            const vested = await vesting.allocations(user1.address);
            expect(vested).to.be.gt(0n);
            expect(await pool.reserveETH()).to.be.gt(beforePoolETH);
            expect(await pool.reserveToken()).to.be.lt(beforePoolToken);
        });




        it("should handle multiple users: commit/reveal/finalize, vesting sum, pool swap total", async () => {
            await mineTo(await lbp.startTime() + 1n);
            const amount1 = ONE_ETH;
            const amount2 = ethers.parseEther("2");
            const nonce1 = 99;
            const nonce2 = 100;
            const hash1 = buildCommit(user1, amount1, nonce1, await lbp.getAddress());
            const hash2 = buildCommit(user2, amount2, nonce2, await lbp.getAddress());

            await lbp.connect(user1).commitBid(hash1, { value: amount1 });
            await lbp.connect(user2).commitBid(hash2, { value: amount2 });

            await mineTo(await lbp.commitEnd() + 1n);
            const netAmount1 = amount1 * 990n / 1000n;
            const netAmount2 = amount2 * 990n / 1000n;
            await pool.quoteETHForToken(netAmount1);
            await pool.quoteETHForToken(netAmount2);
            await lbp.connect(user1).revealBid(amount1, nonce1);
            await lbp.connect(user2).revealBid(amount2, nonce2);

            const poolEndTime = await pool.endTime();
            await mineTo(poolEndTime + 1n);

            const beforePoolToken = await pool.reserveToken();
            const beforePoolETH = await pool.reserveETH();
            const user1Allocations = await lbp.allocations(user1.address);
            const user2Allocations = await lbp.allocations(user2.address);
            const collectedETH = await lbp.collectedETH();
            await pool.quoteETHForToken(collectedETH);

            const tx = await lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address, user2.address]);
            await tx.wait();

            const vested1 = await vesting.allocations(user1.address);
            const vested2 = await vesting.allocations(user2.address);
            expect(vested1).to.be.gt(0n);
            expect(vested2).to.be.gt(0n);
            expect(vested1 + vested2).to.equal(user1Allocations + user2Allocations);
            expect(await pool.reserveETH()).to.be.gt(beforePoolETH);
            expect(await pool.reserveToken()).to.be.lt(beforePoolToken);
            expect(await pool.reserveETH()).to.equal(beforePoolETH + collectedETH);
        });
    });
});