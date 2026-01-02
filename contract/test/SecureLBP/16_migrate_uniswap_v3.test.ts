import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployLbpWithBidsFixture } from "../utils/lbpFixtures";

async function deployEscrow(tokenAddress: string, lbpAddress: string) {
    const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await Escrow.deploy(tokenAddress, lbpAddress);
    await escrow.waitForDeployment();
    return escrow;
}

async function finalizedFixture() {
    const context = await deployLbpWithBidsFixture();
    const { lbp, owner, token } = context;
    const escrow = await deployEscrow(await token.getAddress(), await lbp.getAddress());
    await lbp.connect(owner).finalizeToVesting(await escrow.getAddress());
    return { ...context, escrow };
}

async function deployMockUniswapV3() {
    // Deploy individual mock contracts
    const WETHFactory = await ethers.getContractFactory("MockWETH9");
    const weth = await WETHFactory.deploy();
    await weth.waitForDeployment();
    
    const FactoryFactory = await ethers.getContractFactory("MockUniswapV3Factory");
    const factory = await FactoryFactory.deploy();
    await factory.waitForDeployment();
    
    const PositionManagerFactory = await ethers.getContractFactory("MockNonfungiblePositionManager");
    const positionManager = await PositionManagerFactory.deploy();
    await positionManager.waitForDeployment();
    
    return { weth, factory, positionManager };
}

