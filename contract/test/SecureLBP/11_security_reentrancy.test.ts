import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithPoolFixture } from "../utils/lbpFixtures";

const errorInterface = new ethers.Interface(["error Error(string)"]);

function decodeRevert(data: string): string | null {
    if (!data || data === "0x") return null;
    try {
        const parsed = errorInterface.parseError(data);
        return parsed.args[0] as string;
    } catch {
        return null;
    }
}

async function findAddressSlot(contractAddress: string, targetAddress: string, maxSlot = 1024) {
    const normalized = targetAddress.toLowerCase().replace(/^0x/, "");
    for (let i = 0; i < maxSlot; i++) {
        const value = await ethers.provider.getStorage(contractAddress, i);
        const raw = value.toLowerCase().replace(/^0x/, "");
        if (raw.endsWith(normalized)) {
            return ethers.toBeHex(i, 32);
        }
    }
    throw new Error("address slot not found");
}

async function overwritePackedAddressSlot(contractAddress: string, slotHex: string, newAddress: string) {
    const slotIndex = Number(BigInt(slotHex));
    const original = await ethers.provider.getStorage(contractAddress, slotIndex);
    const originalBig = BigInt(original);
    const addressMask = (1n << 160n) - 1n;
    const preservedUpper = originalBig & ~addressMask;
    const newValue = (BigInt(newAddress) & addressMask) | preservedUpper;
    await ethers.provider.send("hardhat_setStorageAt", [
        contractAddress,
        ethers.toBeHex(slotIndex, 32),
        ethers.toBeHex(newValue, 32)
    ]);
}

