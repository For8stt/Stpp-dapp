import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithBidsFixture, deployLbpWithPoolFixture } from "../utils/lbpFixtures";

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

let finalizedSlotIndex: number | null = null;
let finalizedMask: bigint | null = null;
async function getFinalizedSlot(lbpAddress: string, owner: any, token: any, endTime: bigint) {
    if (finalizedSlotIndex !== null && finalizedMask !== null) return finalizedSlotIndex;

    const provider = ethers.provider;
    const snapshot = await provider.send("evm_snapshot", []);

    const before: string[] = [];
    for (let i = 0; i < 200; i++) {
        before.push(await provider.getStorage(lbpAddress, i));
    }

    const escrow = await deployEscrow(await token.getAddress(), lbpAddress);
    await time.increaseTo(endTime + 1n);
    await (await ethers.getContractAt("SecureLBP", lbpAddress))
        .connect(owner)
        .finalizeToVesting(await escrow.getAddress());

    for (let i = 0; i < 200; i++) {
        const after = await provider.getStorage(lbpAddress, i);
        if (before[i] !== after) {
            const beforeValue = BigInt(before[i]);
            const afterValue = BigInt(after);
            const delta = afterValue - beforeValue;
            if (delta > 0n && (delta & (delta - 1n)) === 0n) {
                finalizedSlotIndex = i;
                finalizedMask = delta;
                break;
            }
        }
    }

    await provider.send("evm_revert", [snapshot]);

    if (finalizedSlotIndex === null || finalizedMask === null) {
        throw new Error("finalized slot not found");
    }
    return finalizedSlotIndex;
}

