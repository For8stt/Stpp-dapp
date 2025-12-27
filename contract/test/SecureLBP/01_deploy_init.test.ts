import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SecureLBP, TestToken } from "../../typechain-types";

describe("SecureLBP – 01_deploy_init", function () {
    const POOL_START_WEIGHT = ethers.parseUnits("0.7", 18);
    const POOL_END_WEIGHT = ethers.parseUnits("0.3", 18);
    const POOL_SWAP_FEE = ethers.parseUnits("0.003", 18);

    async function deployBase() {
        const [owner, treasury, presaleManager, auction] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        const token = (await Token.deploy(ethers.parseEther("1000000"))) as TestToken;
        await token.waitForDeployment();

        const now = BigInt(await time.latest());
        const start = now + 60n;
        const end = start + 600n;

        const LBP = await ethers.getContractFactory("SecureLBP");
        const lbp = (await LBP.deploy(
            await token.getAddress(),
            start,
            end,
            treasury.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            presaleManager.address,
            auction.address
        )) as SecureLBP;
        await lbp.waitForDeployment();

        // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
        await lbp.connect(owner).configureFee(1, 1);

        return { token, lbp, owner, treasury, presaleManager, auction, start, end };
    }

    async function deployWithoutContext() {
        const [, treasury] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestToken");
        const token = (await Token.deploy(ethers.parseEther("1000000"))) as TestToken;
        await token.waitForDeployment();

        const now = BigInt(await time.latest());
        const start = now + 120n;
        const end = start + 600n;

        const LBP = await ethers.getContractFactory("SecureLBP");
        const lbp = (await LBP.deploy(
            await token.getAddress(),
            start,
            end,
            treasury.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            ethers.ZeroAddress,
            ethers.ZeroAddress
        )) as SecureLBP;
        await lbp.waitForDeployment();

        // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
        const [owner] = await ethers.getSigners();
        await lbp.connect(owner).configureFee(1, 1);

        return { token, lbp };
    }

    it("should deploy SecureLBP with correct constructor parameters", async function () {
        const { token, lbp, start, end, treasury, presaleManager, auction } = await deployBase();

        expect(await lbp.token()).to.equal(await token.getAddress());
        expect(await lbp.startTime()).to.equal(start);
        expect(await lbp.endTime()).to.equal(end);
        expect(await lbp.treasury()).to.equal(treasury.address);
        expect(await lbp.poolStartWeightToken()).to.equal(POOL_START_WEIGHT);
        expect(await lbp.poolEndWeightToken()).to.equal(POOL_END_WEIGHT);
        expect(await lbp.poolSwapFee()).to.equal(POOL_SWAP_FEE);
        expect(await lbp.presaleManager()).to.equal(presaleManager.address);
        expect(await lbp.auction()).to.equal(auction.address);
    });

    it("should set the deployer as the owner", async function () {
        const { lbp, owner } = await deployBase();
        expect(await lbp.owner()).to.equal(owner.address);
    });

    it("should revert if token address is zero", async function () {
        const [, treasury] = await ethers.getSigners();
        const now = BigInt(await time.latest());
        const start = now + 60n;
        const end = start + 600n;

        const LBP = await ethers.getContractFactory("SecureLBP");
        await expect(
            LBP.deploy(
                ethers.ZeroAddress,
                start,
                end,
                treasury.address,
                POOL_START_WEIGHT,
                POOL_END_WEIGHT,
                POOL_SWAP_FEE,
                treasury.address,
                treasury.address
            )
        ).to.be.revertedWithCustomError(LBP, "ZeroToken");
    });

    it("should revert if treasury address is zero", async function () {
        const { token, start, end, presaleManager, auction } = await deployBase();

        const LBP = await ethers.getContractFactory("SecureLBP");
        await expect(
            LBP.deploy(
                await token.getAddress(),
                start,
                end,
                ethers.ZeroAddress,
                POOL_START_WEIGHT,
                POOL_END_WEIGHT,
                POOL_SWAP_FEE,
                presaleManager.address,
                auction.address
            )
        ).to.be.revertedWithCustomError(LBP, "ZeroTreasury");
    });

    it("should revert if startTime >= endTime", async function () {
        const { token } = await deployBase();
        const [, treasury, presaleManager, auction] = await ethers.getSigners();

        const now = BigInt(await time.latest());
        const start = now + 150n;

        const LBP = await ethers.getContractFactory("SecureLBP");
        await expect(
            LBP.deploy(
                await token.getAddress(),
                start,
                start,
                treasury.address,
                POOL_START_WEIGHT,
                POOL_END_WEIGHT,
                POOL_SWAP_FEE,
                presaleManager.address,
                auction.address
            )
        ).to.be.revertedWithCustomError(LBP, "InvalidTimes");

        await expect(
            LBP.deploy(
                await token.getAddress(),
                start,
                start - 1n,
                treasury.address,
                POOL_START_WEIGHT,
                POOL_END_WEIGHT,
                POOL_SWAP_FEE,
                presaleManager.address,
                auction.address
            )
        ).to.be.revertedWithCustomError(LBP, "InvalidTimes");
    });

    it("should initialize all immutable variables correctly", async function () {
        const { lbp, start, end } = await deployBase();

        expect(await lbp.poolStartWeightToken()).to.equal(POOL_START_WEIGHT);
        expect(await lbp.poolEndWeightToken()).to.equal(POOL_END_WEIGHT);
        expect(await lbp.poolSwapFee()).to.equal(POOL_SWAP_FEE);
        expect(await lbp.startTime()).to.equal(start);
        expect(await lbp.endTime()).to.equal(end);
    });

    it("should allow owner to call configurePresaleContext only once", async function () {
        const { token } = await deployBase();
        const [, , presaleManager, auction] = await ethers.getSigners();

        const now = BigInt(await time.latest());
        const start = now + 200n;
        const end = start + 400n;

        const LBP = await ethers.getContractFactory("SecureLBP");
        const [owner] = await ethers.getSigners();
        const fresh = (await LBP.deploy(
            await token.getAddress(),
            start,
            end,
            presaleManager.address,
            POOL_START_WEIGHT,
            POOL_END_WEIGHT,
            POOL_SWAP_FEE,
            ethers.ZeroAddress,
            ethers.ZeroAddress
        )) as SecureLBP;
        await fresh.waitForDeployment();

        // Configure fees: TEN_PERCENT (1) and FIFTEEN_MINUTES (1)
        await fresh.connect(owner).configureFee(1, 1);

        await fresh.configurePresaleContext(presaleManager.address, auction.address);
        await expect(
            fresh.configurePresaleContext(presaleManager.address, auction.address)
        ).to.be.revertedWithCustomError(fresh, "ContextAlreadySet");
    });

    it("should revert if configurePresaleContext is called twice or with zero addresses", async function () {
        const { lbp } = await deployWithoutContext();
        const [, , presaleManager, auction] = await ethers.getSigners();

        await expect(
            lbp.configurePresaleContext(ethers.ZeroAddress, auction.address)
        ).to.be.revertedWithCustomError(lbp, "ZeroContext");

        await expect(
            lbp.configurePresaleContext(presaleManager.address, ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(lbp, "ZeroContext");

        await lbp.configurePresaleContext(presaleManager.address, auction.address);
        await expect(
            lbp.configurePresaleContext(presaleManager.address, auction.address)
        ).to.be.revertedWithCustomError(lbp, "ContextAlreadySet");
    });

    it("should verify default values", async function () {
        const { lbp } = await deployBase();

        expect(await lbp.poolInitialized()).to.be.false;
        expect(await lbp.finalized()).to.be.false;
        expect(await lbp.totalEthRaised()).to.equal(0n);
        expect(await lbp.totalTokensAllocated()).to.equal(0n);
        expect(await lbp.feesAccumulated()).to.equal(0n);
        expect(await lbp.vestingConfigured()).to.be.false;
        expect(await lbp.vestingStart()).to.equal(0n);
        expect(await lbp.vestingCliffDuration()).to.equal(0n);
        expect(await lbp.vestingFinalDuration()).to.equal(0n);
        expect(await lbp.vestingCliffPercentBP()).to.equal(0n);
    });
});
