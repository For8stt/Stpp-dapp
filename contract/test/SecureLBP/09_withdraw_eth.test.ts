import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture, deployLbpWithBidsFixture } from "../utils/lbpFixtures";

async function getTreasurySlot(lbpAddress: string, owner: any, newTreasury: string) {
    const provider = ethers.provider;
    const snapshot = await provider.send("evm_snapshot", []);

    const before: string[] = [];
    for (let i = 0; i < 200; i++) {
        before.push(await provider.getStorage(lbpAddress, i));
    }

    let slot: string | null = null;
    const lbp = await ethers.getContractAt("SecureLBP", lbpAddress);
    const expectedValue = ethers.zeroPadValue(newTreasury, 32);

    try {
        await lbp.connect(owner).setTreasury(newTreasury);

        for (let i = 0; i < before.length; i++) {
            const after = await provider.getStorage(lbpAddress, i);
            if (before[i] !== after && after.toLowerCase() === expectedValue.toLowerCase()) {
                slot = ethers.toBeHex(i, 32);
                break;
            }
        }
    } catch {
        const currentTreasury = await lbp.treasury();
        const paddedCurrent = ethers.zeroPadValue(currentTreasury, 32).toLowerCase();
        for (let i = 0; i < before.length; i++) {
            if (before[i].toLowerCase() === paddedCurrent) {
                slot = ethers.toBeHex(i, 32);
                break;
            }
        }
    }

    await provider.send("evm_revert", [snapshot]);

    if (!slot) {
        throw new Error("treasury slot not found");
    }
    return slot;
}

async function finalizeLbp(lbp: any, owner: any, token: any) {
    const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
    await escrow.waitForDeployment();
    await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());
}

async function deployFinalizedAndUnwoundFixture() {
    const context = await deployLbpWithPoolFixture();
    const { lbp, owner, user1, token, startTime, endTime } = context;

    await time.increaseTo(startTime + 1n);
    await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
    await time.increaseTo(endTime + 1n);
    await finalizeLbp(lbp, owner, token);
    await lbp.connect(owner).unwindAllLiquidity();

    return context;
}