describe("SecureLBP – 07_unwind_liquidity", function () {
    describe("success paths", function () {
        it("should allow owner to call unwindAllLiquidity after finalize and endTime", async function () {
            const { lbp, owner, pool } = await loadFixture(finalizedFixture);
            const lbpAddress = await lbp.getAddress();
            const lpBefore = await pool.balanceLP(lbpAddress);
            expect(lpBefore).to.be.gt(0n);

            await expect(lbp.connect(owner).unwindAllLiquidity()).to.emit(lbp, "FullUnwindExecuted");

            expect(await pool.balanceLP(lbpAddress)).to.equal(0n);
        });

        it("should burn all LP tokens and update token/ETH balances", async function () {
            const { lbp, owner, pool, token } = await loadFixture(finalizedFixture);
            const lbpAddress = await lbp.getAddress();

            const tokenBefore = await token.balanceOf(lbpAddress);
            const ethBefore = await ethers.provider.getBalance(lbpAddress);

            await lbp.connect(owner).unwindAllLiquidity();

            const tokenAfter = await token.balanceOf(lbpAddress);
            const ethAfter = await ethers.provider.getBalance(lbpAddress);

            expect(await pool.balanceLP(lbpAddress)).to.equal(0n);
            expect(tokenAfter).to.be.gt(tokenBefore);
            expect(ethAfter).to.be.gt(ethBefore);
        });

        it("should emit FullUnwindExecuted event with removed amounts", async function () {
            const { lbp, owner, token } = await loadFixture(finalizedFixture);
            const lbpAddress = await lbp.getAddress();

            const tokenBefore = await token.balanceOf(lbpAddress);
            const ethBefore = await ethers.provider.getBalance(lbpAddress);

            const tx = await lbp.connect(owner).unwindAllLiquidity();
            const receipt = await tx.wait();

            const tokenAfter = await token.balanceOf(lbpAddress);
            const ethAfter = await ethers.provider.getBalance(lbpAddress);

            const tokensRemoved = tokenAfter - tokenBefore;
            const ethRemoved = ethAfter - ethBefore;

            const parsed = receipt!.logs
                .map((log) => {
                    try {
                        return lbp.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find((ev) => ev && ev.name === "FullUnwindExecuted");

            expect(parsed).to.not.be.null;
            expect(parsed!.args.ethRemoved).to.equal(ethRemoved);
            expect(parsed!.args.tokensRemoved).to.equal(tokensRemoved);
        });

        it("should allow partial unwind with valid percentBP", async function () {
            const { lbp, owner, pool } = await loadFixture(finalizedFixture);
            const lbpAddress = await lbp.getAddress();

            const lpBefore = await pool.balanceLP(lbpAddress);
            const percentBP = 4000n;

            await lbp.connect(owner).unwindPartial(percentBP);

            const lpAfter = await pool.balanceLP(lbpAddress);
            const expectedLpAfter = lpBefore - (lpBefore * percentBP) / 10000n;

            expect(lpAfter).to.equal(expectedLpAfter);
        });

        it("should emit PartialUnwindExecuted event with correct values", async function () {
            const { lbp, owner, token } = await loadFixture(finalizedFixture);
            const lbpAddress = await lbp.getAddress();

            const percentBP = 2500n;
            const tokenBefore = await token.balanceOf(lbpAddress);
            const ethBefore = await ethers.provider.getBalance(lbpAddress);

            const tx = await lbp.connect(owner).unwindPartial(percentBP);
            const receipt = await tx.wait();

            const tokenAfter = await token.balanceOf(lbpAddress);
            const ethAfter = await ethers.provider.getBalance(lbpAddress);

            const tokensRemoved = tokenAfter - tokenBefore;
            const ethRemoved = ethAfter - ethBefore;

            const parsed = receipt!.logs
                .map((log) => {
                    try {
                        return lbp.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find((ev) => ev && ev.name === "PartialUnwindExecuted");

            expect(parsed).to.not.be.null;
            expect(parsed!.args.percentBP).to.equal(percentBP);
            expect(parsed!.args.ethRemoved).to.equal(ethRemoved);
            expect(parsed!.args.tokensRemoved).to.equal(tokensRemoved);
        });
    });

    describe("Reverts", function () {
        it("should revert before finalize", async function () {
            const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
            await expect(lbp.connect(owner).unwindAllLiquidity()).to.be.revertedWithCustomError(lbp, "NotFinalized");
        });

        it("should revert before endTime", async function () {
            const { lbp, owner, token, endTime } = await loadFixture(deployLbpWithPoolFixture);
            const lbpAddress = await lbp.getAddress();
            const slotIndex = await getFinalizedSlot(lbpAddress, owner, token, endTime);

            await time.increaseTo(endTime - 10n);
            const current = BigInt(await ethers.provider.getStorage(lbpAddress, slotIndex));
            const slotHex = ethers.toBeHex(slotIndex, 32);
            const newValue = current | (finalizedMask as bigint);
            await ethers.provider.send("hardhat_setStorageAt", [lbpAddress, slotHex, ethers.toBeHex(newValue, 32)]);

            await expect(lbp.connect(owner).unwindAllLiquidity()).to.be.revertedWithCustomError(lbp, "AuctionActive");
        });

        it("should revert if LP balance is zero", async function () {
            const { lbp, owner } = await loadFixture(finalizedFixture);

            await lbp.connect(owner).unwindAllLiquidity();

            await expect(lbp.connect(owner).unwindAllLiquidity()).to.be.revertedWithCustomError(lbp, "NoLPTokens");
            await expect(lbp.connect(owner).unwindPartial(5000)).to.be.revertedWithCustomError(lbp, "NoLPTokens");
        });

        it("should revert if percentBP == 0 or > 10000", async function () {
            const { lbp, owner } = await loadFixture(finalizedFixture);

            await expect(lbp.connect(owner).unwindPartial(0)).to.be.revertedWithCustomError(lbp, "PercentInvalid");
            await expect(lbp.connect(owner).unwindPartial(10001)).to.be.revertedWithCustomError(lbp, "PercentInvalid");
        });
    });
});
