import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting } from "../typechain-types";

//npx hardhat test test/SecureLBP.test.ts
describe("SecureLBP", function () {
    let lbp: SecureLBP;
    let token: TestToken;
    let vesting: TestVesting;
    let owner: any, user1: any, user2: any, oracle: any, treasury: any;

    const ONE_ETH = ethers.parseEther("1");

    beforeEach(async () => {
        [owner, user1, user2, oracle, treasury] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        // Set time windows
        const block = await ethers.provider.getBlock("latest");
        const now = block!.timestamp;

        const start = now + 5;            // start in 5s
        const commitEnd = start + 60;     // commit phase lasts 60s
        const revealEnd = commitEnd + 60; // reveal phase lasts 60s

        const LBP = await ethers.getContractFactory("SecureLBP");
        lbp = await LBP.deploy(
            await token.getAddress(),
            start,
            commitEnd,
            revealEnd,
            treasury.address
        );
        await lbp.waitForDeployment();

        // ✅ Mint tokens directly to LBP contract
        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));

        // Deploy mock vesting
        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = await Vesting.deploy();
        await vesting.waitForDeployment();

        // Set oracle guardian
        await lbp.connect(owner).setOracleGuardian(oracle.address);
    });

    // Helper to advance blockchain timestamp
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n; // minimal step forward
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    // Helper to build commit hash
    function buildCommit(user: any, amount: bigint, nonce: number, contractAddr: string) {
        return ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, nonce, contractAddr]
        );
    }

    it("should allow commit and reveal flow", async () => {
        const amount = ONE_ETH;
        const nonce = 123;
        const lbpAddr = await lbp.getAddress();
        const hash = buildCommit(user1, amount, nonce, lbpAddr);

        // Move to commit phase
        const start = await lbp.startTime();
        await mineTo(start + 1n);

        await lbp.connect(user1).commitBid(hash, { value: amount });

        // Move to reveal phase
        await mineTo(await lbp.commitEnd() + 1n);

        await lbp.connect(user1).revealBid(amount, nonce);

        const alloc = await lbp.allocations(user1.address);
        expect(alloc).to.be.gt(0);
    });

    it("should apply penalty for non-revealed commit", async () => {
        const amount = ONE_ETH;
        const nonce = 111;
        const hash = buildCommit(user2, amount, nonce, await lbp.getAddress());

        // Move to commit phase
        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user2).commitBid(hash, { value: amount });

        // Jump past reveal end
        await mineTo(await lbp.revealEnd() + 10n);

        const beforeBal = await ethers.provider.getBalance(user2.address);

        // Penalize non-revealed commit (10% penalty)
        await lbp.connect(oracle).penalizeNonRevealed(user2.address, hash, 1000);

        // Withdraw refund after penalty
        await lbp.connect(user2).withdrawRefund();

        const afterBal = await ethers.provider.getBalance(user2.address);
        expect(afterBal).to.be.gt(beforeBal); // received refund minus penalty
    });

    it("should allow oracle to update fees", async () => {
        await lbp.connect(oracle).updateInitialFeeBP(500);
        await lbp.connect(oracle).updateFinalFeeBP(50);
        expect(await lbp.initialFeeBP()).to.equal(500);
        expect(await lbp.finalFeeBP()).to.equal(50);
    });

    it("should allow oracle to pause/unpause", async () => {
        await lbp.connect(oracle).oraclePause();
        expect(await lbp.paused()).to.equal(true);
        await lbp.connect(oracle).oracleUnpause();
        expect(await lbp.paused()).to.equal(false);
    });

    it("should finalize to vesting in chunks", async () => {
        const amount = ONE_ETH;
        const nonce = 1;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        const startTime = await lbp.startTime();
        const commitEnd = await lbp.commitEnd();
        const revealEnd = await lbp.revealEnd();

        // Commit
        await mineTo(startTime + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });

        // Reveal
        await mineTo(commitEnd + 1n);
        await lbp.connect(user1).revealBid(amount, nonce);

        // Move past reveal
        await mineTo(revealEnd + 1n);

        // Finalize allocation to vesting
        await lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address]);

        const vested = await vesting.allocations(user1.address);
        expect(vested).to.be.gt(0);
    });

    it("should withdraw ETH to treasury", async () => {
        // Send ETH to LBP contract
        await owner.sendTransaction({ to: await lbp.getAddress(), value: ONE_ETH });

        const before = await ethers.provider.getBalance(treasury.address);

        // Withdraw ETH to treasury
        await lbp.connect(owner).withdrawETH(treasury.address, ONE_ETH);

        const after = await ethers.provider.getBalance(treasury.address);
        expect(after - before).to.equal(ONE_ETH);
    });
});