describe("SecureLBP – 09_withdraw_eth", function () {
    it("reverts before finalization", async function () {
        const { lbp, owner, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await expect(lbp.connect(owner).withdrawETH(1)).to.be.revertedWithCustomError(lbp, "NotFinalized");

        await time.increaseTo(endTime + 1n);
        await expect(lbp.connect(owner).withdrawETH(1)).to.be.revertedWithCustomError(lbp, "NotFinalized");
    });

    it("transfers accumulated fees to treasury after finalize", async function () {
        const { lbp, owner, user1, treasury, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") });

        await time.increaseTo(endTime + 1n);
        await finalizeLbp(lbp, owner, token);

        const treasuryBefore = await ethers.provider.getBalance(treasury.address);
        const contractBefore = await ethers.provider.getBalance(await lbp.getAddress());

        await expect(lbp.connect(owner).withdrawETH(contractBefore))
            .to.emit(lbp, "WithdrawnETH")
            .withArgs(treasury.address, contractBefore);

        expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + contractBefore);
        expect(await ethers.provider.getBalance(await lbp.getAddress())).to.equal(0n);
    });

    it("reverts when treasury address is zero", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        const lbpAddress = await lbp.getAddress();
        const slot = await getTreasurySlot(lbpAddress, owner, user1.address);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        await time.increaseTo(endTime + 1n);
        await finalizeLbp(lbp, owner, token);

        await ethers.provider.send("hardhat_setStorageAt", [lbpAddress, slot, ethers.toBeHex(0, 32)]);

        await expect(lbp.connect(owner).withdrawETH(ethers.parseEther("0.1"))).to.be.revertedWithCustomError(
            lbp,
            "TreasuryZero"
        );
    });

    it("reverts when amount exceeds contract balance", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });
        await time.increaseTo(endTime + 1n);
        await finalizeLbp(lbp, owner, token);

        const balance = await ethers.provider.getBalance(await lbp.getAddress());
        await expect(lbp.connect(owner).withdrawETH(balance + 1n)).to.be.revertedWithCustomError(
            lbp,
            "InsufficientBalance"
        );
    });

    it("prevents non-owners from withdrawing", async function () {
        const { lbp, user1 } = await loadFixture(deployLbpWithBidsFixture);
        await expect(lbp.connect(user1).withdrawETH(1)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reduces contract balance by the withdrawn amount", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") });
        await time.increaseTo(endTime + 1n);
        await finalizeLbp(lbp, owner, token);

        const contractAddress = await lbp.getAddress();
        const balanceBefore = await ethers.provider.getBalance(contractAddress);
        const partialAmount = balanceBefore / 2n;

        await lbp.connect(owner).withdrawETH(partialAmount);

        const balanceAfter = await ethers.provider.getBalance(contractAddress);
        expect(balanceAfter).to.equal(balanceBefore - partialAmount);
    });

    it("rescues non-sale ERC20 tokens", async function () {
        const { lbp, owner, user1, token } = await loadFixture(deployLbpWithPoolFixture);
        const OtherToken = await ethers.getContractFactory("TestToken");
        const other = await OtherToken.deploy(ethers.parseEther("1000"));
        await other.waitForDeployment();

        const amount = ethers.parseEther("50");
        await other.mint(owner.address, amount);
        await other.connect(owner).transfer(await lbp.getAddress(), amount);

        const ownerBalanceBefore = await other.balanceOf(owner.address);
        await expect(
            lbp.connect(owner).rescueERC20(await other.getAddress(), owner.address, amount)
        ).to.not.be.reverted;

        expect(await other.balanceOf(owner.address)).to.equal(ownerBalanceBefore + amount);

        await expect(
            lbp.connect(owner).rescueERC20(await token.getAddress(), owner.address, 1n)
        ).to.be.revertedWithCustomError(lbp, "RescueSaleToken");
    });

    it("reverts when withdrawing tokens before finalization", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithPoolFixture);
        const extra = ethers.parseEther("5");
        await token.mint(owner.address, extra);
        await token.connect(owner).transfer(await lbp.getAddress(), extra);

        await expect(lbp.connect(owner).withdrawTokens(extra)).to.be.revertedWithCustomError(lbp, "NotFinalized");
        await expect(lbp.connect(owner).withdrawAllTokens()).to.be.revertedWithCustomError(lbp, "NotFinalized");
    });

    it("withdrawTokens sends requested amount to treasury after unwind", async function () {
        const { lbp, owner, treasury, token } = await loadFixture(deployFinalizedAndUnwoundFixture);

        const lbpAddress = await lbp.getAddress();
        const treasuryBefore = await token.balanceOf(treasury.address);
        const contractBalance = await token.balanceOf(lbpAddress);
        const partial = contractBalance / 4n;

        await expect(lbp.connect(owner).withdrawTokens(partial))
            .to.emit(lbp, "TokensWithdrawn")
            .withArgs(treasury.address, partial);

        expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + partial);
        expect(await token.balanceOf(lbpAddress)).to.equal(contractBalance - partial);
    });

    it("withdrawAllTokens drains remaining token balance", async function () {
        const { lbp, owner, treasury, token } = await loadFixture(deployFinalizedAndUnwoundFixture);

        const lbpAddress = await lbp.getAddress();
        const treasuryBefore = await token.balanceOf(treasury.address);
        const contractBalance = await token.balanceOf(lbpAddress);
        expect(contractBalance).to.be.gt(0n);

        await expect(lbp.connect(owner).withdrawAllTokens())
            .to.emit(lbp, "TokensWithdrawn")
            .withArgs(treasury.address, contractBalance);

        expect(await token.balanceOf(lbpAddress)).to.equal(0n);
        expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + contractBalance);
    });

    it("withdrawTokens reverts on zero amount", async function () {
        const { lbp, owner } = await loadFixture(deployFinalizedAndUnwoundFixture);
        await expect(lbp.connect(owner).withdrawTokens(0)).to.be.revertedWithCustomError(lbp, "AmountZero");
    });

    it("withdrawTokens reverts when amount exceeds balance", async function () {
        const { lbp, owner, token } = await loadFixture(deployFinalizedAndUnwoundFixture);
        const lbpAddress = await lbp.getAddress();
        const balance = await token.balanceOf(lbpAddress);
        await expect(lbp.connect(owner).withdrawTokens(balance + 1n)).to.be.revertedWithCustomError(
            lbp,
            "InsufficientTokens"
        );
    });

    it("withdrawTokens reverts when treasury is zero", async function () {
        const { lbp, owner, token } = await loadFixture(deployFinalizedAndUnwoundFixture);
        const lbpAddress = await lbp.getAddress();
        const slot = await getTreasurySlot(lbpAddress, owner, owner.address);
        await ethers.provider.send("hardhat_setStorageAt", [lbpAddress, slot, ethers.toBeHex(0, 32)]);

        const balance = await token.balanceOf(lbpAddress);
        await expect(lbp.connect(owner).withdrawTokens(balance)).to.be.revertedWithCustomError(lbp, "TreasuryZero");
    });
});
