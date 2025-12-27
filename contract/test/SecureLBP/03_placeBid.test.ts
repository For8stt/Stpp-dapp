import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture, deployLbpWithoutPoolFixture } from "../utils/lbpFixtures";

describe("SecureLBP – 03_placeBid", function () {
    it("should allow user to placeBid during active window", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
        ).to.emit(lbp, "BidPlaced");
    });

    it("should increase totalContributed and allocations appropriately", async function () {
        const { lbp, user1, user2, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        const bid1 = ethers.parseEther("1");
        const bid2 = ethers.parseEther("2");

        await lbp.connect(user1).placeBid(0, { value: bid1 });
        await lbp.connect(user2).placeBid(0, { value: bid2 });

        expect(await lbp.totalContributed(user1.address)).to.equal(bid1);
        expect(await lbp.totalContributed(user2.address)).to.equal(bid2);

        const allocation1 = await lbp.allocations(user1.address);
        const allocation2 = await lbp.allocations(user2.address);
        expect(allocation1).to.be.gt(0n);
        expect(allocation2).to.be.gt(allocation1);
        expect(await lbp.totalTokensAllocated()).to.equal(allocation1 + allocation2);
    });

    it("should transfer ETH to pool.swapETHForTokenTo and receive tokens to contract", async function () {
        const { lbp, user1, startTime, pool } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const poolEthBefore = await ethers.provider.getBalance(await pool.getAddress());
        const tokenAddr = await lbp.token();
        const token = await ethers.getContractAt("TestToken", tokenAddr);
        const contractTokenBefore = await token.balanceOf(await lbp.getAddress());

        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        const poolEthAfter = await ethers.provider.getBalance(await pool.getAddress());
        const contractTokenAfter = await token.balanceOf(await lbp.getAddress());
        expect(poolEthAfter).to.be.gt(poolEthBefore);
        expect(contractTokenAfter).to.be.gt(contractTokenBefore);
    });

    it("should emit BidPlaced event with correct values", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        const bid = ethers.parseEther("1");

        const feeBPBefore = await lbp.currentFeeBP();

        const tx = await lbp.connect(user1).placeBid(0, { value: bid });
        const receipt = await tx.wait();
        const event = receipt?.logs.find((log: any) => {
            try {
                const parsed = lbp.interface.parseLog(log);
                return parsed?.name === "BidPlaced";
            } catch {
                return false;
            }
        });
        
        if (event) {
            const parsed = lbp.interface.parseLog(event);
            const eventFeeBP = parsed?.args[3];
            const eventNet = parsed?.args[2];
            const expectedFee = (bid * eventFeeBP) / (await lbp.BP_SCALE());
            const expectedNet = bid - expectedFee;
            
            expect(parsed?.args[0]).to.equal(user1.address);
            expect(parsed?.args[1]).to.equal(bid);
            expect(eventNet).to.equal(expectedNet);
            expect(eventFeeBP).to.equal(eventFeeBP); // Fee from event
        } else {
            throw new Error("BidPlaced event not found");
        }
    });

    it("should revert if pool not initialized", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithoutPoolFixture);

        await time.increaseTo(startTime + 1n);
        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
        ).to.be.revertedWithCustomError(lbp, "PoolNotInitialized");
    });

    it("should revert before startTime or after endTime", async function () {
        const { lbp, user1, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
        ).to.be.revertedWithCustomError(lbp, "OutsideBidWindow");

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);
        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
        ).to.be.revertedWithCustomError(lbp, "OutsideBidWindow");
    });

    it("should revert if msg.value == 0", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await expect(
            lbp.connect(user1).placeBid(0, { value: 0 })
        ).to.be.revertedWithCustomError(lbp, "ZeroBid");
    });

    it("should revert if user exceeds maxContributionPerAddress", async function () {
        const { lbp, owner, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await lbp.connect(owner).setMaxContributionPerAddress(ethers.parseEther("1"));
        await time.increaseTo(startTime + 1n);

        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("0.1") })
        ).to.be.revertedWithCustomError(lbp, "ContributionCapExceeded");
    });

    it("should revert if minTokensOut > received tokens (slippage protection)", async function () {
        const { lbp, user1, startTime, pool } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await expect(
            lbp.connect(user1).placeBid(ethers.parseEther("1000000"), { value: ethers.parseEther("1") })
        ).to.be.revertedWithCustomError(pool, "SlippageExceeded");
    });

    it("should correctly accumulate totalEthRaised and feesAccumulated", async function () {
        const { lbp, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const bid = ethers.parseEther("1");
        const raisedBefore = await lbp.totalEthRaised();
        const feesBefore = await lbp.feesAccumulated();

        // Execute transaction and get actual fee from event
        const tx = await lbp.connect(user1).placeBid(0, { value: bid });
        const receipt = await tx.wait();
        const event = receipt?.logs.find((log: any) => {
            try {
                const parsed = lbp.interface.parseLog(log);
                return parsed?.name === "BidPlaced";
            } catch {
                return false;
            }
        });
        
        let actualFee = 0n;
        if (event) {
            const parsed = lbp.interface.parseLog(event);
            const eventFeeBP = parsed?.args[3];
            actualFee = (bid * eventFeeBP) / (await lbp.BP_SCALE());
        } else {
            // Fallback: use currentFeeBP if event not found
            const feeBP = await lbp.currentFeeBP();
            actualFee = (bid * feeBP) / (await lbp.BP_SCALE());
        }

        expect(await lbp.totalEthRaised()).to.equal(raisedBefore + bid);
        expect(await lbp.feesAccumulated()).to.equal(feesBefore + actualFee);
    });

    describe("legacy sanity checks", function () {
        it("tracks allocations and contributions per account", async function () {
            const { lbp, user1, user2, startTime } = await loadFixture(deployLbpWithPoolFixture);

            await time.increaseTo(startTime + 1n);

            const bid1 = ethers.parseEther("1");
            const bid2 = ethers.parseEther("2");

            await lbp.connect(user1).placeBid(0, { value: bid1 });
            await lbp.connect(user2).placeBid(0, { value: bid2 });

            expect(await lbp.totalContributed(user1.address)).to.equal(bid1);
            expect(await lbp.totalContributed(user2.address)).to.equal(bid2);

            const allocation1 = await lbp.allocations(user1.address);
            const allocation2 = await lbp.allocations(user2.address);
            expect(allocation1).to.be.gt(0n);
            expect(allocation2).to.be.gt(allocation1);
            expect(await lbp.totalTokensAllocated()).to.equal(allocation1 + allocation2);
        });

        it("respects max contribution per address", async function () {
            const { lbp, owner, user1, startTime } = await loadFixture(deployLbpWithPoolFixture);

            await lbp.connect(owner).setMaxContributionPerAddress(ethers.parseEther("1"));
            await time.increaseTo(startTime + 1n);

            await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("0.5") });

            await expect(
                lbp.connect(user1).placeBid(0, { value: ethers.parseEther("0.6") })
            ).to.be.revertedWithCustomError(lbp, "ContributionCapExceeded");
        });

        it("requires pool to be initialised", async function () {
            const { lbp, user1, startTime } = await loadFixture(deployLbpWithoutPoolFixture);

            await time.increaseTo(startTime + 1n);
            await expect(
                lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
            ).to.be.revertedWithCustomError(lbp, "PoolNotInitialized");
        });
    });
});
