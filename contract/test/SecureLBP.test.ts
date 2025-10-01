import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed } from "../typechain-types";

// npx hardhat test test/SecureLBP.test.ts
describe("SecureLBP", function () {
    let lbp: SecureLBP;
    let token: TestToken;
    let vesting: TestVesting;
    let oracle: LBPOracle;
    let feed: MockPriceFeed;
    let owner: any, user1: any, user2: any, treasury: any;

    const ONE_ETH = ethers.parseEther("1");

    beforeEach(async () => {
        [owner, user1, user2, treasury] = await ethers.getSigners();

        // Deploy test token
        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        // Deploy mock price feed for oracle
        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        feed = (await MockFeed.deploy(ethers.parseUnits("2000", 8))) as MockPriceFeed;
        await feed.waitForDeployment();

        // Deploy oracle
        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = (await Oracle.deploy(await feed.getAddress())) as LBPOracle;
        await oracle.waitForDeployment();

        // Time windows
        const block = await ethers.provider.getBlock("latest");
        const now = block!.timestamp;
        const start = now + 10;
        const commitEnd = start + 60;
        const revealEnd = commitEnd + 60;

        // Deploy LBP
        const LBP = await ethers.getContractFactory("SecureLBP");
        lbp = (await LBP.deploy(
            await token.getAddress(),
            start,
            commitEnd,
            revealEnd,
            treasury.address
        )) as SecureLBP;
        await lbp.waitForDeployment();

        // Mint tokens into LBP
        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));

        // Deploy vesting
        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = (await Vesting.deploy()) as TestVesting;
        await vesting.waitForDeployment();

        // Link oracle
        await lbp.connect(owner).setOracle(await oracle.getAddress());
    });

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }
    async function mineToExact(ts: bigint) {
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    function buildCommit(user: any, amount: bigint, nonce: number, contractAddr: string) {
        return ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, nonce, contractAddr]
        );
    }

    // --- TESTS ---
    it("should allow commit and reveal", async () => {
        const amount = ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });

        await mineTo(await lbp.commitEnd() + 1n);
        await lbp.connect(user1).revealBid(amount, nonce);

        const alloc = await lbp.allocations(user1.address);
        expect(alloc).to.be.gt(0);
    });

    it("should penalize non-revealed commit", async () => {
        const amount = ONE_ETH;
        const nonce = 42;
        const hash = buildCommit(user2, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user2).commitBid(hash, { value: amount });

        await mineTo(await lbp.revealEnd() + 5n);

        const beforeBal = await ethers.provider.getBalance(user2.address);
        await lbp.connect(owner).penalizeNonRevealed(user2.address, hash, 1000);
        await lbp.connect(user2).withdrawRefund();
        const afterBal = await ethers.provider.getBalance(user2.address);

        expect(afterBal).to.be.gt(beforeBal);
    });

    it("should respect oracle adaptive fee", async () => {
        // Set fee range
        await oracle.setFeeBP(200, 800);

        // 1️⃣ Set base price
        await feed.setPrice(ethers.parseUnits("1000", 8));
        await oracle.computeAdaptiveFee();

        // 2️⃣ Simulate price change
        await feed.setPrice(ethers.parseUnits("1100", 8));
        await oracle.computeAdaptiveFee();

        // Move to commit phase to avoid edge case with linear schedule
        await mineTo(await lbp.startTime() + 1n);

        // Get adaptive fee directly from oracle
        const oracleFee: bigint = await oracle.viewAdaptiveFee();

        // LBP should return the same fee
        const lbpFee: bigint = await lbp.currentFeeBP();
        expect(lbpFee).to.equal(oracleFee);

        // Check that fee is non-zero and within bounds
        expect(lbpFee).to.be.gt(0n);
        expect(lbpFee).to.be.lte(1000n);
    });



    it("should allow manual pause/unpause", async () => {
        await lbp.connect(owner).ownerPause();
        expect(await lbp.paused()).to.equal(true);
        await lbp.connect(owner).ownerUnpause();
        expect(await lbp.paused()).to.equal(false);
    });

    it("should finalize allocations into vesting", async () => {
        const amount = ONE_ETH;
        const nonce = 99;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });

        await mineTo(await lbp.commitEnd() + 1n);
        await lbp.connect(user1).revealBid(amount, nonce);

        await mineTo(await lbp.revealEnd() + 1n);
        await lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address]);

        const vested = await vesting.allocations(user1.address);
        expect(vested).to.be.gt(0);
    });

    it("should withdraw ETH to treasury", async () => {
        await owner.sendTransaction({ to: await lbp.getAddress(), value: ONE_ETH });
        const before = await ethers.provider.getBalance(treasury.address);

        await lbp.connect(owner).withdrawETH(treasury.address, ONE_ETH);

        const after = await ethers.provider.getBalance(treasury.address);
        expect(after - before).to.equal(ONE_ETH);
    });


    // Add these tests inside the describe("SecureLBP", function () { ... }) block

    // --- Commit/Reveal Edge Cases ---
    it("should revert on commit with zero ETH", async () => {
        const nonce = 123;
        const hash = buildCommit(user1, 0n, nonce, await lbp.getAddress());
        await mineTo(await lbp.startTime() + 1n);
        await expect(
            lbp.connect(user1).commitBid(hash, { value: 0 })
        ).to.be.revertedWith("zero bid");
    });

    it("should revert on commit outside commit window", async () => {
        const amount = ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        // Before commit phase
        const startTime = await lbp.startTime();
        await mineToExact(startTime - 2n); // Set timestamp to startTime - 2 to avoid same-timestamp issue
        const block = await ethers.provider.getBlock("latest");
        await expect(
            lbp.connect(user1).commitBid(hash, { value: amount })
        ).to.be.revertedWith("not in commit window");

        // After commit phase
        await mineTo(await lbp.commitEnd() + 1n);
        await expect(
            lbp.connect(user1).commitBid(hash, { value: amount })
        ).to.be.revertedWith("not in commit window");
    });

    it("should revert on reveal outside reveal window", async () => {
        const amount = ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });

        // Before reveal phase
        await expect(
            lbp.connect(user1).revealBid(amount, nonce)
        ).to.be.revertedWith("not in reveal window");

        // After reveal phase
        await mineTo(await lbp.revealEnd() + 1n);
        await expect(
            lbp.connect(user1).revealBid(amount, nonce)
        ).to.be.revertedWith("not in reveal window");
    });

    it("should revert on commit exceeding max contribution cap", async () => {
        const cap = ethers.parseEther("2");
        await lbp.connect(owner).setMaxContributionPerAddress(cap);
        const amount = cap + ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await expect(
            lbp.connect(user1).commitBid(hash, { value: amount })
        ).to.be.revertedWith("exceeds per-address cap");
    });

    it("should allow multiple commits from the same user", async () => {
        const amount1 = ONE_ETH;
        const amount2 = ethers.parseEther("0.5");
        const nonce1 = 123;
        const nonce2 = 124;
        const hash1 = buildCommit(user1, amount1, nonce1, await lbp.getAddress());
        const hash2 = buildCommit(user1, amount2, nonce2, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash1, { value: amount1 });
        await lbp.connect(user1).commitBid(hash2, { value: amount2 });

        await mineTo(await lbp.commitEnd() + 1n);
        await lbp.connect(user1).revealBid(amount1, nonce1);
        await lbp.connect(user1).revealBid(amount2, nonce2);

        const alloc = await lbp.allocations(user1.address);
        expect(alloc).to.be.gt(0);
        expect(await lbp.totalCommittedBy(user1.address)).to.equal(amount1 + amount2);
    });

    // --- Oracle Pause Behavior ---
    it("should revert commit when oracle is paused", async () => {
        // Simulate price anomaly to trigger pause
        await feed.setPrice(ethers.parseUnits("1000", 8));
        await oracle.computeAdaptiveFee();
        await feed.setPrice(ethers.parseUnits("700", 8)); // 30% drop, triggers pause
        await oracle.computeAdaptiveFee();

        const amount = ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await expect(
            lbp.connect(user1).commitBid(hash, { value: amount })
        ).to.be.revertedWith("paused by oracle");
    });

    it("should revert reveal when oracle is paused", async () => {
        const amount = ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });

        // Simulate price anomaly to trigger pause
        await feed.setPrice(ethers.parseUnits("1000", 8));
        await oracle.computeAdaptiveFee();
        await feed.setPrice(ethers.parseUnits("700", 8)); // 30% drop, triggers pause
        await oracle.computeAdaptiveFee();

        await mineTo(await lbp.commitEnd() + 1n);
        await expect(
            lbp.connect(user1).revealBid(amount, nonce)
        ).to.be.revertedWith("paused by oracle");
    });

    // --- Administrative Functions ---
    it("should allow owner to set treasury address", async () => {
        const newTreasury = user2.address;
        await lbp.connect(owner).setTreasury(newTreasury);
        expect(await lbp.treasury()).to.equal(newTreasury);
    });

    it("should revert treasury set to zero address", async () => {
        await expect(
            lbp.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWith("zero");
    });

    it("should allow owner to rescue non-sale ERC20 tokens", async () => {
        // Deploy a different token to rescue
        const OtherToken = await ethers.getContractFactory("TestToken");
        const otherToken = await OtherToken.deploy(ethers.parseEther("1000"));
        await otherToken.waitForDeployment();

        // Send some tokens to LBP contract
        const amount = ethers.parseEther("100");
        await otherToken.transfer(await lbp.getAddress(), amount);

        // Rescue tokens
        const beforeBal = await otherToken.balanceOf(user1.address);
        await lbp.connect(owner).rescueERC20(await otherToken.getAddress(), user1.address, amount);
        const afterBal = await otherToken.balanceOf(user1.address);

        expect(afterBal - beforeBal).to.equal(amount);
    });

    it("should revert rescue of sale token", async () => {
        const amount = ethers.parseEther("100");
        await expect(
            lbp.connect(owner).rescueERC20(await token.getAddress(), user1.address, amount)
        ).to.be.revertedWith("cannot rescue sale token");
    });

    // --- Fee Logic ---
    it("should fallback to linear schedule if oracle fails", async () => {
        // Break oracle by setting zero address (simulating failure)
        await lbp.connect(owner).setOracle(ethers.ZeroAddress);

        await mineTo(await lbp.startTime() + 10n); // Small elapsed time
        const lbpFee = await lbp.currentFeeBP();
        // Linear schedule: initialFeeBP = 1000, finalFeeBP = 100, duration = 120s
        // At 10s: 1000 - ((1000-100) * 10 / 120) ≈ 925
        expect(lbpFee).to.be.closeTo(925n, 10n); // Allow small deviation due to timestamp
    });

    it("should use maxFeeBP on significant price drop", async () => {
        await oracle.setFeeBP(200, 800);
        await feed.setPrice(ethers.parseUnits("1000", 8));
        await oracle.computeAdaptiveFee();
        await feed.setPrice(ethers.parseUnits("700", 8)); // Below 1000 * 0.8 = 800
        await oracle.computeAdaptiveFee();
        await mineTo(await lbp.startTime() + 1n);
        const oracleFee = await oracle.viewAdaptiveFee();
        expect(oracleFee).to.equal(800n); // Verify oracle fee
        const lbpFee = await lbp.currentFeeBP();
        expect(lbpFee).to.equal(oracleFee);
        expect(lbpFee).to.equal(800n); // Expect maxFeeBP
    });

    // --- Finalization Edge Cases ---
    it("should revert finalization before reveal phase ends", async () => {
        const amount = ONE_ETH;
        const nonce = 99;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });

        await mineTo(await lbp.commitEnd() + 1n);
        await lbp.connect(user1).revealBid(amount, nonce);

        // Try to finalize before revealEnd
        await expect(
            lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address])
        ).to.be.revertedWith("not ended");
    });

    it("should revert finalization with zero beneficiaries", async () => {
        await mineTo(await lbp.revealEnd() + 1n);
        await expect(
            lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), [])
        ).to.be.revertedWith("no beneficiaries");
    });

    it("should revert finalization with zero vesting address", async () => {
        await mineTo(await lbp.revealEnd() + 1n);
        await expect(
            lbp.connect(owner).finalizeToVesting(ethers.ZeroAddress, [user1.address])
        ).to.be.revertedWith("zero vesting");
    });

    // --- Refund and Penalty Edge Cases ---
    it("should revert withdrawRefund with zero amount", async () => {
        await expect(
            lbp.connect(user1).withdrawRefund()
        ).to.be.revertedWith("no refund");
    });

    it("should revert penalizing already processed commit", async () => {
        const amount = ONE_ETH;
        const nonce = 42;
        const hash = buildCommit(user2, amount, nonce, await lbp.getAddress());

        await mineTo(await lbp.startTime() + 1n);
        await lbp.connect(user2).commitBid(hash, { value: amount });

        await mineTo(await lbp.commitEnd() + 1n);
        await lbp.connect(user2).revealBid(amount, nonce);

        await mineTo(await lbp.revealEnd() + 5n);
        await expect(
            lbp.connect(owner).penalizeNonRevealed(user2.address, hash, 1000)
        ).to.be.revertedWith("nothing to penalize");
    });
});