describe("SecureLBP – 16_migrate_uniswap_v3", function () {
    it("should successfully migrate liquidity to Uniswap V3 when pool exists", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(finalizedFixture);
        const { weth, factory, positionManager } = await deployMockUniswapV3();
        
        // Configure Uniswap V3
        await lbp.connect(owner).setUniswapV3Config(
            await factory.getAddress(),
            await positionManager.getAddress(),
            await weth.getAddress(),
            3000
        );
        
        // Create pool so it exists
        await factory.createPool(await token.getAddress(), await weth.getAddress(), 3000);
        
        // Ensure we have ETH and tokens
        await owner.sendTransaction({
            to: await lbp.getAddress(),
            value: ethers.parseEther("1")
        });
        await token.mint(await lbp.getAddress(), ethers.parseUnits("100", 18));
        
        // Ensure we're past endTime
        const currentTime = await time.latest();
        if (currentTime < endTime) {
            await time.increaseTo(endTime + 1n);
        } else {
            await time.increase(1n); // Just increase by 1 second
        }
        
        const ethAmount = ethers.parseEther("0.5");
        const tokenAmount = ethers.parseUnits("50", 18);
        const sqrtPriceX96 = 1n << 96n; // 2^96 = 1.0 in Q64.96 format
        
        await expect(
            lbp.connect(owner).migrateLiquidityToUniswapV3(
                ethAmount,
                tokenAmount,
                3000,
                sqrtPriceX96,
                -100,
                100,
                owner.address
            )
        ).to.emit(lbp, "LiquidityMigratedToUniswapV3")
        .withArgs(ethAmount, tokenAmount, 3000, 1n);
        
        expect(await lbp.uniswapLiquidityCreated()).to.equal(true);
        expect(await lbp.uniswapPositionTokenId()).to.equal(1n);
    });

    it("should create pool if it doesn't exist", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(finalizedFixture);
        const { weth, factory, positionManager } = await deployMockUniswapV3();
        
        // Configure Uniswap V3
        await lbp.connect(owner).setUniswapV3Config(
            await factory.getAddress(),
            await positionManager.getAddress(),
            await weth.getAddress(),
            3000
        );
        
        // Ensure we have ETH and tokens
        await owner.sendTransaction({
            to: await lbp.getAddress(),
            value: ethers.parseEther("1")
        });
        await token.mint(await lbp.getAddress(), ethers.parseUnits("100", 18));
        
        // Ensure we're past endTime
        const currentTime = await time.latest();
        if (currentTime < endTime) {
            await time.increaseTo(endTime + 1n);
        } else {
            await time.increase(1n); // Just increase by 1 second
        }
        
        // Don't create pool - it should be created by createAndInitializePoolIfNecessary
        const ethAmount = ethers.parseEther("0.5");
        const tokenAmount = ethers.parseUnits("50", 18);
        const sqrtPriceX96 = 1n << 96n;
        
        await expect(
            lbp.connect(owner).migrateLiquidityToUniswapV3(
                ethAmount,
                tokenAmount,
                3000,
                sqrtPriceX96,
                -100,
                100,
                owner.address
            )
        ).to.emit(lbp, "LiquidityMigratedToUniswapV3");
        
        expect(await lbp.uniswapLiquidityCreated()).to.equal(true);
    });

    it("should handle token > weth ordering", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(finalizedFixture);
        const { weth, factory, positionManager } = await deployMockUniswapV3();
        
        // Configure Uniswap V3
        await lbp.connect(owner).setUniswapV3Config(
            await factory.getAddress(),
            await positionManager.getAddress(),
            await weth.getAddress(),
            3000
        );
        
        // Ensure we have ETH and tokens
        await owner.sendTransaction({
            to: await lbp.getAddress(),
            value: ethers.parseEther("1")
        });
        await token.mint(await lbp.getAddress(), ethers.parseUnits("100", 18));
        
        // Ensure we're past endTime
        const currentTime = await time.latest();
        if (currentTime < endTime) {
            await time.increaseTo(endTime + 1n);
        } else {
            await time.increase(1n); // Just increase by 1 second
        }
        
        // Create pool
        await factory.createPool(await token.getAddress(), await weth.getAddress(), 3000);
        
        const ethAmount = ethers.parseEther("0.5");
        const tokenAmount = ethers.parseUnits("50", 18);
        const sqrtPriceX96 = 1n << 96n;
        
        // This will test one branch (token < weth or token > weth)
        // The actual branch depends on addresses, but both paths are similar
        await expect(
            lbp.connect(owner).migrateLiquidityToUniswapV3(
                ethAmount,
                tokenAmount,
                3000,
                sqrtPriceX96,
                -100,
                100,
                owner.address
            )
        ).to.emit(lbp, "LiquidityMigratedToUniswapV3");
    });

    it("should revert when pool creation returns zero address", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(finalizedFixture);
        const { weth, factory, positionManager } = await deployMockUniswapV3();
        
        // Deploy a position manager that returns zero address
        const FailingPositionManagerFactory = await ethers.getContractFactory("FailingPositionManager");
        const failingPM = await FailingPositionManagerFactory.deploy();
        await failingPM.waitForDeployment();
        
        await lbp.connect(owner).setUniswapV3Config(
            await factory.getAddress(),
            await failingPM.getAddress(),
            await weth.getAddress(),
            3000
        );
        
        await owner.sendTransaction({
            to: await lbp.getAddress(),
            value: ethers.parseEther("1")
        });
        await token.mint(await lbp.getAddress(), ethers.parseUnits("100", 18));
        
        // Ensure we're past endTime
        const currentTime = await time.latest();
        if (currentTime < endTime) {
            await time.increaseTo(endTime + 1n);
        } else {
            await time.increase(1n); // Just increase by 1 second
        }
        // Pool doesn't exist (getPool returns zero)
        
        const ethAmount = ethers.parseEther("0.5");
        const tokenAmount = ethers.parseUnits("50", 18);
        const sqrtPriceX96 = 1n << 96n;
        
        await expect(
            lbp.connect(owner).migrateLiquidityToUniswapV3(
                ethAmount,
                tokenAmount,
                3000,
                sqrtPriceX96,
                -100,
                100,
                owner.address
            )
        ).to.be.revertedWithCustomError(lbp, "UniswapPoolCreationFailed");
    });

    it("should revert when mint fails", async function () {
        const { lbp, owner, token, endTime } = await loadFixture(finalizedFixture);
        
        // Deploy a position manager that reverts on mint
        const RevertingPositionManagerFactory = await ethers.getContractFactory("RevertingPositionManager");
        const revertingPM = await RevertingPositionManagerFactory.deploy();
        await revertingPM.waitForDeployment();
        
        const { weth, factory } = await deployMockUniswapV3();
        
        await lbp.connect(owner).setUniswapV3Config(
            await factory.getAddress(),
            await revertingPM.getAddress(),
            await weth.getAddress(),
            3000
        );
        
        await owner.sendTransaction({
            to: await lbp.getAddress(),
            value: ethers.parseEther("1")
        });
        await token.mint(await lbp.getAddress(), ethers.parseUnits("100", 18));
        
        // Ensure we're past endTime
        const currentTime = await time.latest();
        if (currentTime < endTime) {
            await time.increaseTo(endTime + 1n);
        } else {
            await time.increase(1n); // Just increase by 1 second
        }
        // Create pool so it exists
        await factory.createPool(await token.getAddress(), await weth.getAddress(), 3000);
        
        const ethAmount = ethers.parseEther("0.5");
        const tokenAmount = ethers.parseUnits("50", 18);
        const sqrtPriceX96 = 1n << 96n;
        
        await expect(
            lbp.connect(owner).migrateLiquidityToUniswapV3(
                ethAmount,
                tokenAmount,
                3000,
                sqrtPriceX96,
                -100,
                100,
                owner.address
            )
        ).to.be.revertedWithCustomError(lbp, "UniswapMintFailed");
    });
});

