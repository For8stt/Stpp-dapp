import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

async function impersonate(address: string) {
    await ethers.provider.send("hardhat_impersonateAccount", [address]);
    await ethers.provider.send("hardhat_setBalance", [address, ethers.toBeHex(ethers.parseEther("1"))]);
    return ethers.provider.getSigner(address);
}

async function stopImpersonating(address: string) {
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [address]);
}

describe("SecureLBP – 05_pause_oracle", function () {
    it("should only allow oracle contract to call oraclePause()", async function () {
        const { lbp, owner, oracle } = await loadFixture(deployLbpWithPoolFixture);

        await expect(lbp.connect(owner).oraclePause()).to.be.revertedWithCustomError(lbp, "NotOracle");

        const oracleAddr = await oracle.getAddress();
        const oracleSigner = await impersonate(oracleAddr);

        await expect(lbp.connect(oracleSigner).oraclePause()).to.emit(lbp, "OraclePaused");

        await stopImpersonating(oracleAddr);
    });

    it("should pause contract and revert placeBid while paused", async function () {
        const { lbp, owner, oracle, startTime, user1 } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const oracleAddr = await oracle.getAddress();
        const oracleSigner = await impersonate(oracleAddr);

        await lbp.connect(oracleSigner).oraclePause();

        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
        ).to.be.revertedWith("Pausable: paused");

        await stopImpersonating(oracleAddr);
    });

    it("should revert oraclePause() if oracle not set", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);

        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        await expect(lbp.connect(owner).oraclePause()).to.be.revertedWithCustomError(lbp, "OracleNotSet");
    });

    it("should only allow oracle to call oracleUnpause()", async function () {
        const { lbp, owner, oracle, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const oracleAddr = await oracle.getAddress();
        const oracleSigner = await impersonate(oracleAddr);

        await lbp.connect(oracleSigner).oraclePause();

        await expect(lbp.connect(owner).oracleUnpause()).to.be.revertedWithCustomError(lbp, "NotOracle");

        await lbp.connect(oracleSigner).oracleUnpause();

        await stopImpersonating(oracleAddr);
    });

    it("should emit OraclePaused and OracleResumed events", async function () {
        const { lbp, owner, oracle, startTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);

        const oracleAddr = await oracle.getAddress();
        const oracleSigner = await impersonate(oracleAddr);

        await expect(lbp.connect(oracleSigner).oraclePause()).to.emit(lbp, "OraclePaused");

        await time.increase(1);

        await expect(lbp.connect(oracleSigner).oracleUnpause()).to.emit(lbp, "OracleResumed");

        await stopImpersonating(oracleAddr);
    });

    it("should allow owner to use standard pause/unpause if implemented in contract", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithPoolFixture);
        const lbpWithOwner = lbp.connect(owner) as any;

        if (typeof lbpWithOwner.pause !== "function" || typeof lbpWithOwner.unpause !== "function") {
            return;
        }

        await lbpWithOwner.pause();
        expect(await lbp.paused()).to.equal(true);

        await lbpWithOwner.unpause();
        expect(await lbp.paused()).to.equal(false);
    });
});
