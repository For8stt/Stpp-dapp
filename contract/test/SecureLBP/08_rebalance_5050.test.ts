import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithBidsFixture, deployLbpWithPoolFixture } from "../utils/lbpFixtures";

const SCALE = 10n ** 18n;

async function deployEscrow(tokenAddress: string, lbpAddress: string) {
    const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await Escrow.deploy(tokenAddress, lbpAddress);
    await escrow.waitForDeployment();
    return escrow;
}

async function finalizedFixture() {
    const context = await deployLbpWithBidsFixture();
    const { lbp, owner, token } = context;
    const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());
    await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());
    return { ...context, escrow };
}

async function overwriteStorageValue(address: string, current: bigint, replacement: bigint) {
    const provider = ethers.provider;
    for (let i = 0; i < 200; i++) {
        const slotValue = BigInt(await provider.getStorage(address, i));
        if (slotValue === current) {
            await provider.send("hardhat_setStorageAt", [
                address,
                ethers.toBeHex(i, 32),
                ethers.toBeHex(replacement, 32)
            ]);
            return;
        }
    }
    throw new Error("storage slot not found");
}

async function calculatePoolValues(pool: any) {
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
    const ethValue = reserveEth;


    return {
        reserveEth,
        reserveToken,
        tokenValue,
        ethValue,
        pricePerToken
    };
}

async function tokenHeavyFixture() {
    const context = await finalizedFixture();
    const { pool } = context;
    const poolAddress = await pool.getAddress();

    const currentEndWeight = await pool.endWeightToken();
    const newEndWeight = ethers.parseUnits("0.8", 18);
    await overwriteStorageValue(poolAddress, currentEndWeight, newEndWeight);

    const balanced = await calculatePoolValues(pool);
    expect(balanced.tokenValue).to.be.gt(balanced.ethValue);

    return context;
}

