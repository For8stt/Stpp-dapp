import { ethers } from "hardhat";

async function main() {
    const [owner, user1, user2, oracle, treasury] = await ethers.getSigners();

    // 1. Deploy TestToken
    const Token = await ethers.getContractFactory("TestToken");
    const token = await Token.deploy(ethers.parseEther("1000000"));
    await token.waitForDeployment();
    console.log("TestToken deployed at:", await token.getAddress());

    // 2. Get current block timestamp
    const block = await ethers.provider.getBlock("latest");
    const now = block!.timestamp;

    // 3. Set LBP time windows
    const start = now + 5;            // start in 5s
    const commitEnd = start + 60;     // commit lasts 60s
    const revealEnd = commitEnd + 60; // reveal lasts 60s

    // 4. Deploy SecureLBP
    const LBP = await ethers.getContractFactory("SecureLBP");
    const lbp = await LBP.deploy(
        await token.getAddress(),
        start,
        commitEnd,
        revealEnd,
        treasury.address
    );
    await lbp.waitForDeployment();
    console.log("SecureLBP deployed at:", await lbp.getAddress());

    // 5. Mint tokens directly to LBP
    await token.mint(await lbp.getAddress(), ethers.parseEther("100000"));
    console.log("Minted 100000 tokens to LBP");

    // 6. Deploy TestVesting
    const Vesting = await ethers.getContractFactory("TestVesting");
    const vesting = await Vesting.deploy();
    await vesting.waitForDeployment();
    console.log("TestVesting deployed at:", await vesting.getAddress());

    // 7. Set oracle guardian
    await lbp.connect(owner).setOracle(oracle.address);
    console.log("Oracle guardian set:", oracle.address);

    console.log("Deployment complete!");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
