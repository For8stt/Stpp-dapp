const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // --- Параметри ---
    const TOTAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1,000,000 токенів
    const TOTAL_TOKENS_FOR_SALE = ethers.utils.parseEther("10000"); // 10,000 токенів на сейл
    const START_PRICE = ethers.utils.parseEther("1"); // 1 ETH за токен
    const RESERVE_PRICE = ethers.utils.parseEther("0.1"); // мін. 0.1 ETH за токен
    const SOFT_CAP = ethers.utils.parseEther("5"); // 5 ETH
    const EARLY_BONUS_DURATION = 60; // 60 секунд бонус
    const now = Math.floor(Date.now() / 1000);
    const START_TIME = now + 60; // старт через 1 хв
    const END_TIME = START_TIME + 600; // тривалість 10 хв

    // --- 1. Deploy тестовий токен ---
    const Token = await ethers.getContractFactory("ERC20PresetMinterPauser");
    const token = await Token.deploy("TestToken", "TT");
    await token.deployed();
    console.log("✅ Token deployed at:", token.address);

    // Мінтимо токени власнику
    await token.mint(deployer.address, TOTAL_SUPPLY);
    console.log("✅ Minted", TOTAL_SUPPLY.toString(), "tokens to deployer");

    // --- 2. Deploy DutchAuction-Behaviors ---
    const Auction = await ethers.getContractFactory("DutchAuction");
    const auction = await Auction.deploy(token.address, deployer.address);
    await auction.deployed();
    console.log("✅ Auction deployed at:", auction.address);

    const config = {
        startTime: START_TIME,
        commitDuration: END_TIME - START_TIME,
        revealDuration: 600,
        perAddressCap: TOTAL_TOKENS_FOR_SALE,
        softCap: SOFT_CAP,
        tokensForSale: TOTAL_TOKENS_FOR_SALE,
        bonusReserve: ethers.utils.parseEther("0"),
        earlyBonusWindow: EARLY_BONUS_DURATION,
        earlyBonusPct: 0,
        nonRevealPenaltyBps: 0,
        lbpStableShareBps: 0,
        thresholdLow: ethers.utils.parseEther("0"),
        maxDecayMultiplier: ethers.utils.parseEther("1"),
        minCommitDuration: 60,
        vestingStart: START_TIME,
        vestingDuration: 0,
        treasury: deployer.address,
        lbpTokenRecipient: deployer.address,
        lbpStableRecipient: deployer.address,
        merkleRoot: ethers.constants.HashZero,
        priceTicks: [START_PRICE, RESERVE_PRICE]
    };

    await (await auction.initializeAuction(config)).wait();
    console.log("✅ Auction deployed at:", auction.address);

    // --- 3. Передаємо токени в контракт ---
    await token.transfer(auction.address, TOTAL_TOKENS_FOR_SALE);
    console.log("✅ Transferred", TOTAL_TOKENS_FOR_SALE.toString(), "tokens to auction");

    console.log("\n🎯 Deployment complete!");
    console.log("Token address:", token.address);
    console.log("Auction address:", auction.address);
    console.log("Auction starts at:", START_TIME);
    console.log("Auction ends at:", END_TIME);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
