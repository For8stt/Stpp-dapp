import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";

// npx hardhat test test/Scenarios/SuccessScenarios.test.ts
describe("PresaleManager High Uptake Success", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, user1: any, user2: any, user3: any, user4: any, user5: any, user6: any, user7: any, user8: any, user9: any, user10: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const HIGH_UPTAKE_ETH = ethers.parseEther("500"); // High uptake: 500 ETH total from multiple users
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
        [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10, treasury] = await ethers.getSigners();

        // Reset balances to ensure sufficient funds for multiple users
        const users = [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10];
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
    });

    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateDutchAuctionHighUptake(users: any[], totalTargetETH: bigint) {
        await mineTo(startTime + 1n);
        const bidPerUser = totalTargetETH / BigInt(users.length);
        let totalBidded = 0n;

        for (const user of users) {
            const bidAmount = bidPerUser;
            await dutchAuction.connect(user).placeBid({ value: bidAmount });
            totalBidded += bidAmount;
        }

        // Process batches: Multiple calls to ensure all settled (high uptake simulation)
        let batchPointer = await dutchAuction.batchPointer();
        while (batchPointer < await dutchAuction.bidsCount()) {
            await dutchAuction.settleBatch(50); // Process in chunks of 50 for gas safety
            batchPointer = await dutchAuction.batchPointer();
        }

        return totalBidded;
    }

    async function simulateLBPHighUptake(users: any[], totalTargetETH: bigint) {
        const commitPerUser = totalTargetETH / BigInt(users.length);
        const nonceBase = 123n;
        const lbpStart = BigInt(await secureLBP.startTime());

        // Commit phase
        await mineTo(lbpStart + 1n);
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const nonce = nonceBase + BigInt(i);
            const hash = ethers.solidityPackedKeccak256(
                ["address", "uint256", "uint256", "address"],
                [user.address, commitPerUser, nonce, await secureLBP.getAddress()]
            );
            await secureLBP.connect(user).commitBid(hash, { value: commitPerUser });
        }

        // Reveal phase
        await mineTo(lbpStart + BigInt(LBP_COMMIT_DURATION) + 1n);
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const nonce = nonceBase + BigInt(i);
            await secureLBP.connect(user).revealBid(commitPerUser, nonce);
        }
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

    describe("High Uptake Success", () => {
        it("should complete successful presale with high uptake from multiple users", async () => {
            const users = [user1, user2, user3, user4, user5, user6, user7, user8, user9, user10]; // 10 users for high uptake
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.startPresale(tokenAmount))
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Dutch Auction Started");

            // Simulate high uptake in DA: 10 users bid total 500 ETH (> softCap)
            const daCollected = await simulateDutchAuctionHighUptake(users, HIGH_UPTAKE_ETH);
            expect(daCollected).to.equal(HIGH_UPTAKE_ETH);
            expect(await dutchAuction.collected()).to.equal(HIGH_UPTAKE_ETH);

            // Verify allocations for multiple users (with early bonus for first few)
            for (const user of users) {
                const allocation = await dutchAuction.allocations(user.address);
                expect(allocation).to.be.gt(0n); // Each gets tokens
            }

            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Finalize DA as PM to trigger transitionToLBP
            const remainingTokensBefore = tokenAmount - await dutchAuction.totalAllocatedTokens();
            const poolETH = (HIGH_UPTAKE_ETH * 50n) / 100n; // 50% for pool
            const poolTokens = (remainingTokensBefore * 50n) / 100n;

            await expect(callAsPresaleManager(dutchAuction, "finalize"))
                .to.emit(presaleManager, "TransitionToLBP")
                .withArgs(HIGH_UPTAKE_ETH, remainingTokensBefore)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");

            // Verify transition: Pool initialized with 50% ETH/tokens
            expect(await presaleManager.transitioned()).to.be.true;
            expect(await secureLBP.poolInitialized()).to.be.true;
            const poolBalanceETH = await ethers.provider.getBalance(await secureLBP.pool());
            const poolBalanceTokens = await token.balanceOf(await secureLBP.pool());
            expect(poolBalanceETH).to.be.closeTo(poolETH, ethers.parseEther("0.01")); // Approximate due to tx costs
            expect(poolBalanceTokens).to.be.closeTo(poolTokens, ethers.parseEther("1")); // Approximate

            // LBP phase: Same users commit/reveal total 40 ETH (4 ETH each < 5 ETH cap)
            const lbpTargetETH = ethers.parseEther("40");
            await simulateLBPHighUptake(users, lbpTargetETH);

            // Verify LBP allocations for multiple users
            let totalLBPAllocations = 0n;
            for (const user of users) {
                const allocation = await secureLBP.allocations(user.address);
                totalLBPAllocations += allocation;
                expect(allocation).to.be.gt(0n);
            }
            expect(totalLBPAllocations).to.be.gt(0n);

            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );

            // Finalize LBP as PM: Swap, transfer to vesting, callback to PM
            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            const vestingBefore = await token.balanceOf(await vesting.getAddress());
            const beneficiaries = users.map(u => u.address);

            const finalizeLBPtx = await callAsPresaleManager(secureLBP, "finalizeToVesting", await presaleManager.vesting(), beneficiaries);

            // Check LBP event
            await expect(finalizeLBPtx)
                .to.emit(secureLBP, "FinalizedToVesting")
                .withArgs(await presaleManager.vesting(), totalLBPAllocations);

            // Check PM finalize event (from callback) - liquidityAmount = 0 after swap
            await expect(finalizeLBPtx)
                .to.emit(presaleManager, "FundsWithdrawn")
                .withArgs(0n);

            // Check PM state
            expect(await presaleManager.finalized()).to.be.true;

            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            const liquidityWithdrawn = treasuryAfter - treasuryBefore;
            expect(liquidityWithdrawn).to.equal(0n); // 0 after full swap in LBP

            // Check vesting: Total tokens transferred
            const vestingAfter = await token.balanceOf(await vesting.getAddress());
            expect(vestingAfter - vestingBefore).to.equal(totalLBPAllocations);

            // Check allocations cleared in LBP
            for (const user of users) {
                expect(await secureLBP.allocations(user.address)).to.equal(0n);
            }

            // Check DA: Distributable, tokens can be distributed (simulate partial dist for one user)
            expect(await dutchAuction.distributable()).to.be.true;
            await dutchAuction.distributeTokens(0, 10); // Distribute first 10 bids (public, no connect needed)
            const user1TokensAfterDist = await token.balanceOf(user1.address);
            expect(user1TokensAfterDist).to.be.gt(0n); // User1 received DA tokens
        });
    });
});