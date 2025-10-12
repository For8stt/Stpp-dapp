import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";

// npx hardhat test test/Scenarios/BotFrontRunning.test.ts
describe("PresaleManager Bot Front-Running Simulation", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, normalUser1: any, normalUser2: any, normalUser3: any, normalUser4: any, normalUser5: any, normalUser6: any, normalUser7: any, normalUser8: any, bot1: any, bot2: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const NORMAL_BID_ETH = ethers.parseEther("7.5"); // Normal users: 7.5 ETH each
    const BOT_BID_ETH = ethers.parseEther("25"); // Bots: high value 25 ETH each (20% of total uptake)
    const TOTAL_NORMAL_UPTAKE = ethers.parseEther("60"); // 8 normal * 7.5 = 60 ETH
    const TOTAL_BOT_UPTAKE = ethers.parseEther("50"); // 2 bots * 25 = 50 ETH
    const TOTAL_UPTAKE = TOTAL_NORMAL_UPTAKE + TOTAL_BOT_UPTAKE; // 110 ETH > softCap
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
        [owner, normalUser1, normalUser2, normalUser3, normalUser4, normalUser5, normalUser6, normalUser7, normalUser8, bot1, bot2, treasury] = await ethers.getSigners();

        const users = [owner, normalUser1, normalUser2, normalUser3, normalUser4, normalUser5, normalUser6, normalUser7, normalUser8, bot1, bot2];
        for (const user of users) {
            await network.provider.send("hardhat_setBalance", [
                user.address,
                "0x" + (20000n * 10n**18n).toString(16)
            ]);
        }

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

        // Fund PM for impersonation FIRST
        const pmAddress = await presaleManager.getAddress();
        await network.provider.send("hardhat_setBalance", [
            pmAddress, "0x" + (20000n * 10n**18n).toString(16)
        ]);

        // Increase max cap for bots in LBP
        await callAsPresaleManager(secureLBP, "setMaxContributionPerAddress", ethers.parseEther("30"));
    });

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateBotEarlyBidsDA(bots: any[], botBidAmount: bigint, earlyOffset: bigint = 1n) {
        await mineTo(startTime + earlyOffset); // Early for bonus
        let totalBotBidded = 0n;
        for (const bot of bots) {
            await dutchAuction.connect(bot).placeBid({ value: botBidAmount });
            totalBotBidded += botBidAmount;
        }
        // Settle first batch immediately (simulate sniping)
        await dutchAuction.settleBatch(100);
        return totalBotBidded;
    }

    async function simulateNormalBidsDA(normals: any[], normalBidAmount: bigint, laterOffset: bigint) {
        await mineTo(startTime + laterOffset);
        let totalNormalBidded = 0n;
        for (const normal of normals) {
            await dutchAuction.connect(normal).placeBid({ value: normalBidAmount });
            totalNormalBidded += normalBidAmount;
        }
        // Settle subsequent batches
        let batchPointer = await dutchAuction.batchPointer();
        while (batchPointer < await dutchAuction.bidsCount()) {
            await dutchAuction.settleBatch(50);
            batchPointer = await dutchAuction.batchPointer();
        }
        return totalNormalBidded;
    }

    async function simulateLBPCommitRevealWithBots(lbpUsers: any[], amounts: bigint[], nonces: bigint[], isBot: boolean[] = []) {
        const lbpStart = BigInt(await secureLBP.startTime());
        const commitPhaseEnd = lbpStart + BigInt(LBP_COMMIT_DURATION);
        // Commit phase: Bots commit early, normals late (simulate front-running sniping before deadline)
        // Ensure we mine to exactly lbpStart to avoid skipping the window
        await mineTo(lbpStart);
        for (let i = 0; i < lbpUsers.length; i++) {
            if (isBot[i]) {
                // Bot commits high value early
                const hash = ethers.solidityPackedKeccak256(
                    ["address", "uint256", "uint256", "address"],
                    [lbpUsers[i].address, amounts[i], nonces[i], await secureLBP.getAddress()]
                );
                await secureLBP.connect(lbpUsers[i]).commitBid(hash, { value: amounts[i] });
            }
        }

        // For normals, mine earlier to account for timestamp increments per tx (2 normals)
        await mineTo(commitPhaseEnd - 2n); // Late commit for normals (sniping attempt), with buffer for 2 tx
        for (let i = 0; i < lbpUsers.length; i++) {
            if (!isBot[i]) {
                const hash = ethers.solidityPackedKeccak256(
                    ["address", "uint256", "uint256", "address"],
                    [lbpUsers[i].address, amounts[i], nonces[i], await secureLBP.getAddress()]
                );
                await secureLBP.connect(lbpUsers[i]).commitBid(hash, { value: amounts[i] });
            }
        }

        // Reveal phase: All reveal after commit end
        await mineTo(commitPhaseEnd + 1n);
        for (let i = 0; i < lbpUsers.length; i++) {
            await secureLBP.connect(lbpUsers[i]).revealBid(amounts[i], nonces[i]);
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

    describe("Bot Front-Running Resistance", () => {
        it("should resist bot front-running in DA and LBP via batching and commit-reveal", async () => {
            const normalUsers = [normalUser1, normalUser2, normalUser3, normalUser4, normalUser5, normalUser6, normalUser7, normalUser8];
            const bots = [bot1, bot2];
            const tokenAmount = TOTAL_TOKENS;

            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.startPresale(tokenAmount))
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Dutch Auction Started");

            // DA: Bots bid high early (bonus + first batch sniping)
            const botCollected = await simulateBotEarlyBidsDA(bots, BOT_BID_ETH, 1n);
            expect(botCollected).to.equal(TOTAL_BOT_UPTAKE);

            // Normals bid later (different batches)
            const normalCollected = await simulateNormalBidsDA(normalUsers, NORMAL_BID_ETH, BigInt(EARLY_BONUS_DURATION + 100));
            expect(normalCollected).to.equal(TOTAL_NORMAL_UPTAKE);

            expect(await dutchAuction.collected()).to.equal(TOTAL_UPTAKE);
            expect(await dutchAuction.collected() >= SOFT_CAP).to.be.true;

            // Verify allocations
            let totalBotAlloc = 0n;
            let totalNormalAlloc = 0n;
            for (const bot of bots) {
                const alloc = await dutchAuction.allocations(bot.address);
                totalBotAlloc += alloc;
                expect(alloc).to.be.gt(0n);
            }
            for (const normal of normalUsers) {
                const alloc = await dutchAuction.allocations(normal.address);
                totalNormalAlloc += alloc;
                expect(alloc).to.be.gt(0n);
            }
            const expectedBotShare = (TOTAL_BOT_UPTAKE * 105n * (10n ** 18n) / 100n) / START_PRICE;
            expect(totalBotAlloc).to.be.closeTo(expectedBotShare, ethers.parseEther("100"));

            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Finalize DA as PM
            const remainingTokens = tokenAmount - await dutchAuction.totalAllocatedTokens();
            await expect(callAsPresaleManager(dutchAuction, "finalize"))
                .to.emit(presaleManager, "TransitionToLBP")
                .withArgs(TOTAL_UPTAKE, remainingTokens)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");

            expect(await presaleManager.transitioned()).to.be.true;
            expect(await secureLBP.poolInitialized()).to.be.true;

            // LBP: 4 users (2 normal + 2 bots)
            const lbpUsers = [normalUser1, normalUser2, bot1, bot2];
            const lbpAmounts = [NORMAL_BID_ETH, NORMAL_BID_ETH, BOT_BID_ETH, BOT_BID_ETH];
            const lbpNonces = [123n, 124n, 125n, 126n];
            const isBotArray = [false, false, true, true];
            await simulateLBPCommitRevealWithBots(lbpUsers, lbpAmounts, lbpNonces, isBotArray);

            let totalLBPAlloc = 0n;
            let botLBPAlloc = 0n;
            const amounts: bigint[] = [];
            for (let i = 0; i < lbpUsers.length; i++) {
                const alloc = await secureLBP.allocations(lbpUsers[i].address);
                amounts.push(alloc);
                totalLBPAlloc += alloc;
                if (isBotArray[i]) botLBPAlloc += alloc;
                expect(alloc).to.be.gt(0n);
            }

            // Check proportionality: bots should get allocation proportional to their bid amount (resistance to timing attacks)
            const totalLBPBid = BOT_BID_ETH * 2n + NORMAL_BID_ETH * 2n;
            const expectedBotShareBP = (BOT_BID_ETH * 2n * 10000n) / totalLBPBid;
            const actualBotShareBP = (botLBPAlloc * 10000n) / totalLBPAlloc;
            expect(actualBotShareBP).to.be.within(expectedBotShareBP - 1000n, expectedBotShareBP + 1000n);


            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );

            // Finalize LBP as PM
            const vestingBefore = await token.balanceOf(await vesting.getAddress());
            const beneficiaries = lbpUsers.map(u => u.address);

            const finalizeTx = await callAsPresaleManager(
                secureLBP,
                "finalizeToVesting",
                await presaleManager.vesting(),
                beneficiaries
            );
            await finalizeTx.wait();

            expect(await presaleManager.finalized()).to.be.true;
            const vestingAfter = await token.balanceOf(await vesting.getAddress());
            expect(vestingAfter - vestingBefore).to.equal(totalLBPAlloc);

            for (const user of lbpUsers) {
                expect(await secureLBP.allocations(user.address)).to.equal(0n);
            }

            expect(await dutchAuction.distributable()).to.be.true;
        });
    });
});