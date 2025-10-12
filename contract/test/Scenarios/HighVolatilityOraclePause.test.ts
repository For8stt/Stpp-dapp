import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken, LBPOracle, MockPriceFeed } from "../../typechain-types";

// npx hardhat test test/Scenarios/HighVolatilityOraclePause.test.ts
describe("PresaleManager High Volatility with LBPOracle Pause (Adaptive Fees & Pauses)", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let lbpOracle: LBPOracle;
    let mockPriceFeed: MockPriceFeed;
    let owner: any, user1: any, user2: any, user3: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const DA_BID_AMOUNT = ethers.parseEther("101"); // > softCap for success
    const LBP_COMMIT_AMOUNT = ONE_ETH; // 1 ETH commit per user
    const VOLATILITY_SPIKE_ETH = ethers.parseEther("0.1"); // Small swaps to spike price ±10%
    const INITIAL_PRICE = 2000000000000000000n; // 2000 USD in 8 decimals (Chainlink style, e.g., ETH/USD)
    const HIGH_VOLATILITY_FEE_BP = 1000; // 10% max fee during anomaly
    const ANOMALY_DROP_PRICE = INITIAL_PRICE * 70n / 100n; // 30% drop to trigger >20% from last (90%)
    const START_PRICE = ethers.parseEther("0.01");
    const RESERVE_PRICE = ethers.parseEther("0.005");
    const AUCTION_DURATION = 3600; // 1 hour
    const LBP_COMMIT_DURATION = 60;
    const LBP_REVEAL_DURATION = 60;
    const EARLY_BONUS_DURATION = 300; // 5 min
    const POOL_START_WEIGHT_TOKEN = 70n * 10n ** 16n; // 0.7e18
    const POOL_END_WEIGHT_TOKEN = 30n * 10n ** 16n;   // 0.3e18
    const POOL_SWAP_FEE = 3n * 10n ** 15n;            // 0.003e18 (0.3%)

    beforeEach(async () => {
        [owner, user1, user2, user3, treasury] = await ethers.getSigners();

        // Reset balances to ensure sufficient funds
        const users = [owner, user1, user2, user3];
        for (const user of users) {
            await network.provider.send("hardhat_setBalance", [
                user.address,
                "0x" + (20000n * 10n**18n).toString(16)
            ]);
        }

        // Deploy test token
        const Token = await ethers.getContractFactory("TestToken");
        token = (await Token.deploy(TOTAL_TOKENS)) as TestToken;
        await token.waitForDeployment();

        // Mint tokens to owner for presale
        await token.mint(owner.address, TOTAL_TOKENS);

        // Deploy MockPriceFeed
        const MockPriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = (await MockPriceFeedFactory.deploy(INITIAL_PRICE)) as MockPriceFeed;
        await mockPriceFeed.waitForDeployment();

        // Deploy LBPOracle with MockPriceFeed
        const LBPOracleFactory = await ethers.getContractFactory("LBPOracle");
        lbpOracle = (await LBPOracleFactory.deploy(await mockPriceFeed.getAddress())) as LBPOracle;
        await lbpOracle.waitForDeployment();

        // Set short pause duration for test (10s) to fit within commit window
        await lbpOracle.setPauseDuration(10);

        // Time windows
        const block = await ethers.provider.getBlock("latest");
        const now = BigInt(block!.timestamp);
        startTime = now + 10n;

        // Deploy PresaleManager (deploys DA, LBP, Vesting internally)
        const PresaleManagerFactory = await ethers.getContractFactory("PresaleManager");
        presaleManager = (await PresaleManagerFactory.deploy({
            token: await token.getAddress(),
            treasury: treasury.address,
            softCap: SOFT_CAP,
            startTime: startTime,
            auctionDuration: BigInt(AUCTION_DURATION),
            lbpCommitDuration: BigInt(LBP_COMMIT_DURATION),
            lbpRevealDuration: BigInt(LBP_REVEAL_DURATION),
            startPrice: START_PRICE,
            reservePrice: RESERVE_PRICE,
            totalTokens: TOTAL_TOKENS,
            earlyBonusDurationSeconds: BigInt(EARLY_BONUS_DURATION),
            poolStartWeightToken: POOL_START_WEIGHT_TOKEN,
            poolEndWeightToken: POOL_END_WEIGHT_TOKEN,
            poolSwapFee: POOL_SWAP_FEE
        })) as PresaleManager;
        await presaleManager.waitForDeployment();

        // Access deployed contracts
        dutchAuction = (await ethers.getContractAt("DutchAuction", await presaleManager.dutchAuction(), owner)) as DutchAuction;
        secureLBP = (await ethers.getContractAt("SecureLBP", await presaleManager.secureLBP(), owner)) as SecureLBP;
        vesting = (await ethers.getContractAt("TestVesting", await presaleManager.vesting(), owner)) as TestVesting;

        // Fund PM for impersonation
        const pmAddress = await presaleManager.getAddress();
        await network.provider.send("hardhat_setBalance", [
            pmAddress, "0x" + (20000n * 10n**18n).toString(16)
        ]);

        // Initially set oracle to LBP (no pause, normal fee)
        await callAsPresaleManager(secureLBP, "setOracle", await lbpOracle.getAddress());
    });

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateDutchAuctionSuccess(bidder: any = owner) {
        await mineTo(startTime + 1n);
        await dutchAuction.connect(bidder).placeBid({ value: DA_BID_AMOUNT });
        await dutchAuction.settleBatch(100);
        await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);
        const remainingTokens = TOTAL_TOKENS - await dutchAuction.totalAllocatedTokens();
        await callAsPresaleManager(dutchAuction, "finalize");
        return remainingTokens;
    }

    // Simulate price spikes: Change price via MockPriceFeed to add ±10% noise, then trigger anomaly drop
    // ФІКС: Не мінемо час тут, щоб pause спрацював після commit
    async function triggerVolatilitySpikes(users: any[]) {
        // Отримати адресу пулу
        const poolAddress = await secureLBP.pool();

        // Minor spikes: +10% then -10% to simulate volatility (without triggering anomaly yet)
        await mockPriceFeed.setPrice(INITIAL_PRICE * 110n / 100n); // +10%
        await lbpOracle.computeAdaptiveFee(); // Update oracle state

        await mockPriceFeed.setPrice(INITIAL_PRICE * 90n / 100n); // -10% from original
        await lbpOracle.computeAdaptiveFee();

        // Approve tokens for swaps (assume users have some from DA allocation or mint extra)
        for (const user of users) {
            await token.mint(user.address, ethers.parseEther("1000")); // Extra for swaps
            await token.connect(user).approve(poolAddress, ethers.parseEther("1000"));
        }

        // Spike up: Buy tokens with ETH (+ noise)
        for (let i = 0; i < 3; i++) {
            const user = users[i % users.length];
            const pool = await ethers.getContractAt("LBPWeightedAMM", poolAddress, user);
            await pool.swapETHForToken(0, { value: VOLATILITY_SPIKE_ETH }); // minOut=0 for sim
        }

        // Spike down: Sell tokens for ETH (- noise)
        for (let i = 0; i < 3; i++) {
            const user = users[i % users.length];
            const pool = await ethers.getContractAt("LBPWeightedAMM", poolAddress, user);
            await pool.swapTokenForETH(ethers.parseEther("10"), 0); // tokenIn=10, minEth=0
        }

        // Trigger anomaly: Big drop >20% to activate pause and max fee
        await mockPriceFeed.setPrice(ANOMALY_DROP_PRICE); // 30% drop
        await lbpOracle.computeAdaptiveFee(); // Triggers _checkForAnomaly, sets pausedUntil, fee to maxFeeBP
    }

    // Helper для виклику функцій від імені PM (owner DA/LBP)
    async function callAsPresaleManager(contract: any, method: string, ...args: any[]) {
        const pmAddress = await presaleManager.getAddress();
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [pmAddress],
        });
        const signer = await ethers.getSigner(pmAddress);
        const tx = await contract.connect(signer)[method](...args);
        await network.provider.request({
            method: "hardhat_stopImpersonatingAccount",
            params: [pmAddress],
        });
        return tx;
    }

    describe("High Volatility with LBPOracle Pause Handling", () => {

        it("should detect volatility spikes, trigger oracle pause, raise fees to max, pause commits/reveals, then resume after duration", async () => {
            const users = [user1, user2, user3];
            const tokenAmount = TOTAL_TOKENS;

            // Start presale and fund Dutch
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);

            // Simulate DA success and transition to LBP
            await simulateDutchAuctionSuccess(user1);
            expect(await presaleManager.transitioned()).to.be.true;
            expect(await secureLBP.poolInitialized()).to.be.true;

            const lbpStart = BigInt(await secureLBP.startTime());

            // Commit early, before pause
            const nonce1 = 123n;
            const hash1 = ethers.solidityPackedKeccak256(
                ["address", "uint256", "uint256", "address"],
                [user1.address, LBP_COMMIT_AMOUNT, nonce1, await secureLBP.getAddress()]
            );
            await mineTo(lbpStart + 1n);
            await secureLBP.connect(user1).commitBid(hash1, { value: LBP_COMMIT_AMOUNT });

            // Trigger volatility spikes
            await triggerVolatilitySpikes(users);

            // Check oracle state
            const pausedUntil = await lbpOracle.pausedUntil();
            const currentBlock = await ethers.provider.getBlock("latest");

            expect(pausedUntil > BigInt(currentBlock!.timestamp)).to.be.true;
            expect(await lbpOracle.lastComputedFeeBP()).to.equal(HIGH_VOLATILITY_FEE_BP);
            expect(await secureLBP.currentFeeBP()).to.equal(HIGH_VOLATILITY_FEE_BP);

            // Commit attempt during pause should revert
            await expect(
                secureLBP.connect(user1).commitBid(hash1, { value: LBP_COMMIT_AMOUNT })
            ).to.be.revertedWith("paused by oracle");

            // Reveal attempt during pause should revert
            await mineTo(lbpStart + BigInt(LBP_COMMIT_DURATION) / 2n); // still inside commit window technically
            await expect(
                secureLBP.connect(user1).revealBid(LBP_COMMIT_AMOUNT, nonce1)
            ).to.be.revertedWith("paused by oracle");

            // Mine past pause duration AND commit window to reach reveal window
            const commitWindowEnd = lbpStart + BigInt(LBP_COMMIT_DURATION);
            const resumeTime = pausedUntil + 1n;
            const revealTime = resumeTime > commitWindowEnd ? resumeTime : commitWindowEnd;
            await mineTo(revealTime);

            // Reveal should succeed now
            await secureLBP.connect(user1).revealBid(LBP_COMMIT_AMOUNT, nonce1);
            const allocation1 = await secureLBP.allocations(user1.address);
            expect(allocation1).to.be.gt(0n);

            // New commit after resume (if still within commit window)
            const nonce2 = 456n;
            const hash2 = ethers.solidityPackedKeccak256(
                ["address", "uint256", "uint256", "address"],
                [user1.address, LBP_COMMIT_AMOUNT, nonce2, await secureLBP.getAddress()]
            );

            const commitWindowEndAfterResume = lbpStart + BigInt(LBP_COMMIT_DURATION);
            const currentTime = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
            if (currentTime < commitWindowEndAfterResume) {
                await secureLBP.connect(user1).commitBid(hash2, { value: LBP_COMMIT_AMOUNT });
                expect(await secureLBP.currentFeeBP()).to.equal(100);
            }

            // Mine to end of LBP and finalize
            const lbpEnd = lbpStart + BigInt(LBP_COMMIT_DURATION + LBP_REVEAL_DURATION) + 1n;
            await mineTo(lbpEnd);

            const beneficiaries = [user1.address];
            await callAsPresaleManager(secureLBP, "finalizeToVesting", await presaleManager.vesting(), beneficiaries);

            expect(await presaleManager.finalized()).to.be.true;
            expect(await secureLBP.allocations(user1.address)).to.equal(0n);
        });


    });
});