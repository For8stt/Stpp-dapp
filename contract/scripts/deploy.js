const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const Lock = await hre.ethers.getContractFactory("Lock");

    // деплой контракту без додаткових параметрів
    const lock = await Lock.deploy({ value: hre.ethers.parseEther("0") });

    // очікування деплою
    await lock.waitForDeployment();

    console.log(`✅ Lock deployed to: ${await lock.getAddress()}`);

    // витягуємо ABI
    const contractArtifact = path.join(
        __dirname,
        "../artifacts/contracts/unnecessary/Lock.sol/Lock.json"
    );
    const artifact = JSON.parse(fs.readFileSync(contractArtifact, "utf8"));

    // дані для фронтенду
    const contractData = {
        address: await lock.getAddress(),
        abi: artifact.abi,
    };

    const frontendDir = path.join(__dirname, "../../client/src/abi");
    const frontendPath = path.join(frontendDir, "Lock_ABI.json");
    fs.writeFileSync(frontendPath, JSON.stringify(contractData, null, 2));

    console.log(`📂 ABI & address written to ${frontendPath}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
