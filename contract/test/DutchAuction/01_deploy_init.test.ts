import { expect } from "chai";
import { ethers } from "hardhat";

describe("DutchAuction – 01_deploy_init", function () {
    async function deployAuctionFixture() {
        const [deployer, manager] = await ethers.getSigners();
        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(ethers.parseEther("1000000"));
        await token.waitForDeployment();

        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        const auction = await auctionFactory.deploy(await token.getAddress(), manager.address);
        await auction.waitForDeployment();

        return { token, auction, deployer, manager };
    }

    it("should deploy with correct saleToken and presaleManager", async function () {
        const { token, auction, manager } = await deployAuctionFixture();

        expect(await auction.saleToken()).to.equal(await token.getAddress());
        expect(await auction.presaleManager()).to.equal(manager.address);
    });

    it("owner should be msg.sender", async function () {
        const { auction, deployer } = await deployAuctionFixture();
        expect(await auction.owner()).to.equal(deployer.address);
    });

    it("decayMultiplier must be 1e18", async function () {
        const { auction } = await deployAuctionFixture();
        expect(await auction.decayMultiplier()).to.equal(1_000_000_000_000_000_000n);
    });

    it("initializes storage defaults correctly", async function () {
        const { auction, deployer } = await deployAuctionFixture();

        expect(await auction.initialized()).to.equal(false);
        expect(await auction.finalized()).to.equal(false);
        expect(await auction.tokensForSale()).to.equal(0n);
        expect(await auction.totalCommitsCount()).to.equal(0n);
        expect(await auction.commitsCount(deployer.address)).to.equal(0n);
    });

    it("should revert if saleToken == address(0)", async function () {
        const [, manager] = await ethers.getSigners();
        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        await expect(auctionFactory.deploy(ethers.ZeroAddress, manager.address)).to.be.revertedWithCustomError(
            auctionFactory,
            "SaleTokenZero"
        );
    });

    it("should revert if presaleManager == address(0)", async function () {
        const tokenFactory = await ethers.getContractFactory("TestToken");
        const token = await tokenFactory.deploy(ethers.parseEther("1"));
        await token.waitForDeployment();

        const auctionFactory = await ethers.getContractFactory("DutchAuction");
        await expect(auctionFactory.deploy(await token.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(
            auctionFactory,
            "ManagerZero"
        );
    });
});
