import { expect } from "chai";
import { ethers } from "hardhat";
import { DutchAuction, IERC20 } from "../typechain-types";
import { Signer } from "ethers";

//npx hardhat test test/DutchAuction.test.ts
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

        // Deploy the token
        const Token = await ethers.getContractFactory("TestToken");
        token = (await Token.deploy(TOTAL_SUPPLY)) as IERC20;
        await token.waitForDeployment();

        // Get the timestamp of the latest Hardhat block
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        // Set START_TIME and END_TIME relative to the block timestamp
        START_TIME = latestBlock.timestamp + 20; // 20 seconds in the future
        END_TIME = START_TIME + 120; // auction duration 120 seconds

        // Deploy the auction
        const Auction = await ethers.getContractFactory("DutchAuction");
        auction = (await Auction.deploy(
            await token.getAddress(),
            START_TIME,
            END_TIME,
            START_PRICE,
            RESERVE_PRICE,
            TOTAL_TOKENS_FOR_SALE,
            SOFT_CAP,
            EARLY_BONUS_DURATION
        )) as DutchAuction;
        await auction.waitForDeployment();

        // Transfer tokens to the auction
        await token.transfer(await auction.getAddress(), TOTAL_TOKENS_FOR_SALE);
    });

    it("should deploy correctly", async () => {
        expect(await token.balanceOf(await auction.getAddress())).to.equal(
            TOTAL_TOKENS_FOR_SALE
        );
    });

    it("should calculate current price correctly", async () => {
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch the latest block");

        const nextBlockTime = Math.max(latestBlock.timestamp + 1, START_TIME);
        await ethers.provider.send("evm_setNextBlockTimestamp", [nextBlockTime]);
        await ethers.provider.send("evm_mine", []);

        const price = await auction.getCurrentPrice();
        expect(price).to.be.closeTo(START_PRICE, ethers.parseEther("0.08")); // 0.08 ETH tolerance
    });

    it("should allow bids after start", async () => {
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        const bidTime = Math.max(latestBlock.timestamp + 1, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [bidTime]);
        await ethers.provider.send("evm_mine", []);

        await auction.connect(alice).placeBid({ value: ethers.parseEther("1") });
        const bid = await auction.bids(0);

        expect(bid.bidder).to.equal(await alice.getAddress());
        expect(bid.amountETH).to.equal(ethers.parseEther("1"));
    });

    it("should settle a batch and allocate tokens", async () => {
        // Get the latest block
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        const bidTime = Math.max(latestBlock.timestamp + 1, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [bidTime]);
        await ethers.provider.send("evm_mine", []);

        await auction.connect(alice).placeBid({ value: ethers.parseEther("1") });
        await auction.connect(bob).placeBid({ value: ethers.parseEther("2") });

        await auction.settleBatch(10);

        const aliceAlloc = await auction.allocations(await alice.getAddress());
        const bobAlloc = await auction.allocations(await bob.getAddress());

        expect(aliceAlloc).to.be.gt(0n);
        expect(bobAlloc).to.be.gt(0n);
    });

    it("should finalize with success if softCap reached", async () => {
        // Get the latest block
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        // Move to auction phase
        const bidTime = Math.max(latestBlock.timestamp + 1, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [bidTime]);
        await ethers.provider.send("evm_mine", []);

        // Place bids
        await auction.connect(alice).placeBid({ value: ethers.parseEther("3") });
        await auction.connect(bob).placeBid({ value: ethers.parseEther("2") });

        // Move time to auction end
        const latestBlock2 = await ethers.provider.getBlock("latest");
        if (!latestBlock2) throw new Error("Failed to fetch latest block");
        const auctionEndTime = Math.max(latestBlock2.timestamp + 1, END_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [auctionEndTime]);
        await ethers.provider.send("evm_mine", []);

        await auction.finalize();

        expect(await auction.distributable()).to.equal(true);
    });

    it("should finalize with fail if softCap not reached", async () => {
        // 1. Get the latest block
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        // 2. Move to auction phase (+5 seconds buffer)
        const bidTime = Math.max(latestBlock.timestamp + 5, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [bidTime]);
        await ethers.provider.send("evm_mine", []);

        // 3. Place a bid
        await auction.connect(alice).placeBid({ value: ethers.parseEther("1") });

        // 4. Move time to auction end (+1 second buffer)
        const latestBlock2 = await ethers.provider.getBlock("latest");
        if (!latestBlock2) throw new Error("Failed to fetch latest block2");
        const auctionEndTime = Math.max(latestBlock2.timestamp + 1, END_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [auctionEndTime]);
        await ethers.provider.send("evm_mine", []);

        // 5. Finalize auction
        await auction.finalize();

        // 6. Check refundable flag
        expect(await auction.refundable()).to.equal(true);
    });

    it("should distribute tokens after success", async () => {
        const latestBlock = await ethers.provider.getBlock("latest");
        const auctionStartTime = Math.max(latestBlock!.timestamp + 1, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [auctionStartTime]);
        await ethers.provider.send("evm_mine", []);

        await auction.connect(alice).placeBid({ value: ethers.parseEther("3") });
        await auction.connect(bob).placeBid({ value: ethers.parseEther("2") });

        await auction.settleBatch(10);

        const latestBlock2 = await ethers.provider.getBlock("latest");
        const auctionEndTime = Math.max(latestBlock2!.timestamp + 1, END_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [auctionEndTime]);
        await ethers.provider.send("evm_mine", []);

        await auction.finalize();

        await auction.distributeTokens(0, 10);

        const balanceAlice = await token.balanceOf(await alice.getAddress());
        const balanceBob = await token.balanceOf(await bob.getAddress());

        expect(balanceAlice).to.be.gt(0n);
        expect(balanceBob).to.be.gt(0n);
    });

    it("should refund ETH after failure", async () => {
        // Get the latest block
        const latestBlock = await ethers.provider.getBlock("latest");
        if (!latestBlock) throw new Error("Failed to fetch latest block");

        // Move time to auction phase
        const bidTime = Math.max(latestBlock.timestamp + 1, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [bidTime]);
        await ethers.provider.send("evm_mine", []);

        // Place a bid
        await auction.connect(alice).placeBid({ value: ethers.parseEther("1") });

        // Move time to auction end
        const latestBlock2 = await ethers.provider.getBlock("latest");
        if (!latestBlock2) throw new Error("Failed to fetch latest block2");
        const auctionEndTime = Math.max(latestBlock2.timestamp + 1, END_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [auctionEndTime]);
        await ethers.provider.send("evm_mine", []);

        // Finalize auction
        await auction.finalize();

        // Check ETH refund
        await expect(
            auction.connect(alice).processRefunds(0, 10)
        ).to.changeEtherBalances(
            [auction, alice],
            [ethers.parseEther("-1"), ethers.parseEther("1")]
        );
    });

    it("should let owner withdraw proceeds after success", async () => {
        // 1. Move time to auction phase
        const latestBlock = await ethers.provider.getBlock("latest");
        const bidTime = Math.max(latestBlock!.timestamp + 1, START_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [bidTime]);
        await ethers.provider.send("evm_mine", []);

        // 2. Place bids
        await auction.connect(alice).placeBid({ value: ethers.parseEther("3") });
        await auction.connect(bob).placeBid({ value: ethers.parseEther("3") });

        // 3. Settle batches if necessary
        await auction.settleBatch(10);

        // 4. Move time to auction end
        const latestBlock2 = await ethers.provider.getBlock("latest");
        const auctionEndTime = Math.max(latestBlock2!.timestamp + 1, END_TIME + 1);
        await ethers.provider.send("evm_setNextBlockTimestamp", [auctionEndTime]);
        await ethers.provider.send("evm_mine", []);

        // 5. Finalize auction
        await auction.finalize();

        // 6. Check owner withdrawal
        await expect(auction.withdrawProceeds()).to.changeEtherBalances(
            [auction, owner],
            [ethers.parseEther("-6"), ethers.parseEther("6")]
        );
    });

});
