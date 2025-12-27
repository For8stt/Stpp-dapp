import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
    SecureLBP,
    TestToken,
    MockPresaleManager,
    LBPWeightedAMM,
    LBPOracle,
    MockPriceFeed
} from "../../typechain-types";

const POOL_START_WEIGHT = ethers.parseUnits("0.7", 18);
const POOL_END_WEIGHT = ethers.parseUnits("0.3", 18);
const POOL_SWAP_FEE = ethers.parseUnits("0.003", 18);
const INITIAL_POOL_TOKENS = ethers.parseEther("10000");
const INITIAL_POOL_ETH = ethers.parseEther("100");
const EXTRA_MINT = ethers.parseEther("0");

export interface LbpBaseContext {
    owner: any;
    user1: any;
    user2: any;
    treasury: any;
    auction: string;
    presaleManager: MockPresaleManager;
    token: TestToken;
    lbp: SecureLBP;
    pool: LBPWeightedAMM;
    oracle: LBPOracle;
    priceFeed: MockPriceFeed;
    startTime: bigint;
    endTime: bigint;
}

export async function deployLbpWithPoolFixture(): Promise<LbpBaseContext> {
    const signers = await ethers.getSigners();
    const [owner, user1, user2, treasury, , auctionSigner] = signers;

    const Token = await ethers.getContractFactory("TestToken");
    const token = (await Token.deploy(ethers.parseEther("1000000"))) as TestToken;
    await token.waitForDeployment();

    const PresaleManager = await ethers.getContractFactory("MockPresaleManager");
    const presaleManager = (await PresaleManager.deploy()) as MockPresaleManager;
    await presaleManager.waitForDeployment();

    const now = BigInt(await time.latest());
    const startTime = now + 20n;
    const endTime = startTime + 600n;

    const LBP = await ethers.getContractFactory("SecureLBP");
    const lbp = (await LBP.deploy(
        await token.getAddress(),
        startTime,
        endTime,
        treasury.address,
        POOL_START_WEIGHT,
        POOL_END_WEIGHT,
        POOL_SWAP_FEE,
        await presaleManager.getAddress(),
        auctionSigner.address
    )) as SecureLBP;
    await lbp.waitForDeployment();

    // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
    await lbp.connect(owner).configureFee(1, 1);

    await token.mint(await lbp.getAddress(), INITIAL_POOL_TOKENS + EXTRA_MINT);

    await lbp.connect(owner).initPoolFromAuction(INITIAL_POOL_TOKENS, { value: INITIAL_POOL_ETH });

    const pool = (await ethers.getContractAt("LBPWeightedAMM", await lbp.pool())) as LBPWeightedAMM;

    const Feed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = (await Feed.deploy(ethers.parseUnits("2000", 8))) as MockPriceFeed;
    await priceFeed.waitForDeployment();

    const Oracle = await ethers.getContractFactory("LBPOracle");
    const oracle = (await Oracle.deploy(await priceFeed.getAddress())) as LBPOracle;
    await oracle.waitForDeployment();

    await lbp.connect(owner).setOracle(await oracle.getAddress());

    return {
        owner,
        user1,
        user2,
        treasury,
        auction: auctionSigner.address,
        presaleManager,
        token,
        lbp,
        pool,
        oracle,
        priceFeed,
        startTime,
        endTime
    };
}

export interface LbpBidsContext extends LbpBaseContext {
    bidAmount: bigint;
}

export async function deployLbpWithBidsFixture(): Promise<LbpBidsContext> {
    const context = await deployLbpWithPoolFixture();
    const { lbp, user1, user2, startTime, endTime } = context;

    await time.increaseTo(startTime + 1n);

    const bidAmount = ethers.parseEther("1");
    await lbp.connect(user1).placeBid(0, { value: bidAmount });
    await lbp.connect(user2).placeBid(0, { value: bidAmount });

    await time.increaseTo(endTime + 1n);

    return {
        ...context,
        bidAmount
    };
}

export async function deployLbpWithoutPoolFixture(): Promise<Omit<LbpBaseContext, "pool">> {
    const signers = await ethers.getSigners();
    const [owner, user1, user2, treasury, , auctionSigner] = signers;

    const Token = await ethers.getContractFactory("TestToken");
    const token = (await Token.deploy(ethers.parseEther("1000000"))) as TestToken;
    await token.waitForDeployment();

    const PresaleManager = await ethers.getContractFactory("MockPresaleManager");
    const presaleManager = (await PresaleManager.deploy()) as MockPresaleManager;
    await presaleManager.waitForDeployment();

    const now = BigInt(await time.latest());
    const startTime = now + 20n;
    const endTime = startTime + 600n;

    const LBP = await ethers.getContractFactory("SecureLBP");
    const lbp = (await LBP.deploy(
        await token.getAddress(),
        startTime,
        endTime,
        treasury.address,
        POOL_START_WEIGHT,
        POOL_END_WEIGHT,
        POOL_SWAP_FEE,
        await presaleManager.getAddress(),
        auctionSigner.address
    )) as SecureLBP;
    await lbp.waitForDeployment();

    // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
    await lbp.connect(owner).configureFee(1, 1);

    const Feed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = (await Feed.deploy(ethers.parseUnits("2000", 8))) as MockPriceFeed;
    await priceFeed.waitForDeployment();

    const Oracle = await ethers.getContractFactory("LBPOracle");
    const oracle = (await Oracle.deploy(await priceFeed.getAddress())) as LBPOracle;
    await oracle.waitForDeployment();

    await lbp.connect(owner).setOracle(await oracle.getAddress());

    return {
        owner,
        user1,
        user2,
        treasury,
        auction: auctionSigner.address,
        presaleManager,
        token,
        lbp,
        oracle,
        priceFeed,
        startTime,
        endTime
    };
}
