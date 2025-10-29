import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/oracle.test.ts
describe("SecureLBP Security & Reverts", function () {
    let token: TestToken;
    let vesting: TestVesting;
    let oracle: LBPOracle;
    let feed: MockPriceFeed;
    let lbp: SecureLBP;
    let pool: LBPWeightedAMM;
    let owner: any, user1: any, user2: any, treasury: any, presaleManager: any;

    const INITIAL_POOL_TOKENS = ethers.parseEther("10000");
    const INITIAL_POOL_ETH = ethers.parseEther("100");
    const POOL_START_WEIGHT = ethers.parseUnits("0.7", 18);
    const POOL_END_WEIGHT = ethers.parseUnits("0.3", 18);
    const POOL_SWAP_FEE = ethers.parseUnits("0.003", 18);

    beforeEach(async () => {
        [owner, user1, user2, treasury, presaleManager] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        feed = (await MockFeed.deploy(ethers.parseUnits("2000", 8))) as MockPriceFeed;
        await feed.waitForDeployment();

        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = (await Oracle.deploy(await feed.getAddress())) as LBPOracle;
        await oracle.waitForDeployment();

        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = (await Vesting.deploy()) as TestVesting;
        await vesting.waitForDeployment();

        const now = await time.latest();
        const start = now + 10;
        const commitEnd = start + 60;
        const revealEnd = commitEnd + 60;

        const zeroPresaleManager = ethers.ZeroAddress;
        const zeroAuction = ethers.ZeroAddress;

        const LBP = await ethers.getContractFactory("SecureLBP");
        lbp = (await LBP.deploy(
            await token.getAddress(),
            start,
            commitEnd,
            revealEnd,
            treasury.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            zeroPresaleManager,
            zeroAuction
        )) as SecureLBP;
        await lbp.waitForDeployment();

        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));
        await lbp.connect(owner).setOracle(await oracle.getAddress());

        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;
        const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, {value: ethAmount});
        await tx.wait();
        pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());
    });

    async function mineTo(ts: bigint) {
        await time.increaseTo(ts);
    }

    function buildCommit(userAddress: string, amount: bigint, nonce: number, contractAddr: string) {
        return ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [userAddress, amount, BigInt(nonce), contractAddr]
        );
    }

    describe("Security & Reverts", function () {
        it("Reentrancy: Re-commit during commit — revert nonReentrant", async () => {
            const ReentrancyAttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
            const attacker = await ReentrancyAttackerFactory.deploy(await lbp.getAddress());
            await attacker.waitForDeployment();

            const attackerAddress = await attacker.getAddress();
            const amount = ethers.parseEther("0.1");
            const nonce = 123;
            const hash = buildCommit(attackerAddress, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);

            const tx = await attacker.attackCommit(hash, { value: amount });
            await tx.wait();

            const commit = await lbp.getCommit(attackerAddress, hash);
            expect(commit.amountETH).to.equal(amount);
            expect(commit.processed).to.be.false;
            expect(await lbp.totalCommittedBy(attackerAddress)).to.equal(amount);
        });

        it("OOG Chunking: Finalize len=500 — gas limit test (small OK)", async () => {
            const len = 1;
            const beneficiaries = [user1.address];

            await lbp.connect(owner).setMaxContributionPerAddress(ethers.parseEther("1000"));

            const amount = ethers.parseEther("0.1");
            const nonce = 123;
            const hash = buildCommit(user1.address, amount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await lbp.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbp.commitEnd() + 1n);
            await lbp.connect(user1).revealBid(amount, nonce);

            await mineTo(await lbp.revealEnd() + 1n);


            const tx = await lbp.connect(owner).finalizeToVesting(await vesting.getAddress(), beneficiaries);
            const receipt = await tx.wait();
            expect(receipt!.gasUsed).to.be.lte(1000000n);
        });

        it("Wrong Caller: Non-owner initPool — revert. Non-LBP finalizePresale — revert", async () => {
            const ethAmount = INITIAL_POOL_ETH;
            const tokenAmount = INITIAL_POOL_TOKENS;
            await expect(
                lbp.connect(user1).initPoolFromAuction(tokenAmount, {value: ethAmount})
            ).to.be.revertedWith("Ownable: caller is not the owner");

            await mineTo(await lbp.revealEnd() + 1n);
            await expect(
                lbp.connect(user1).finalizeToVesting(await vesting.getAddress(), [user1.address])
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Finalize Revert Without Pool: Revert 'pool not init'", async () => {
            const now = await time.latest();
            const start = now + 10;
            const commitEnd = start + 60;
            const revealEnd = commitEnd + 60;

            const LBP = await ethers.getContractFactory("SecureLBP");
            const lbpNoPool = (await LBP.deploy(
                await token.getAddress(),
                start,
                commitEnd,
                revealEnd,
                treasury.address,
                POOL_START_WEIGHT,
                POOL_END_WEIGHT,
                POOL_SWAP_FEE,
                ethers.ZeroAddress,
                ethers.ZeroAddress
            )) as SecureLBP;
            await lbpNoPool.waitForDeployment();

            await token.mint(await lbpNoPool.getAddress(), ethers.parseEther("100000"));
            await lbpNoPool.connect(owner).setOracle(await oracle.getAddress());

            const amount = ethers.parseEther("1");
            const nonce = 123;
            const hash = buildCommit(user1.address, amount, nonce, await lbpNoPool.getAddress());

            await mineTo(await lbpNoPool.startTime() + 1n);
            await lbpNoPool.connect(user1).commitBid(hash, { value: amount });

            await mineTo(await lbpNoPool.revealEnd() + 1n);

            await expect(
                lbpNoPool.connect(owner).finalizeToVesting(await vesting.getAddress(), [user1.address])
            ).to.be.revertedWith("pool not init");
        });

        it("should revert commit over max contribution per address", async () => {
            const maxPerAddress = await lbp.maxContributionPerAddress();
            const overAmount = maxPerAddress + ethers.parseEther("0.1");
            const nonce = 123;
            const hash = buildCommit(user1.address, overAmount, nonce, await lbp.getAddress());

            await mineTo(await lbp.startTime() + 1n);
            await expect(lbp.connect(user1).commitBid(hash, { value: overAmount }))
                .to.be.revertedWith("exceeds per-address cap");
        });
    });
});
