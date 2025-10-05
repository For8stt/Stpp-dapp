import { expect } from "chai";
import { ethers } from "hardhat";
import { DutchAuction, IERC20, MockPresaleManager } from "../../typechain-types";
import { Signer } from "ethers";

// npx hardhat test test/DutchAuction/DutchAuctionGeneral.test.ts
describe("DutchAuction", () => {
    let token: IERC20;
    let auction: DutchAuction;
    let owner: Signer, alice: Signer, bob: Signer;

    const TOTAL_SUPPLY = ethers.parseEther("1000000");
    const TOTAL_TOKENS_FOR_SALE = ethers.parseEther("10000");
    const START_PRICE = ethers.parseEther("1");
    const RESERVE_PRICE = ethers.parseEther("0.1");
    const SOFT_CAP = ethers.parseEther("5");
    const EARLY_BONUS_DURATION = 60;

    let START_TIME: number;
    let END_TIME: number;

    beforeEach(async () => {
        [owner, alice, bob] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = (await Token.deploy(TOTAL_SUPPLY)) as IERC20;
        await token.waitForDeployment();

        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        START_TIME = latestBlock.timestamp + 20;
        END_TIME = START_TIME + 120;

        const Auction = await ethers.getContractFactory("DutchAuction");
        auction = (await Auction.deploy(
            await token.getAddress(),
            START_TIME,
            END_TIME,
            START_PRICE,
            RESERVE_PRICE,
            TOTAL_TOKENS_FOR_SALE,
            SOFT_CAP,
            EARLY_BONUS_DURATION,
            ethers.ZeroAddress // "0x0000000000000000000000000000000000000000"
        )) as DutchAuction;

        await auction.waitForDeployment();

        await token.transfer(await auction.getAddress(), TOTAL_TOKENS_FOR_SALE);

    });


    describe("DutchAuction batch settlement edge cases", () => {
        beforeEach(async () => {
            await ethers.provider.send("evm_setNextBlockTimestamp", [START_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
        });

        it("should not process already processed bids twice", async () => {
            await auction.connect(alice).placeBid({ value: ethers.parseEther("1") });
            await auction.connect(bob).placeBid({ value: ethers.parseEther("1") });

            await auction.settleBatch(10);

            const aliceTokensFirst = await auction.allocations(await alice.getAddress());
            const bobTokensFirst = await auction.allocations(await bob.getAddress());

            await auction.settleBatch(10);

            const aliceTokensSecond = await auction.allocations(await alice.getAddress());
            const bobTokensSecond = await auction.allocations(await bob.getAddress());

            expect(aliceTokensSecond).to.equal(aliceTokensFirst);
            expect(bobTokensSecond).to.equal(bobTokensFirst);
        });

        it("should not allocate more tokens than totalTokens", async () => {
            const totalTokens = await auction.totalTokens();

            const aliceBid = ethers.parseEther("5");
            const bobBid = ethers.parseEther("5");

            await auction.connect(alice).placeBid({ value: aliceBid });
            await auction.connect(bob).placeBid({ value: bobBid });

            await auction.settleBatch(10);

            const totalAllocated = await auction.totalAllocatedTokens();
            expect(totalAllocated).to.be.lte(totalTokens);
        });

        it("should correctly handle bids exceeding remaining tokens", async () => {
            const totalTokens = await auction.totalTokens();
            const price = await auction.getCurrentPrice();

            const aliceBid = (totalTokens * price * 8n) / 10n / 1_000_000_000_000_000_000n;
            await auction.connect(alice).placeBid({ value: aliceBid });

            const bobBid = ethers.parseEther("10");
            await auction.connect(bob).placeBid({ value: bobBid });

            await auction.settleBatch(10);

            const aliceTokens = await auction.allocations(await alice.getAddress());
            const bobTokens = await auction.allocations(await bob.getAddress());

            expect(aliceTokens + bobTokens).to.be.lte(totalTokens);
            expect(aliceTokens).to.be.gt(0n);
            expect(bobTokens).to.be.gte(0n);

            const remainingTokens = totalTokens - aliceTokens;
            expect(bobTokens).to.be.lte(remainingTokens);
        });

    });
    describe("DutchAuction edge ETH amounts", () => {
        beforeEach(async () => {
            await ethers.provider.send("evm_setNextBlockTimestamp", [START_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
        });

        it("should handle extremely small and extremely large bids", async () => {
            await auction.connect(alice).placeBid({ value: 1n });

            const largeBid = ethers.parseEther("100");
            await auction.connect(bob).placeBid({ value: largeBid });

            await auction.settleBatch(10);

            const aliceTokens = await auction.allocations(await alice.getAddress());
            const bobTokens = await auction.allocations(await bob.getAddress());

            expect(aliceTokens).to.be.gte(0n);
            expect(bobTokens).to.be.gt(0n);

            const totalTokens = await auction.totalTokens();
            expect(aliceTokens + bobTokens).to.be.lte(totalTokens);
        });

        it("should finalize successfully when total bids equal softCap", async () => {
            const softCap = await auction.softCap();

            const halfSoftCap = softCap / 2n;
            await auction.connect(alice).placeBid({ value: halfSoftCap });
            await auction.connect(bob).placeBid({ value: halfSoftCap });

            const latestBlock = await ethers.provider.getBlock("latest");
            const auctionEndTime = Math.max(latestBlock!.timestamp + 1, END_TIME + 1);
            await ethers.provider.send("evm_setNextBlockTimestamp", [auctionEndTime]);
            await ethers.provider.send("evm_mine", []);

            await auction.finalize();

            expect(await auction.distributable()).to.equal(true);
        });
    });


    describe("DutchAuction finalization", () => {
        let presaleManager: MockPresaleManager;

        beforeEach(async () => {
            const PresaleManager = await ethers.getContractFactory("MockPresaleManager");
            presaleManager = (await PresaleManager.deploy()) as MockPresaleManager;
            await presaleManager.waitForDeployment();

            const Auction = await ethers.getContractFactory("DutchAuction");
            auction = (await Auction.deploy(
                await token.getAddress(),
                START_TIME,
                END_TIME,
                START_PRICE,
                RESERVE_PRICE,
                TOTAL_TOKENS_FOR_SALE,
                SOFT_CAP,
                EARLY_BONUS_DURATION,
                await presaleManager.getAddress()
            )) as DutchAuction;
            await auction.waitForDeployment();

            await token.transfer(await auction.getAddress(), TOTAL_TOKENS_FOR_SALE);

            await ethers.provider.send("evm_setNextBlockTimestamp", [START_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
        });

        it("should prevent double finalization", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP });

            const remainingTokens = await auction.totalTokens() - await auction.totalAllocatedTokens();
            if (remainingTokens > 0n) {
                await token.transfer(await auction.getAddress(), remainingTokens);
            }

            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);

            await auction.finalize();
            await expect(auction.finalize()).to.be.revertedWith("Already finalized");
        });

        it("should set distributable if softCap reached", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP });

            const remainingTokens = await auction.totalTokens() - await auction.totalAllocatedTokens();
            if (remainingTokens > 0n) {
                await token.transfer(await auction.getAddress(), remainingTokens);
            }

            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);

            await auction.finalize();

            expect(await auction.distributable()).to.equal(true);
            expect(await auction.refundable()).to.equal(false);
        });

        it("should set refundable if softCap not reached", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP / 2n });
            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);

            await auction.finalize();

            expect(await auction.refundable()).to.equal(true);
            expect(await auction.distributable()).to.equal(false);
        });

        it("should notify presaleManager upon finalization", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP });
            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);

            await token.transfer(await auction.getAddress(), TOTAL_TOKENS_FOR_SALE);

            await expect(auction.finalize())
                .to.emit(presaleManager, "TransitionToLBPCalled")
                .withArgs(SOFT_CAP, await auction.totalTokens() - await auction.totalAllocatedTokens());
        });
    });

    describe("DutchAuction Withdraw & Recover", () => {
        beforeEach(async () => {
            await ethers.provider.send("evm_setNextBlockTimestamp", [START_TIME + 1]);
            await ethers.provider.send("evm_mine", []);

            await token.transfer(await auction.getAddress(), TOTAL_TOKENS_FOR_SALE);
        });

        it("owner cannot withdraw ETH before finalize", async () => {
            await auction.connect(alice).placeBid({ value: ethers.parseEther("1") });

            await expect(auction.withdrawProceeds()).to.be.revertedWith("Finalize first");

            const RandomToken = await ethers.getContractFactory("TestToken");
            const randomToken = await RandomToken.deploy(ethers.parseEther("1000"));
            await randomToken.waitForDeployment();

            await randomToken.transfer(await auction.getAddress(), ethers.parseEther("10"));

            await expect(
                auction.recoverERC20(await randomToken.getAddress(), ethers.parseEther("10"))
            ).to.not.be.reverted;

            await expect(
                auction.recoverERC20(await token.getAddress(), ethers.parseEther("10"))
            ).to.be.revertedWith("Cannot recover sale token");
        });


        it("owner cannot withdraw non-sale tokens", async () => {
            const randomToken = await (await ethers.getContractFactory("TestToken")).deploy(ethers.parseEther("1000"));
            await randomToken.waitForDeployment();

            await expect(
                auction.recoverERC20(await randomToken.getAddress(), ethers.parseEther("10"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("withdrawProceeds works only after finalize", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP });

            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
            await auction.finalize();

            await expect(auction.withdrawProceeds()).to.changeEtherBalances(
                [auction, owner],
                [SOFT_CAP * -1n, SOFT_CAP]
            );
        });
        it("emergencyWithdrawETH works only after finalize", async () => {
            await expect(
                auction.emergencyWithdrawETH(ethers.parseEther("1"))
            ).to.be.revertedWith("Emergency withdraw failed");

            await auction.connect(alice).placeBid({ value: SOFT_CAP });
            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
            await auction.finalize();

            const ownerBalanceBefore = await ethers.provider.getBalance(owner);
            await auction.emergencyWithdrawETH(ethers.parseEther("1"));
            const ownerBalanceAfter = await ethers.provider.getBalance(owner);

            expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
        });


    });

    describe("DutchAuction Reentrancy / Security", () => {
        beforeEach(async () => {
            await ethers.provider.send("evm_setNextBlockTimestamp", [START_TIME + 1]);
            await ethers.provider.send("evm_mine", []);

            await token.transfer(await auction.getAddress(), TOTAL_TOKENS_FOR_SALE);
        });

        it("should prevent double distributeTokens for same bids", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP });

            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
            await auction.finalize();

            await auction.distributeTokens(0, 10);

            await expect(auction.distributeTokens(0, 10))
                .to.not.be.reverted;

            const aliceBalance = await token.balanceOf(alice);
            expect(aliceBalance).to.be.lte(TOTAL_TOKENS_FOR_SALE);
        });

        it("should prevent double processRefunds for same bids", async () => {
            await auction.connect(alice).placeBid({ value: SOFT_CAP / 2n });

            await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
            await ethers.provider.send("evm_mine", []);
            await auction.finalize();

            await auction.processRefunds(0, 10);

            const aliceBalanceBefore = await ethers.provider.getBalance(alice);
            await auction.processRefunds(0, 10);
            const aliceBalanceAfter = await ethers.provider.getBalance(alice);

            expect(aliceBalanceAfter).to.equal(aliceBalanceBefore);
        });

        it("fallback and receive should revert if sent ETH directly", async () => {
            await expect(
                alice.sendTransaction({ to: auction.getAddress(), value: ethers.parseEther("1") })
            ).to.be.revertedWith("Use placeBid()");

            await expect(
                owner.sendTransaction({ to: auction.getAddress(), value: ethers.parseEther("1") })
            ).to.be.revertedWith("Use placeBid()");
        });
    });


});