describe("SecureLBP – 08_rebalance_5050", function () {
    describe("success paths", function () {
        it("should rebalance pool to 50/50 when token value > ETH value by adding ETH", async function () {
            const { lbp, owner, pool } = await loadFixture(tokenHeavyFixture);
            const valuesBefore = await calculatePoolValues(pool);

            expect(valuesBefore.tokenValue).to.be.gt(valuesBefore.ethValue);

            const ethNeeded = valuesBefore.tokenValue - valuesBefore.ethValue;
            expect(ethNeeded).to.be.gt(0n);
            const reserveEthBefore = await pool.reserveETH();

            const tx = await lbp.connect(owner).rebalanceTo5050({ value: ethNeeded });
            await expect(tx).to.emit(lbp, "PoolRebalancedTo5050").withArgs(ethNeeded, 0);
            await tx.wait();

            const reserveEthAfter = await pool.reserveETH();
            expect(reserveEthAfter - reserveEthBefore).to.equal(ethNeeded);
        });

        it("should rebalance by adding tokens when ETH value > token value", async function () {
            const { lbp, owner, pool, token } = await loadFixture(finalizedFixture);
            const valuesBefore = await calculatePoolValues(pool);

            expect(valuesBefore.ethValue).to.be.gt(valuesBefore.tokenValue);
            expect(valuesBefore.pricePerToken).to.be.gt(0n);

            const diff = valuesBefore.ethValue - valuesBefore.tokenValue;
            const tokensNeeded = (diff * SCALE) / valuesBefore.pricePerToken;
            expect(tokensNeeded).to.be.gt(0n);
            const reserveTokenBefore = await pool.reserveToken();

            await token.mint(owner.address, tokensNeeded);
            await token.connect(owner).approve(await lbp.getAddress(), tokensNeeded);

            const tx = await lbp.connect(owner).rebalanceTo5050();
            await expect(tx).to.emit(lbp, "PoolRebalancedTo5050").withArgs(0, tokensNeeded);
            await tx.wait();

            const reserveTokenAfter = await pool.reserveToken();
            expect(reserveTokenAfter - reserveTokenBefore).to.equal(tokensNeeded);
        });

        it("should refund excess ETH if msg.value > needed", async function () {
            const { lbp, owner, pool } = await loadFixture(tokenHeavyFixture);
            const valuesBefore = await calculatePoolValues(pool);
            const ethNeeded = valuesBefore.tokenValue - valuesBefore.ethValue;
            expect(ethNeeded).to.be.gt(0n);

            const extra = ethers.parseEther("1");
            const reserveBefore = await pool.reserveETH();

            const tx = await lbp.connect(owner).rebalanceTo5050({ value: ethNeeded + extra });
            const receipt = await tx.wait();

            const reserveAfter = await pool.reserveETH();
            expect(reserveAfter - reserveBefore).to.equal(ethNeeded);

            const event = receipt.logs
                .map((log) => {
                    try {
                        return lbp.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find((ev) => ev && ev.name === "PoolRebalancedTo5050");

            expect(event).to.not.be.null;
            expect(event!.args.ethAdded).to.equal(ethNeeded);
        });

        it("should emit PoolRebalancedTo5050 event", async function () {
            const { lbp, owner, pool, token } = await loadFixture(finalizedFixture);
            const valuesBefore = await calculatePoolValues(pool);
            const diff = valuesBefore.ethValue - valuesBefore.tokenValue;
            const tokensNeeded = (diff * SCALE) / valuesBefore.pricePerToken;
            expect(diff).to.be.gt(0n);
            expect(tokensNeeded).to.be.gt(0n);

            await token.mint(owner.address, tokensNeeded);
            await token.connect(owner).approve(await lbp.getAddress(), tokensNeeded);

            await expect(lbp.connect(owner).rebalanceTo5050()).to.emit(lbp, "PoolRebalancedTo5050");
        });
    });

    describe("Reverts", function () {
        it("should revert if called before finalize", async function () {
            const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
            await expect(lbp.connect(owner).rebalanceTo5050()).to.be.revertedWithCustomError(lbp, "NotFinalized");
        });

        it("should revert if reserves are zero", async function () {
            const { lbp, owner, pool, token } = await loadFixture(finalizedFixture);
            const lbpAddress = await lbp.getAddress();

            await lbp.connect(owner).unwindAllLiquidity();

            const reserves = await pool.reserveETH();
            expect(reserves).to.equal(0n);
            expect(await token.balanceOf(lbpAddress)).to.be.gt(0n);

            await expect(lbp.connect(owner).rebalanceTo5050()).to.be.revertedWithCustomError(lbp, "EmptyPool");
        });

        it("should revert if already balanced", async function () {
            const { lbp, owner, pool } = await loadFixture(finalizedFixture);
            const poolAddress = await pool.getAddress();

            const currentEndWeight = await pool.endWeightToken();
            const currentStartWeight = await pool.startWeightToken();
            const halfWeight = ethers.parseUnits("0.5", 18);
            await overwriteStorageValue(poolAddress, currentEndWeight, halfWeight);
            await overwriteStorageValue(poolAddress, currentStartWeight, halfWeight);

            const reserveEth = await pool.reserveETH();
            const reserveToken = await pool.reserveToken();
            const targetReserve = reserveEth < reserveToken ? reserveEth : reserveToken;
            await overwriteStorageValue(poolAddress, reserveEth, targetReserve);
            await overwriteStorageValue(poolAddress, reserveToken, targetReserve);

            const finalValues = await calculatePoolValues(pool);
            const diff =
                finalValues.ethValue > finalValues.tokenValue
                    ? finalValues.ethValue - finalValues.tokenValue
                    : finalValues.tokenValue - finalValues.ethValue;
            expect(diff).to.be.lte(1_000_000_000_000_000n);

            await expect(lbp.connect(owner).rebalanceTo5050()).to.be.revertedWithCustomError(lbp, "Balanced");
        });

        it("should revert if not enough ETH supplied to rebalance", async function () {
            const { lbp, owner, pool } = await loadFixture(tokenHeavyFixture);
            const valuesBefore = await calculatePoolValues(pool);
            const ethNeeded = valuesBefore.tokenValue - valuesBefore.ethValue;
            expect(ethNeeded).to.be.gt(1n);

            await expect(
                lbp.connect(owner).rebalanceTo5050({ value: ethNeeded - 1n })
            ).to.be.revertedWithCustomError(lbp, "InsufficientEth");
        });

        it("should revert if not enough tokens supplied to rebalance", async function () {
            const { lbp, owner, pool, token } = await loadFixture(finalizedFixture);
            const valuesBefore = await calculatePoolValues(pool);
            expect(valuesBefore.ethValue).to.be.gt(valuesBefore.tokenValue);
            expect(valuesBefore.pricePerToken).to.be.gt(0n);

            const diff = valuesBefore.ethValue - valuesBefore.tokenValue;
            const tokensNeeded = (diff * SCALE) / valuesBefore.pricePerToken;
            expect(tokensNeeded).to.be.gt(0n);

            await token.mint(owner.address, tokensNeeded);
            await token.connect(owner).approve(await lbp.getAddress(), tokensNeeded - 1n);

            await expect(lbp.connect(owner).rebalanceTo5050()).to.be.revertedWith("ERC20: insufficient allowance");
        });
    });
});
