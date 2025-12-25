import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    deployLbpWithPoolFixture,
    deployLbpWithoutPoolFixture,
    deployLbpWithBidsFixture
} from "../utils/lbpFixtures";

async function deployEscrow(tokenAddress: string, lbpAddress: string) {
    const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await Escrow.deploy(tokenAddress, lbpAddress);
    await escrow.waitForDeployment();
    return escrow;
}

describe("SecureLBP – 06_finalizeToVesting", function () {
    it("should allow owner to finalize only after endTime", async function () {
        const { lbp, owner, user1, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await expect(
            lbp.connect(user1).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.not.be.reverted;
    });

    it("should transfer totalTokensAllocated to vestingEscrow", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const totalTokensAllocated = await lbp.totalTokensAllocated();

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        expect(await token.balanceOf(await escrow.getAddress())).to.equal(totalTokensAllocated);
    });

    it("should set finalized = true and store vestingEscrow address", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        expect(await lbp.finalized()).to.equal(true);
        expect(await lbp.vestingEscrow()).to.equal(await escrow.getAddress());
    });

    it("should emit FinalizedToVesting and PoolFinalized events", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const totalTokens = await lbp.totalTokensAllocated();
        const totalEth = await lbp.totalEthRaised();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        )
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), totalTokens)
            .and.to.emit(lbp, "PoolFinalized")
            .withArgs(totalTokens, totalEth);
    });

    it("should call presaleManager.finalizePresale(...) if presaleManager and auction are set", async function () {
        const { lbp, owner, token, presaleManager, auction } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const totalTokens = await lbp.totalTokensAllocated();
        const totalEth = await lbp.totalEthRaised();

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        )
            .to.emit(presaleManager, "FinalizeCalled")
            .withArgs(auction, totalEth, totalTokens);
    });

    it("should revert if pool not initialized", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(deployLbpWithoutPoolFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await time.increaseTo(endTime + 1n);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "PoolNotInitialized");
    });

    it("should revert if called before endTime", async function () {
        const { lbp, owner, token, startTime } = await loadFixture(deployLbpWithPoolFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await time.increaseTo(startTime - 1n);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "NotEnded");
    });

    it("should revert if vestingEscrow is zero address", async function () {
        const { lbp, owner } = await loadFixture(deployLbpWithBidsFixture);

        await expect(
            lbp.connect(owner).finalizeToVesting(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(lbp, "EscrowZero");
    });

    it("should revert if available token balance < totalTokensAllocated", async function () {
        const { lbp, owner, token, pool } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        const lbpAddress = await lbp.getAddress();
        const contractBalance = await token.balanceOf(lbpAddress);
        const poolReserveToken = await pool.reserveToken();
        const totalTokensAllocated = await lbp.totalTokensAllocated();

        // Remove all tokens from contract
        if (contractBalance > 0n) {
            await ethers.provider.send("hardhat_impersonateAccount", [lbpAddress]);
            const lbpSigner = await ethers.getSigner(lbpAddress);
            await owner.sendTransaction({ to: lbpAddress, value: ethers.parseEther("1") });
            await token.connect(lbpSigner).transfer(owner.address, contractBalance);
            await ethers.provider.send("hardhat_stopImpersonatingAccount", [lbpAddress]);
        }

        // Remove all tokens from pool by removing all liquidity
        if (poolReserveToken > 0n) {
            const lpBalance = await pool.balanceLP(lbpAddress);
            if (lpBalance > 0n) {
                await ethers.provider.send("hardhat_impersonateAccount", [lbpAddress]);
                const lbpSigner = await ethers.getSigner(lbpAddress);
                await owner.sendTransaction({ to: lbpAddress, value: ethers.parseEther("1") });
                await pool.connect(lbpSigner).removeLiquidity(lpBalance);
                await ethers.provider.send("hardhat_stopImpersonatingAccount", [lbpAddress]);
            }
        }

        // After removing liquidity, tokens are returned to the contract, so remove them again
        // We need to remove enough tokens so that total available < totalTokensAllocated
        let balanceAfterUnwind = await token.balanceOf(lbpAddress);
        const finalPoolReserve = await pool.reserveToken();
        const totalAvailable = balanceAfterUnwind + finalPoolReserve;
        
        // Calculate how many tokens we need to remove to make total available < totalTokensAllocated
        if (totalAvailable >= totalTokensAllocated) {
            // We need to remove at least (totalAvailable - totalTokensAllocated + 1) tokens
            const tokensToRemove = totalAvailable - totalTokensAllocated + 1n;
            const tokensToRemoveFromContract = tokensToRemove > balanceAfterUnwind ? balanceAfterUnwind : tokensToRemove;
            
            if (tokensToRemoveFromContract > 0n) {
                await ethers.provider.send("hardhat_impersonateAccount", [lbpAddress]);
                const lbpSigner = await ethers.getSigner(lbpAddress);
                await owner.sendTransaction({ to: lbpAddress, value: ethers.parseEther("1") });
                await token.connect(lbpSigner).transfer(owner.address, tokensToRemoveFromContract);
                await ethers.provider.send("hardhat_stopImpersonatingAccount", [lbpAddress]);
            }
        }

        // Verify that total available is less than allocated
        const finalContractBalance = await token.balanceOf(lbpAddress);
        const finalPoolReserveAfter = await pool.reserveToken();
        expect(finalContractBalance + finalPoolReserveAfter).to.be.lt(totalTokensAllocated);

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "InsufficientTokens");
    });

    it("should revert if finalize is called twice", async function () {
        const { lbp, owner, token } = await loadFixture(deployLbpWithBidsFixture);
        const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());

        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWithCustomError(lbp, "AlreadyFinalized");
    });
});
