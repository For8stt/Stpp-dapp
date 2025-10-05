import { expect } from "chai";
import { ethers } from "hardhat";
import { SecureLBP, TestToken, TestVesting, LBPOracle, MockPriceFeed, LBPWeightedAMM } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// npx hardhat test test/SecureLBP/gas.test.ts
describe("SecureLBP Gas & Performance", function () {
    let token: TestToken;
    let vesting: TestVesting;
    let oracle: LBPOracle;
    let feed: MockPriceFeed;
    let lbp: SecureLBP;
    let pool: LBPWeightedAMM;
    let owner: any, user1: any, treasury: any, presaleManager: any;

    const INITIAL_POOL_TOKENS = ethers.parseEther("10000");
    const INITIAL_POOL_ETH = ethers.parseEther("100");
    const POOL_START_WEIGHT = ethers.parseUnits("0.7", 18);
    const POOL_END_WEIGHT = ethers.parseUnits("0.3", 18);
    const POOL_SWAP_FEE = ethers.parseUnits("0.003", 18);
    const ONE_ETH = ethers.parseEther("1");

    beforeEach(async () => {
        [owner, user1, , treasury, presaleManager] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        feed = await MockFeed.deploy(ethers.parseUnits("2000", 8)) as MockPriceFeed;
        await feed.waitForDeployment();

        const Oracle = await ethers.getContractFactory("LBPOracle");
        oracle = await Oracle.deploy(await feed.getAddress()) as LBPOracle;
        await oracle.waitForDeployment();

        const Vesting = await ethers.getContractFactory("TestVesting");
        vesting = await Vesting.deploy() as TestVesting;
        await vesting.waitForDeployment();

        const now = await time.latest();
        const start = now + 10;
        const commitEnd = start + 60;
        const revealEnd = commitEnd + 60;

        const LBP = await ethers.getContractFactory("SecureLBP");
        lbp = await LBP.deploy(
            await token.getAddress(),
            start,
            commitEnd,
            revealEnd,
            treasury.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            presaleManager.address
        ) as SecureLBP;
        await lbp.waitForDeployment();

        await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));
        await lbp.connect(owner).setOracle(await oracle.getAddress());
    });

    function buildCommit(user: any, amount: bigint, nonce: number, contractAddr: string) {
        return ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, BigInt(nonce), contractAddr]
        );
    }

    it("Gas for initPoolFromAuction (~3M)", async () => {
        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;

        const tx = await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });
        const receipt = await tx.wait();

        // console.log("Gas used for initPoolFromAuction:", receipt!.gasUsed.toString());
        expect(receipt!.gasUsed).to.be.lt(4000000n);
    });

    it("Gas for revealBid with pool quote (~200k)", async () => {
        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;
        await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });
        pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());

        const amount = ONE_ETH;
        const nonce = 123;
        const hash = buildCommit(user1, amount, nonce, await lbp.getAddress());

        await time.increaseTo(await lbp.startTime() + 1n);
        await lbp.connect(user1).commitBid(hash, { value: amount });
        await time.increaseTo(await lbp.commitEnd() + 1n);

        const tx = await lbp.connect(user1).revealBid(amount, nonce);
        const receipt = await tx.wait();

        // console.log("Gas used for revealBid:", receipt!.gasUsed.toString());
        expect(receipt!.gasUsed).to.be.lt(300000n);
    });

    it("Gas for finalizeToVesting with 100 users (< block gas limit)", async () => {
        const ethAmount = INITIAL_POOL_ETH;
        const tokenAmount = INITIAL_POOL_TOKENS;
        await lbp.connect(owner).initPoolFromAuction(tokenAmount, { value: ethAmount });
        pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());


        const signers = await ethers.getSigners();
        const participants = signers.slice(0, 100);
        const amount = ethers.parseEther("0.1");

        await time.increaseTo(await lbp.startTime() + 1n);

        for (let i = 0; i < participants.length; i++) {
            const user = participants[i];
            const hash = buildCommit(user, amount, i, await lbp.getAddress());
            await lbp.connect(user).commitBid(hash, { value: amount });
        }

        await time.increaseTo(await lbp.commitEnd() + 1n);

        for (let i = 0; i < participants.length; i++) {
            const user = participants[i];
            await lbp.connect(user).revealBid(amount, i);
        }

        await time.increaseTo(await lbp.revealEnd() + 1n);

        const beneficiaries = participants.map(u => u.address);
        const tx = await lbp.connect(owner).finalizeToVesting(
            await vesting.getAddress(),
            beneficiaries
        );
        const receipt = await tx.wait();

        // console.log("Gas used for finalizeToVesting(100 users):", receipt!.gasUsed.toString());
        expect(receipt!.gasUsed).to.be.lt(30000000n);

    });
});
