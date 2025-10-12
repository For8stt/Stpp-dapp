import { expect } from "chai";
import { ethers } from "hardhat";
import { network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";

// npx hardhat test test/PresaleManager/PresaleManager.test.ts
describe("PresaleManager", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, user1: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
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
        [owner, user1, treasury] = await ethers.getSigners();

        // Reset balances to ensure sufficient funds
        await network.provider.send("hardhat_setBalance", [
            owner.address,
            "0x" + (20000n * 10n**18n).toString(16)
        ]);
        await network.provider.send("hardhat_setBalance", [
            user1.address,
            "0x" + (20000n * 10n**18n).toString(16)
        ]);

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
    });

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateDutchAuctionBids(bidAmount: bigint) {
        await mineTo(startTime + 1n);
        await dutchAuction.placeBid({ value: bidAmount });
        // Process the bid
        await dutchAuction.settleBatch(100);
    }

    async function simulateLBPCommitAndReveal(user: any, amount: bigint, nonce: bigint) {
        const hash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, nonce, await secureLBP.getAddress()]
        );
        const lbpStart = BigInt(await secureLBP.startTime());
        await mineTo(lbpStart + 1n);
        // Commit with hash and value
        await secureLBP.connect(user).commitBid(hash, { value: amount });
        await mineTo(lbpStart + BigInt(LBP_COMMIT_DURATION) + 1n);
        await secureLBP.connect(user).revealBid(amount, nonce);
    }

    // --- TESTS ---
    describe("Deployment", () => {
        it("should deploy correctly with all contracts", async () => {
            expect(await presaleManager.token()).to.equal(await token.getAddress());
            expect(await presaleManager.treasury()).to.equal(treasury.address);
            expect(await presaleManager.softCap()).to.equal(SOFT_CAP);
            expect(await presaleManager.dutchAuction()).to.not.equal(ethers.ZeroAddress);
            expect(await presaleManager.secureLBP()).to.not.equal(ethers.ZeroAddress);
            expect(await presaleManager.vesting()).to.not.equal(ethers.ZeroAddress);
            expect(await dutchAuction.startTime()).to.equal(startTime);
            expect(await dutchAuction.endTime()).to.equal(startTime + BigInt(AUCTION_DURATION));
            expect(await secureLBP.startTime()).to.equal(startTime + BigInt(AUCTION_DURATION));
            expect(await secureLBP.commitEnd()).to.equal(
                startTime + BigInt(AUCTION_DURATION) + BigInt(LBP_COMMIT_DURATION)
            );
            expect(await secureLBP.revealEnd()).to.equal(
                startTime + BigInt(AUCTION_DURATION) + BigInt(LBP_COMMIT_DURATION) + BigInt(LBP_REVEAL_DURATION)
            );
            expect(await secureLBP.treasury()).to.equal(treasury.address);
            expect(await secureLBP.poolStartWeightToken()).to.equal(POOL_START_WEIGHT_TOKEN);
            expect(await secureLBP.poolEndWeightToken()).to.equal(POOL_END_WEIGHT_TOKEN);
            expect(await secureLBP.poolSwapFee()).to.equal(POOL_SWAP_FEE);
        });

        it("should revert on invalid constructor params", async () => {
            const PresaleManagerFactory = await ethers.getContractFactory("PresaleManager");
            await expect(
                PresaleManagerFactory.deploy({
                    token: ethers.ZeroAddress,
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
                })
            ).to.be.revertedWith("zero token");

            await expect(
                PresaleManagerFactory.deploy({
                    token: await token.getAddress(),
                    treasury: ethers.ZeroAddress, // zero treasury
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
                })
            ).to.be.revertedWith("zero treasury");

            const block = await ethers.provider.getBlock("latest");
            const now = BigInt(block!.timestamp);
            await expect(
                PresaleManagerFactory.deploy({
                    token: await token.getAddress(),
                    treasury: treasury.address,
                    softCap: SOFT_CAP,
                    startTime: now - 100n, // invalid start time (past)
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
                })
            ).to.be.revertedWith("invalid start time");

            await expect(
                PresaleManagerFactory.deploy({
                    token: await token.getAddress(),
                    treasury: treasury.address,
                    softCap: 0n, // zero soft cap
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
                })
            ).to.be.revertedWith("zero soft cap");

            await expect(
                PresaleManagerFactory.deploy({
                    token: await token.getAddress(),
                    treasury: treasury.address,
                    softCap: SOFT_CAP,
                    startTime: startTime,
                    auctionDuration: 0n, // invalid duration
                    lbpCommitDuration: BigInt(LBP_COMMIT_DURATION),
                    lbpRevealDuration: BigInt(LBP_REVEAL_DURATION),
                    startPrice: START_PRICE,
                    reservePrice: RESERVE_PRICE,
                    totalTokens: TOTAL_TOKENS,
                    earlyBonusDurationSeconds: BigInt(EARLY_BONUS_DURATION),
                    poolStartWeightToken: POOL_START_WEIGHT_TOKEN,
                    poolEndWeightToken: POOL_END_WEIGHT_TOKEN,
                    poolSwapFee: POOL_SWAP_FEE
                })
            ).to.be.revertedWith("Invalid times"); // From DutchAuction constructor
        });
    });

});