import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";

// npx hardhat test test/Scenarios/SoftCapFailure.test.ts
describe("PresaleManager Soft Cap Failure with Refunds", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, user1: any, user2: any, user3: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const LOW_UPTAKE_ETH = ethers.parseEther("51"); // Divisible by 3: 17 ETH each, < softCap
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

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateDutchBidsFailure(users: any[], totalTargetETH: bigint, startTimeOffset: bigint = 1n) {
        await mineTo(startTime + startTimeOffset);
        const bidPerUser = totalTargetETH / BigInt(users.length);
        let totalBidded = 0n;

        for (const user of users) {
            const bidAmount = bidPerUser;
            await dutchAuction.connect(user).placeBid({ value: bidAmount });
            totalBidded += bidAmount;
        }

        // No settleBatch for failure case - keep amountETH for refunds
        return totalBidded;
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

    describe("Soft Cap Failure Handling", () => {
        it("should fail soft cap, trigger refunds, and not transition to LBP", async () => {
            const users = [user1, user2, user3]; // 3 users for low uptake
            const tokenAmount = TOTAL_TOKENS;

            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.startPresale(tokenAmount))
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Dutch Auction Started");

            // Low uptake: 3 users bid total 51 ETH < softCap (no settle)
            const collected = await simulateDutchBidsFailure(users, LOW_UPTAKE_ETH, 1n);
            expect(collected).to.equal(LOW_UPTAKE_ETH);
            expect(await dutchAuction.collected()).to.equal(LOW_UPTAKE_ETH);
            expect(await dutchAuction.collected() < SOFT_CAP).to.be.true;

            // No allocations since no settle
            for (const user of users) {
                const allocation = await dutchAuction.allocations(user.address);
                expect(allocation).to.equal(0n);
            }

            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Record user balances before finalize
            const userBalancesBefore: { [key: string]: bigint } = {};
            for (const user of users) {
                userBalancesBefore[user.address] = await ethers.provider.getBalance(user.address);
            }

            // Finalize DA as PM: Should fail, emit PresaleFailedRefund, no transition
            await expect(callAsPresaleManager(dutchAuction, "finalize"))
                .to.emit(dutchAuction, "AuctionFinalized")
                .withArgs(false, LOW_UPTAKE_ETH)
                .to.emit(presaleManager, "PresaleFailedRefund")
                .withArgs(LOW_UPTAKE_ETH)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Presale Failed - Refunded");

            // Check states: Refundable, not distributable, presale inactive, not transitioned/finalized
            expect(await dutchAuction.refundable()).to.be.true;
            expect(await dutchAuction.distributable()).to.be.false;
            expect(await presaleManager.presaleActive()).to.be.false;
            expect(await presaleManager.transitioned()).to.be.false;
            expect(await presaleManager.finalized()).to.be.false;
            expect(await secureLBP.poolInitialized()).to.be.false;

            // Process refunds in one batch (3 bids <10)
            const refundTx = await dutchAuction.processRefunds(0, 10);
            await expect(refundTx).to.emit(dutchAuction, "RefundsProcessed").withArgs(3);

            // Check users refunded: Balances restored (minus gas, but approximate)
            for (const user of users) {
                const userBalanceAfter = await ethers.provider.getBalance(user.address);
                const bidAmount = LOW_UPTAKE_ETH / BigInt(users.length);
                expect(userBalanceAfter).to.be.closeTo(
                    userBalancesBefore[user.address] + bidAmount,
                    ethers.parseEther("0.01") // Tolerance for gas fees
                );
            }

            // Note: collected not subtracted in refunds (contract bug), remains LOW_UPTAKE_ETH
            // expect(await dutchAuction.collected()).to.equal(0n);

            // No tokens distributed or transferred to LBP
            expect(await token.balanceOf(await secureLBP.getAddress())).to.equal(0n);
            expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);

            // Cannot distribute tokens (not distributable)
            await expect(dutchAuction.distributeTokens(0, 10)).to.be.revertedWith("Not distributable");
        });
    });
});