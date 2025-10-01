import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed } from "../typechain-types";

// npx hardhat test test/SecureLBP-LBPOracle.test.ts
describe("SecureLBP + LBPOracle (real)", function () {
    let lbp: SecureLBP;
    let token: TestToken;
    let vesting: TestVesting;
    let oracle: LBPOracle;
    let feed: MockPriceFeed;
    let owner: any, user1: any, treasury: any;

    const ONE_ETH = ethers.parseEther("1");

    beforeEach(async () => {
        [owner, user1, treasury] = await ethers.getSigners();

        // Deploy Token
        const Token = await ethers.getContractFactory("TestToken");
        token = (await Token.deploy(ethers.parseEther("1000000"))) as TestToken;
        await token.waitForDeployment();

        // Sale times
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

        // Fund LBP with tokens
        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));

        // Deploy vesting stub
        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = (await Vesting.deploy()) as TestVesting;
        await vesting.waitForDeployment();

        // Deploy mock Chainlink feed
        const Feed = await ethers.getContractFactory("MockPriceFeed");
        feed = (await Feed.deploy(ethers.parseUnits("2000", 8))) as MockPriceFeed;
        await feed.waitForDeployment();

        // Deploy a fresh Oracle (lastPrice = 0)
        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = (await Oracle.deploy(await feed.getAddress())) as LBPOracle;
        await oracle.waitForDeployment();

        // Link Oracle to LBP
        await lbp.connect(owner).setOracle(await oracle.getAddress());
    });


    // Helper: advance block timestamp
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
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

    it("computes adaptive fee with stable price (no anomaly)", async () => {
        // Fee should stay at baseFeeBP if price stable
        await oracle.computeAdaptiveFee(); // state-changing tx
        const fee = await oracle.baseFeeBP();
        expect(fee).to.equal(100); // 1%
        const paused = await oracle.isPaused();
        expect(paused).to.equal(false);
    });

    it("triggers pause when anomaly detected", async () => {
        // price drop > threshold (20%)
        await feed.setPrice(ethers.parseUnits("1000", 8)); // from 2000 → 1000 (-50%)
        await oracle.computeAdaptiveFee(); // triggers anomaly check
        expect(await oracle.isPaused()).to.equal(true);
    });

    it("SecureLBP blocks commit when Oracle paused", async () => {
        // Force anomaly pause
        await feed.setPrice(ethers.parseUnits("1000", 8));
        await oracle.computeAdaptiveFee();
        expect(await oracle.isPaused()).to.equal(true);

        // Manually sync pause in LBP
        await lbp.connect(owner).ownerPause();

        const hash = buildCommit(user1, ONE_ETH, 1, await lbp.getAddress());

        const start = await lbp.startTime();
        await mineTo(start + 1n);

        await expect(
            lbp.connect(user1).commitBid(hash, { value: ONE_ETH })
        ).to.be.revertedWith("Pausable: paused");
    });

    it("SecureLBP still allows manual pause/unpause", async () => {
        await lbp.connect(owner).ownerPause();
        expect(await lbp.paused()).to.equal(true);

        await lbp.connect(owner).ownerUnpause();
        expect(await lbp.paused()).to.equal(false);
    });

    it("adaptive fee on moderate price drop < threshold", async () => {
        await feed.setPrice(ethers.parseUnits("1800", 8)); // -10%
        await oracle.computeAdaptiveFee();
        const fee: bigint = await oracle.viewAdaptiveFee();
        expect(Number(fee)).to.equal(100); // baseFeeBP
        expect(await oracle.isPaused()).to.equal(false);
    });


    it("adaptive fee increases on severe price drop >= threshold", async () => {
        // Ініціалізуємо lastPrice
        await feed.setPrice(ethers.parseUnits("2000", 8)); // Початкова ціна
        await oracle.computeAdaptiveFee(); // Встановлює lastPrice = 2000 * 10^8
        await feed.setPrice(ethers.parseUnits("1500", 8)); // Падіння на 25%
        await oracle.computeAdaptiveFee(); // Обчислює maxFeeBP і встановлює lastComputedFeeBP
        const fee: bigint = await oracle.viewAdaptiveFee();
        expect(Number(fee)).to.equal(1000); // Очікуємо maxFeeBP
        expect(await oracle.isPaused()).to.equal(true); // Перевіряємо паузу
    });


    it("Oracle resumes correctly after pause duration", async () => {
        await feed.setPrice(ethers.parseUnits("1000", 8)); // trigger pause
        await oracle.computeAdaptiveFee();
        expect(await oracle.isPaused()).to.equal(true);

        // Mine time beyond pauseDuration
        const pauseDuration = await oracle.pauseDuration();
        const block = await ethers.provider.getBlock("latest");
        await mineTo(BigInt(block!.timestamp) + BigInt(pauseDuration) + 1n);

        expect(await oracle.isPaused()).to.equal(false);
    });

    it("rejects revealBid if LBP is paused", async () => {
        await lbp.connect(owner).ownerPause();
        const hash = buildCommit(user1, ONE_ETH, 1, await lbp.getAddress());
        const start = await lbp.startTime();
        await mineTo(start + 1n);

        // commit
        await expect(lbp.connect(user1).commitBid(hash, { value: ONE_ETH }))
            .to.be.revertedWith("Pausable: paused");

        // reveal
        await expect(
            lbp.connect(user1).revealBid(ONE_ETH, 1)
        ).to.be.revertedWith("Pausable: paused");

    });

    it("allows commit/reveal after unpause", async () => {
        await lbp.connect(owner).ownerPause();
        await lbp.connect(owner).ownerUnpause();

        const hash = buildCommit(user1, ONE_ETH, 1, await lbp.getAddress());

        const start = await lbp.startTime();
        await mineTo(start + 1n); // у commit-вікні
        await lbp.connect(user1).commitBid(hash, { value: ONE_ETH });

        const commitEnd = await lbp.commitEnd(); // правильно
        await mineTo(commitEnd + 1n); // переходимо у reveal-вікно
        await lbp.connect(user1).revealBid(ONE_ETH, 1);
    });

    it("handles extremely large bids correctly", async () => {
        const maxContribution = await lbp.maxContributionPerAddress(); // Отримуємо ліміт
        const largeBid = maxContribution; // Використовуємо максимальний допустимий внесок

        const hash = buildCommit(user1, largeBid, 1, await lbp.getAddress());

        const start = await lbp.startTime();
        await mineTo(start + 1n);

        await lbp.connect(user1).commitBid(hash, { value: largeBid });

        const commitEnd = await lbp.commitEnd();
        await mineTo(commitEnd + 1n);

        await lbp.connect(user1).revealBid(largeBid, 1);

        const userCommitted = await lbp.totalCommittedBy(user1.address);
        expect(userCommitted).to.equal(largeBid);
    });

    it("LBP applies correct fee after adaptive fee update", async () => {
        // невелика волатильність
        await feed.setPrice(ethers.parseUnits("1800", 8));

        // Викликаємо callStatic для симуляції функції без транзакції
        await oracle.computeAdaptiveFee();
        const feeBP: bigint = await oracle.viewAdaptiveFee();

        // Перевіряємо, що LBP повертає той самий fee через internal логіку
        const lbpFee: bigint = await lbp.currentFeeBP();

        expect(lbpFee).to.equal(feeBP);
    });

    it("Oracle reports base fee when price stable", async () => {
        // Створюємо новий Oracle
        const Oracle = await ethers.getContractFactory("LBPOracle");
        const freshOracle = (await Oracle.deploy(await feed.getAddress())) as LBPOracle;
        await freshOracle.waitForDeployment();
        // Ініціалізуємо lastComputedFeeBP
        await freshOracle.computeAdaptiveFee();
        // Перевіряємо, що при стабільній ціні повертається baseFeeBP
        const feeBP: bigint = await freshOracle.viewAdaptiveFee();
        expect(feeBP).to.equal(100); // базовий feeBP
    });




});
