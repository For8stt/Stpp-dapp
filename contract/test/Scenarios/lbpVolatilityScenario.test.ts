import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

const SCALE = 10n ** 18n;

async function calculatePoolSnapshot(pool: any) {
    const reserveEth = await pool.reserveETH();
    const reserveToken = await pool.reserveToken();
    const [weightToken, weightEth] = await pool.currentWeights();

    if (reserveToken === 0n || weightEth === 0n) {
        return {
            reserveEth,
            reserveToken,
            tokenValue: 0n,
            ethValue: reserveEth,
            pricePerToken: 0n
        };
    }

    const priceStep = (reserveEth * weightToken) / reserveToken;
    const pricePerToken = (priceStep * SCALE) / weightEth;
    const tokenValue = (reserveToken * pricePerToken) / SCALE;

    return {
        reserveEth,
        reserveToken,
        tokenValue,
        ethValue: reserveEth,
        pricePerToken
    };
}

describe("Scenario – LBP volatility, rebalancing, and unwind", function () {
    it("simulates trading bursts, oracle pause, rebalance, and final unwind", async function () {
        const ctx = await loadFixture(deployLbpWithPoolFixture);
        const { lbp, pool, owner, user1, user2, treasury, token, priceFeed, oracle, startTime, endTime } = ctx;

        const lbpAddress = await lbp.getAddress();

        const [tokenWeightStart, ethWeightStart] = await pool.currentWeights();
        expect(tokenWeightStart).to.equal(ethers.parseUnits("0.7", 18));
        expect(ethWeightStart).to.equal(ethers.parseUnits("0.3", 18));

        await time.increaseTo(startTime + 1n);
        await expect(lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(await user1.getAddress(), ethers.parseEther("2"), anyValue, anyValue, anyValue);

        await expect(lbp.connect(user2).placeBid(0, { value: ethers.parseEther("1.5") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(await user2.getAddress(), ethers.parseEther("1.5"), anyValue, anyValue, anyValue);

        const midpoint = startTime + (endTime - startTime) / 2n;
        await time.increaseTo(midpoint);
        const [tokenWeightMid, ethWeightMid] = await pool.currentWeights();
        expect(tokenWeightMid).to.equal(ethers.parseUnits("0.5", 18));
        expect(ethWeightMid).to.equal(ethers.parseUnits("0.5", 18));

        // Set pause duration
        await oracle.setPauseDuration(120);
        
        // Lower the price jump threshold significantly to make it easier to trigger pause in test
        // Default is 10% (1000 BP), we'll set it to 1% (100 BP) for testing
        await oracle.setPriceJumpThreshold(100);
        
        // Increase max contribution cap to allow large buy for price anomaly detection
        await lbp.connect(owner).setMaxContributionPerAddress(ethers.parseEther("20"));
        
        // Set reference price (needed for oracle to work properly)
        await priceFeed.setPrice(ethers.parseUnits("1200", 8));
        
        // First, establish a baseline by calling computeAdaptiveFee
        // This sets lastLbpSpotPrice so we can detect price jumps
        await oracle.computeAdaptiveFee(await lbp.pool());
        
        // Make a series of smaller buys to gradually increase price, then a large buy to trigger anomaly
        // This approach helps accumulate price increase
        await lbp.connect(user2).placeBid(0, { value: ethers.parseEther("3") });
        await oracle.computeAdaptiveFee(await lbp.pool());
        
        // Now make a large buy that should trigger the price anomaly (>1% increase)
        // Use user2 who has contributed 1.5 + 3 = 4.5 ETH, so has 15.5 ETH remaining capacity
        await expect(lbp.connect(user2).placeBid(0, { value: ethers.parseEther("10") }))
            .to.be.revertedWithCustomError(lbp, "OraclePausedError");
        
        // Verify that pause was activated after the large buy
        expect(await oracle.isPaused(await lbp.pool())).to.equal(true);

        await expect(lbp.connect(user1).placeBid(0, { value: ethers.parseEther("0.5") }))
            .to.be.revertedWithCustomError(lbp, "OraclePausedError");

        await time.increase(180);
        await oracle.computeAdaptiveFee(await lbp.pool());

        await expect(lbp.connect(user1).placeBid(0, { value: ethers.parseEther("0.75") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(await user1.getAddress(), ethers.parseEther("0.75"), anyValue, anyValue, anyValue);

        await time.increaseTo(endTime + 2n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), lbpAddress);
        await escrow.waitForDeployment();

        const finalizeTx = await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());
        await expect(finalizeTx)
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), await lbp.totalTokensAllocated());

        const snapshotAfterFinalize = await calculatePoolSnapshot(pool);
        let tokensSupplied = 0n;
        if (snapshotAfterFinalize.tokenValue > snapshotAfterFinalize.ethValue) {
            const ethNeeded = snapshotAfterFinalize.tokenValue - snapshotAfterFinalize.ethValue;
            const tx = await lbp.connect(owner).rebalanceTo5050({ value: ethNeeded });
            await expect(tx).to.emit(lbp, "PoolRebalancedTo5050").withArgs(ethNeeded, 0);
            await tx.wait();
        } else if (snapshotAfterFinalize.ethValue > snapshotAfterFinalize.tokenValue && snapshotAfterFinalize.pricePerToken > 0n) {
            const diff = snapshotAfterFinalize.ethValue - snapshotAfterFinalize.tokenValue;
            const tokenAmount = (diff * SCALE) / snapshotAfterFinalize.pricePerToken;
            expect(tokenAmount).to.be.gt(0n);
            await token.mint(await owner.getAddress(), tokenAmount);
            await token.connect(owner).approve(lbpAddress, tokenAmount);
            const tx = await lbp.connect(owner).rebalanceTo5050();
            await expect(tx).to.emit(lbp, "PoolRebalancedTo5050").withArgs(0, tokenAmount);
            await tx.wait();
            tokensSupplied = tokenAmount;
        }

        const unwindTx = await lbp.connect(owner).unwindAllLiquidity();
        await expect(unwindTx).to.emit(lbp, "FullUnwindExecuted");

        const poolLpBalance = await pool.balanceLP(lbpAddress);
        expect(poolLpBalance).to.equal(0n);

        const contractBalance = await ethers.provider.getBalance(lbpAddress);
        if (contractBalance > 0n) {
            await expect(lbp.connect(owner).withdrawETH(contractBalance))
                .to.emit(lbp, "WithdrawnETH")
                .withArgs(await treasury.getAddress(), contractBalance);
        }

    });
});
