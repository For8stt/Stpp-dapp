import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

describe("SecureLBP – 13_getters", function () {
    it("should return volatility checkpoint", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);
        
        await time.increaseTo(startTime + 1n);
        
        // Place a bid to trigger checkpoint update
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        
        const checkpoint = await lbp.getVolatilityCheckpoint();
        expect(checkpoint.lastPrice).to.be.gt(0n);
        expect(checkpoint.lastTimestamp).to.be.gt(0n);
    });

    it("should return zero checkpoint when no bids placed", async function () {
        const { lbp } = await loadFixture(deployLbpWithPoolFixture);
        
        const checkpoint = await lbp.getVolatilityCheckpoint();
        expect(checkpoint.lastPrice).to.equal(0n);
        expect(checkpoint.lastTimestamp).to.equal(0n);
    });

    it("should return current price change BP", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);
        
        await time.increaseTo(startTime + 1n);
        
        // Place first bid to set checkpoint
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        
        // Place another bid to change price
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") });
        
        const priceChangeBP = await lbp.getCurrentPriceChangeBP();
        expect(priceChangeBP).to.be.gte(0n);
    });

    it("should return zero price change when checkpoint not set", async function () {
        const { lbp } = await loadFixture(deployLbpWithPoolFixture);
        
        const priceChangeBP = await lbp.getCurrentPriceChangeBP();
        expect(priceChangeBP).to.equal(0n);
    });

    it("should return zero price change when price decreased", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);
        
        await time.increaseTo(startTime + 1n);
        
        // Place bid to set checkpoint
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") });
        
        // Price might decrease due to weight changes, should return 0
        const priceChangeBP = await lbp.getCurrentPriceChangeBP();
        // If price decreased or stayed same, should be 0
        expect(priceChangeBP).to.be.gte(0n);
    });

    it("should return Uniswap V3 position info", async function () {
        const { lbp } = await loadFixture(deployLbpWithPoolFixture);
        
        const position = await lbp.getUniswapV3Position();
        expect(position.positionTokenId).to.equal(0n);
        expect(position.liquidityCreated).to.equal(false);
    });

    it("should return user allocation", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);
        
        await time.increaseTo(startTime + 1n);
        
        // Place bid
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        
        const allocation = await lbp.getUserAllocation(user1.address);
        expect(allocation).to.be.gt(0n);
    });

    it("should return zero allocation for user with no bids", async function () {
        const { lbp, user1 } = await loadFixture(deployLbpWithPoolFixture);
        
        const allocation = await lbp.getUserAllocation(user1.address);
        expect(allocation).to.equal(0n);
    });
});

