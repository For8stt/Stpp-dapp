import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";

// npx hardhat test test/Scenarios/LowUptakeAdjustment.test.ts
describe("PresaleManager Low Uptake with Reserve Adjustment", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, user1: any, user2: any, user3: any, user4: any, user5: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const INITIAL_LOW_UPTAKE_ETH = ethers.parseEther("48"); // Divisible by 3 users: 16 ETH each
    const ADDITIONAL_UPTAKE_ETH = ethers.parseEther("62"); // Divisible by 2 users: 31 ETH each, total 110 ETH
    const START_PRICE = ethers.parseEther("0.01");
    const INITIAL_RESERVE_PRICE = ethers.parseEther("0.005");
    const ADJUSTED_RESERVE_PRICE = ethers.parseEther("0.002"); // Lower to encourage more bids
    const AUCTION_DURATION = 3600; // 1 hour
    const LBP_COMMIT_DURATION = 60;
    const LBP_REVEAL_DURATION = 60;
    const EARLY_BONUS_DURATION = 300; // 5 min
    const POOL_START_WEIGHT_TOKEN = 70n * 10n ** 16n; // 0.7e18
    const POOL_END_WEIGHT_TOKEN = 30n * 10n ** 16n;   // 0.3e18
    const POOL_SWAP_FEE = 3n * 10n ** 15n;            // 0.003e18 (0.3%)

    beforeEach(async () => {
        [owner, user1, user2, user3, user4, user5, treasury] = await ethers.getSigners();

        // Reset balances to ensure sufficient funds
        const users = [owner, user1, user2, user3, user4, user5];
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
            reservePrice: INITIAL_RESERVE_PRICE,
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

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateDutchBids(users: any[], totalTargetETH: bigint, startTimeOffset: bigint = 1n) {
        await mineTo(startTime + startTimeOffset);
        const bidPerUser = totalTargetETH / BigInt(users.length);
        let totalBidded = 0n;

        for (const user of users) {
            const bidAmount = bidPerUser;
            await dutchAuction.connect(user).placeBid({ value: bidAmount });
            totalBidded += bidAmount;
        }

        // Process batches
        let batchPointer = await dutchAuction.batchPointer();
        while (batchPointer < await dutchAuction.bidsCount()) {
            await dutchAuction.settleBatch(50);
            batchPointer = await dutchAuction.batchPointer();
        }

        return totalBidded;
    }

    async function simulateLBPCommitAndReveal(users: any[], totalTargetETH: bigint) {
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

    describe("Low Uptake with Adjustment", () => {
        it("should adjust reserve price on low uptake and succeed after additional bids", async () => {
            const initialUsers = [user1, user2, user3]; // Fewer users for low uptake
            const additionalUsers = [user4, user5]; // Additional after adjustment
            const lbpUsers = [user1, user4]; // Subset for LBP
            const tokenAmount = TOTAL_TOKENS;

            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.startPresale(tokenAmount))
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Dutch Auction Started");

            // Initial low uptake: 3 users bid total 48 ETH < softCap
            const initialCollected = await simulateDutchBids(initialUsers, INITIAL_LOW_UPTAKE_ETH, 1n);
            expect(initialCollected).to.equal(INITIAL_LOW_UPTAKE_ETH);
            expect(await dutchAuction.collected()).to.equal(INITIAL_LOW_UPTAKE_ETH);
            expect(await dutchAuction.collected() < SOFT_CAP).to.be.true;

            // Owner adjusts reserve price down to mitigate waiting game (as PM)
            const oldReserve = await dutchAuction.reservePrice();
            await expect(callAsPresaleManager(dutchAuction, "adjustReservePrice", ADJUSTED_RESERVE_PRICE))
                .to.emit(dutchAuction, "ReserveAdjusted")
                .withArgs(oldReserve, ADJUSTED_RESERVE_PRICE);
            expect(await dutchAuction.reservePrice()).to.equal(ADJUSTED_RESERVE_PRICE);

            // Additional bids after adjustment: 2 more users, total now 110 ETH > softCap
            const additionalCollected = await simulateDutchBids(additionalUsers, ADDITIONAL_UPTAKE_ETH, BigInt(AUCTION_DURATION / 2)); // Mid-auction
            const totalDACollected = initialCollected + additionalCollected;
            expect(totalDACollected).to.equal(ethers.parseEther("110"));
            expect(await dutchAuction.collected()).to.equal(totalDACollected);
            expect(await dutchAuction.collected() >= SOFT_CAP).to.be.true;

            // Verify allocations for all users
            for (const user of [...initialUsers, ...additionalUsers]) {
                const allocation = await dutchAuction.allocations(user.address);
                expect(allocation).to.be.gt(0n);
            }

            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Finalize DA as PM to trigger transitionToLBP
            const remainingTokensBefore = tokenAmount - await dutchAuction.totalAllocatedTokens();
            const poolETH = (totalDACollected * 50n) / 100n; // 55 ETH
            const poolTokens = (remainingTokensBefore * 50n) / 100n;

            await expect(callAsPresaleManager(dutchAuction, "finalize"))
                .to.emit(presaleManager, "TransitionToLBP")
                .withArgs(totalDACollected, remainingTokensBefore)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");

            expect(await presaleManager.transitioned()).to.be.true;
            expect(await secureLBP.poolInitialized()).to.be.true;

            // Verify pool balances exact
            const poolAddress = await secureLBP.pool();
            expect(await ethers.provider.getBalance(poolAddress)).to.equal(poolETH);
            expect(await token.balanceOf(poolAddress)).to.equal(poolTokens);

            // LBP phase: Low uptake, 2 users commit/reveal 10 ETH
            const lbpTargetETH = ethers.parseEther("10");
            await simulateLBPCommitAndReveal(lbpUsers, lbpTargetETH);

            let totalLBPAllocations = 0n;
            for (const user of lbpUsers) {
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

            // Finalize LBP as PM
            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            const vestingBefore = await token.balanceOf(await vesting.getAddress());
            const beneficiaries = lbpUsers.map(u => u.address);

            const finalizeLBPtx = await callAsPresaleManager(secureLBP, "finalizeToVesting", await presaleManager.vesting(), beneficiaries);

            await expect(finalizeLBPtx)
                .to.emit(secureLBP, "FinalizedToVesting")
                .withArgs(await presaleManager.vesting(), totalLBPAllocations);

            await expect(finalizeLBPtx)
                .to.emit(presaleManager, "FundsWithdrawn")
                .withArgs(0n); // 0 after swap

            expect(await presaleManager.finalized()).to.be.true;

            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            expect(treasuryAfter - treasuryBefore).to.equal(0n);

            const vestingAfter = await token.balanceOf(await vesting.getAddress());
            expect(vestingAfter - vestingBefore).to.equal(totalLBPAllocations);

            // Allocations cleared
            for (const user of lbpUsers) {
                expect(await secureLBP.allocations(user.address)).to.equal(0n);
            }

            // DA distributable
            expect(await dutchAuction.distributable()).to.be.true;
            await dutchAuction.distributeTokens(0, 20); // Cover all bids
            const user1TokensAfterDist = await token.balanceOf(user1.address);
            expect(user1TokensAfterDist).to.be.gt(0n);
        });
    });
});