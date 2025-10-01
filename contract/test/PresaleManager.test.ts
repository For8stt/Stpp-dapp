import { expect } from "chai";
import { ethers } from "hardhat";
import { network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../typechain-types";

// npx hardhat test test/PresaleManager.test.ts
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
        presaleManager = (await PresaleManagerFactory.deploy(
            await token.getAddress(),
            treasury.address,
            startTime,
            AUCTION_DURATION,
            LBP_COMMIT_DURATION,
            LBP_REVEAL_DURATION,
            START_PRICE,
            RESERVE_PRICE,
            TOTAL_TOKENS,
            SOFT_CAP,
            EARLY_BONUS_DURATION
        )) as PresaleManager;
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
        });

        it("should revert on invalid constructor params", async () => {
            const PresaleManagerFactory = await ethers.getContractFactory("PresaleManager");
            await expect(
                PresaleManagerFactory.deploy(
                    ethers.ZeroAddress,
                    treasury.address,
                    startTime,
                    AUCTION_DURATION,
                    LBP_COMMIT_DURATION,
                    LBP_REVEAL_DURATION,
                    START_PRICE,
                    RESERVE_PRICE,
                    TOTAL_TOKENS,
                    SOFT_CAP,
                    EARLY_BONUS_DURATION
                )
            ).to.be.revertedWith("zero token");

            await expect(
                PresaleManagerFactory.deploy(
                    await token.getAddress(),
                    ethers.ZeroAddress, // zero treasury
                    startTime,
                    AUCTION_DURATION,
                    LBP_COMMIT_DURATION,
                    LBP_REVEAL_DURATION,
                    START_PRICE,
                    RESERVE_PRICE,
                    TOTAL_TOKENS,
                    SOFT_CAP,
                    EARLY_BONUS_DURATION
                )
            ).to.be.revertedWith("zero treasury");

            const block = await ethers.provider.getBlock("latest");
            const now = BigInt(block!.timestamp);
            await expect(
                PresaleManagerFactory.deploy(
                    await token.getAddress(),
                    treasury.address,
                    now - 100n, // invalid start time (past)
                    AUCTION_DURATION,
                    LBP_COMMIT_DURATION,
                    LBP_REVEAL_DURATION,
                    START_PRICE,
                    RESERVE_PRICE,
                    TOTAL_TOKENS,
                    SOFT_CAP,
                    EARLY_BONUS_DURATION
                )
            ).to.be.revertedWith("invalid start time");

            await expect(
                PresaleManagerFactory.deploy(
                    await token.getAddress(),
                    treasury.address,
                    startTime,
                    0, // invalid duration
                    LBP_COMMIT_DURATION,
                    LBP_REVEAL_DURATION,
                    START_PRICE,
                    RESERVE_PRICE,
                    TOTAL_TOKENS,
                    SOFT_CAP,
                    EARLY_BONUS_DURATION
                )
            ).to.be.revertedWith("invalid durations");
        });
    });

    describe("startPresale", () => {
        it("should start presale and transfer tokens to DutchAuction", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.startPresale(tokenAmount))
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Dutch Auction Started");
            expect(await token.balanceOf(await dutchAuction.getAddress())).to.equal(tokenAmount);
            expect(await token.balanceOf(await presaleManager.getAddress())).to.equal(0);
        });

        it("should revert on zero tokens", async () => {
            await expect(presaleManager.startPresale(0)).to.be.revertedWith("zero tokens");
        });

        it("should revert on insufficient tokens", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await expect(presaleManager.startPresale(tokenAmount)).to.be.revertedWith("insufficient tokens");
        });

        it("should revert if called by non-owner", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.connect(user1).startPresale(tokenAmount)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
    });

    describe("transitionToLBP", () => {
        it("should transition to LBP after DutchAuction finalize", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            await simulateDutchAuctionBids(ONE_ETH);
            const actualAllocated = await dutchAuction.totalAllocatedTokens();
            const expectedRemaining = tokenAmount - actualAllocated;
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);
            await expect(presaleManager.transitionToLBP())
                .to.emit(presaleManager, "TokensTransferred")
                .withArgs(await dutchAuction.getAddress(), await secureLBP.getAddress(), expectedRemaining)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");
            expect(await token.balanceOf(await secureLBP.getAddress())).to.equal(expectedRemaining);
        });

        it("should revert if called by non-owner", async () => {
            await expect(presaleManager.connect(user1).transitionToLBP()).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("should handle full sale in DA (remaining = 0)", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            // Bid near end at ~reserve price
            await mineTo(startTime + BigInt(AUCTION_DURATION) - 10n);
            await dutchAuction.placeBid({ value: ethers.parseEther("6000") });
            await dutchAuction.settleBatch(100);
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);
            await expect(presaleManager.transitionToLBP())
                .to.emit(presaleManager, "TokensTransferred")
                .withArgs(await dutchAuction.getAddress(), await secureLBP.getAddress(), 0n)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");
            expect(await token.balanceOf(await secureLBP.getAddress())).to.equal(0n);
        });
    });

    describe("finalizePresale", () => {
        it("should finalize presale: vest tokens and withdraw 30% ETH to treasury", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            await simulateDutchAuctionBids(ONE_ETH);
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);
            await presaleManager.transitionToLBP();
            // Simulate LBP: commit/reveal to collect ETH
            const lbpAmount = ONE_ETH;
            await simulateLBPCommitAndReveal(user1, lbpAmount, 123n);
            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );
            const beneficiaries = [user1.address];
            const expectedLiquidity = (lbpAmount * 30n) / 100n; // 30% of collected ETH
            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            await expect(presaleManager.finalizePresale(beneficiaries, []))
                .to.emit(presaleManager, "FundsWithdrawn")
                .withArgs(expectedLiquidity)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Presale Finalized");
            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            expect(treasuryAfter - treasuryBefore).to.equal(expectedLiquidity);
        });

        it("should revert if called by non-owner", async () => {
            await expect(presaleManager.connect(user1).finalizePresale([], [])).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("should handle zero collected ETH (no withdraw)", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);
            await presaleManager.transitionToLBP();  // Tokens transferred, but no LBP bids
            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );
            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            await expect(presaleManager.finalizePresale([user1.address], []))
                .to.emit(presaleManager, "FundsWithdrawn")
                .withArgs(0)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Presale Finalized");
            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            expect(treasuryAfter).to.equal(treasuryBefore); // No ETH withdrawn
        });
    });

    describe("setTreasury", () => {
        it("should set new treasury", async () => {
            const newTreasury = user1.address;
            await presaleManager.setTreasury(newTreasury);
            expect(await presaleManager.treasury()).to.equal(newTreasury);
        });

        it("should revert on zero address", async () => {
            await expect(presaleManager.setTreasury(ethers.ZeroAddress)).to.be.revertedWith("zero treasury");
        });

        it("should revert if called by non-owner", async () => {
            await expect(presaleManager.connect(user1).setTreasury(user1.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
    });

    describe("Full Flow", () => {
        it("should complete full presale flow successfully", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await expect(presaleManager.startPresale(tokenAmount))
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Dutch Auction Started");
            // Simulate DA small sale to leave tokens for LBP
            await simulateDutchAuctionBids(ONE_ETH);
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);
            await expect(presaleManager.transitionToLBP())
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");
            // LBP phase
            const lbpAmount = ONE_ETH;
            await simulateLBPCommitAndReveal(user1, lbpAmount, 123n);
            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );
            // Finalize
            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            await expect(presaleManager.finalizePresale([user1.address], []))
                .to.emit(presaleManager, "FundsWithdrawn")
                .withArgs((lbpAmount * 30n) / 100n)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Presale Finalized");
            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            expect(treasuryAfter - treasuryBefore).to.equal((lbpAmount * 30n) / 100n);
        });
    });
});