describe("SecureLBP – 11_security_reentrancy", function () {
    it("restricts privileged functions to the owner", async function () {
        const { lbp, owner, user1, endTime, token } = await loadFixture(deployLbpWithPoolFixture);

        await expect(
            lbp.connect(user1).initPoolFromAuction(1, { value: 1 })
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await time.increaseTo(endTime + 1n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await expect(
            lbp.connect(user1).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            lbp.connect(user1).withdrawETH(1)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            lbp.connect(user1).setTreasury(user1.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            lbp.connect(user1).rebalanceTo5050()
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
            lbp.connect(user1).unwindAllLiquidity()
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    async function deployWithMaliciousManager() {
        const [owner, user1, treasury, , auctionSigner] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        const token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const Feed = await ethers.getContractFactory("MockPriceFeed");
        const priceFeed = await Feed.deploy(ethers.parseUnits("2000", 8));
        await priceFeed.waitForDeployment();

        const OracleFactory = await ethers.getContractFactory("LBPOracle");
        const oracle = await OracleFactory.deploy(await priceFeed.getAddress());
        await oracle.waitForDeployment();

        const now = BigInt(await time.latest());
        const startTime = now + 20n;
        const endTime = startTime + 600n;

        const Malicious = await ethers.getContractFactory("MaliciousPresaleManager");
        const malicious = await Malicious.deploy();
        await malicious.waitForDeployment();

        const LBP = await ethers.getContractFactory("SecureLBP");
        const lbp = await LBP.deploy(
            await token.getAddress(),
            startTime,
            endTime,
            treasury.address,
            ethers.parseUnits("0.7", 18),
            ethers.parseUnits("0.3", 18),
            ethers.parseUnits("0.003", 18),
            await malicious.getAddress(),
            auctionSigner.address
        );
        await lbp.waitForDeployment();

        // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
        await lbp.connect(owner).configureFee(1, 1);

        await lbp.connect(owner).setOracle(await oracle.getAddress());

        await token.mint(await lbp.getAddress(), ethers.parseEther("10000"));
        await lbp.connect(owner).initPoolFromAuction(ethers.parseEther("10000"), { value: ethers.parseEther("100") });

        return { lbp, owner, user1, token, startTime, endTime, malicious };
    }

    it("prevents reentrancy via presale manager callback", async function () {
        const { lbp, owner, user1, token, startTime, endTime, malicious } = await deployWithMaliciousManager();

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);

        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await malicious.setReentryEscrow(await escrow.getAddress());

        await expect(
            lbp.connect(owner).finalizeToVesting(await escrow.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("blocks reentrancy in placeBid through malicious pool callback", async function () {
        const { lbp, user1, token, startTime } = await loadFixture(deployLbpWithPoolFixture);

        const lbpAddress = await lbp.getAddress();
        const poolSlot = await findAddressSlot(lbpAddress, await lbp.pool());

        const PoolFactory = await ethers.getContractFactory("ReentrantLBPPool");
        const maliciousPool = await PoolFactory.deploy(await token.getAddress(), lbpAddress);
        await maliciousPool.waitForDeployment();

        await token.mint(await maliciousPool.getAddress(), ethers.parseEther("200"));
        await maliciousPool.setReserves(ethers.parseEther("10"), ethers.parseEther("200"));
        await maliciousPool.setWeights(ethers.parseUnits("0.7", 18), ethers.parseUnits("0.3", 18));
        await maliciousPool.setLPBalance(ethers.parseEther("1"));
        await maliciousPool.armReentrancy(true, false, false);

        await overwritePackedAddressSlot(lbpAddress, poolSlot, await maliciousPool.getAddress());

        await time.increaseTo(startTime + 1n);

        await expect(
            lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") })
        ).to.not.be.reverted;

        expect(await maliciousPool.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await maliciousPool.lastRevertData())).to.equal("ReentrancyGuard: reentrant call");
    });

    async function deployReentrantFinalizeFixture() {
        const signers = await ethers.getSigners();
        const [owner, bidder, , treasury, auctionSigner] = signers;

        const Token = await ethers.getContractFactory("TestToken");
        const token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const ManagerFactory = await ethers.getContractFactory("ReentrantPresaleManager");
        const manager = await ManagerFactory.deploy();
        await manager.waitForDeployment();

        const now = BigInt(await time.latest());
        const startTime = now + 20n;
        const endTime = startTime + 600n;

        const LBP = await ethers.getContractFactory("SecureLBP");
        const lbp = await LBP.deploy(
            await token.getAddress(),
            startTime,
            endTime,
            treasury.address,
            ethers.parseUnits("0.7", 18),
            ethers.parseUnits("0.3", 18),
            ethers.parseUnits("0.003", 18),
            await manager.getAddress(),
            auctionSigner.address
        );
        await lbp.waitForDeployment();

        // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
        await lbp.connect(owner).configureFee(1, 1);

        await manager.setContext(await lbp.getAddress());

        await token.mint(await lbp.getAddress(), ethers.parseEther("10000"));
        await lbp.connect(owner).initPoolFromAuction(ethers.parseEther("10000"), { value: ethers.parseEther("100") });

        return { owner, bidder, token, lbp, manager, startTime, endTime };
    }

    it("ensures nonReentrant on finalizeToVesting stops recursive calls even for owner contracts", async function () {
        const { owner, bidder, token, lbp, manager, startTime, endTime } = await loadFixture(deployReentrantFinalizeFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(bidder).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();

        await lbp.connect(owner).transferOwnership(await manager.getAddress());
        await manager.setEscrow(await escrow.getAddress());

        await manager.triggerFinalize(await escrow.getAddress());

        expect(await manager.finalizeSucceeded()).to.equal(true);
        expect(await manager.reentryAttempted()).to.equal(true);
        expect(await manager.reentrySucceeded()).to.equal(false);
        expect(decodeRevert(await manager.reentryData())).to.equal("ReentrancyGuard: reentrant call");
    });

    it("blocks treasury fallback reentrancy during withdrawETH", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        const TreasuryFactory = await ethers.getContractFactory("ReentrantTreasury");
        const treasuryAttack = await TreasuryFactory.deploy(await lbp.getAddress());
        await treasuryAttack.waitForDeployment();

        await lbp.connect(owner).setTreasury(await treasuryAttack.getAddress());

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("2") });

        await time.increaseTo(endTime + 1n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        const lbpAddress = await lbp.getAddress();
        let contractBalance = await ethers.provider.getBalance(lbpAddress);
        if (contractBalance === 0n) {
            await owner.sendTransaction({ to: lbpAddress, value: ethers.parseEther("1") });
            contractBalance = await ethers.provider.getBalance(lbpAddress);
        }
        expect(contractBalance).to.be.gt(0n);

        const withdrawAmount = contractBalance;

        await treasuryAttack.setAttemptAmount(withdrawAmount);

        await expect(lbp.connect(owner).withdrawETH(withdrawAmount)).to.not.be.reverted;

        expect(await treasuryAttack.attempted()).to.equal(true);
        expect(await treasuryAttack.success()).to.equal(false);
        expect(decodeRevert(await treasuryAttack.lastData())).to.equal("Ownable: caller is not the owner");
    });

    it("prevents pool-driven reentrancy in unwindAllLiquidity", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        const lbpAddress = await lbp.getAddress();
        const poolSlot = await findAddressSlot(lbpAddress, await lbp.pool());

        const PoolFactory = await ethers.getContractFactory("ReentrantLBPPool");
        const maliciousPool = await PoolFactory.deploy(await token.getAddress(), lbpAddress);
        await maliciousPool.waitForDeployment();

        await token.mint(await maliciousPool.getAddress(), ethers.parseEther("100"));
        await owner.sendTransaction({ to: await maliciousPool.getAddress(), value: ethers.parseEther("20") });

        await maliciousPool.setReserves(ethers.parseEther("10"), ethers.parseEther("100"));
        await maliciousPool.setWeights(ethers.parseUnits("0.7", 18), ethers.parseUnits("0.3", 18));
        await maliciousPool.setLPBalance(ethers.parseEther("2"));
        await maliciousPool.armReentrancy(false, true, false);

        await overwritePackedAddressSlot(lbpAddress, poolSlot, await maliciousPool.getAddress());

        await expect(lbp.connect(owner).unwindAllLiquidity()).to.not.be.reverted;

        expect(await maliciousPool.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await maliciousPool.lastRevertData())).to.equal("Ownable: caller is not the owner");
    });

    it("blocks reentrancy attempts during rebalanceTo5050", async function () {
        const { lbp, owner, user1, token, startTime, endTime } = await loadFixture(deployLbpWithPoolFixture);

        await time.increaseTo(startTime + 1n);
        await lbp.connect(user1).placeBid(0, { value: ethers.parseEther("1") });

        await time.increaseTo(endTime + 1n);
        const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await Escrow.deploy(await token.getAddress(), await lbp.getAddress());
        await escrow.waitForDeployment();
        await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());

        const lbpAddress = await lbp.getAddress();
        const poolSlot = await findAddressSlot(lbpAddress, await lbp.pool());

        const PoolFactory = await ethers.getContractFactory("ReentrantLBPPool");
        const maliciousPool = await PoolFactory.deploy(await token.getAddress(), lbpAddress);
        await maliciousPool.waitForDeployment();

        await token.mint(await maliciousPool.getAddress(), ethers.parseEther("200"));
        await owner.sendTransaction({ to: await maliciousPool.getAddress(), value: ethers.parseEther("20") });

        await maliciousPool.setReserves(ethers.parseEther("5"), ethers.parseEther("10"));
        await maliciousPool.setWeights(ethers.parseUnits("0.7", 18), ethers.parseUnits("0.3", 18));
        await maliciousPool.setLPBalance(ethers.parseEther("2"));
        await maliciousPool.armReentrancy(false, false, true);

        await overwritePackedAddressSlot(lbpAddress, poolSlot, await maliciousPool.getAddress());

        await expect(
            lbp.connect(owner).rebalanceTo5050({ value: ethers.parseEther("7") })
        ).to.not.be.reverted;

        expect(await maliciousPool.lastReenterSuccess()).to.equal(false);
        expect(decodeRevert(await maliciousPool.lastRevertData())).to.equal("Ownable: caller is not the owner");
    });
});
