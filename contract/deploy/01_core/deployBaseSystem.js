import { ethers } from "hardhat";

import { getDeploymentConfig } from "../00_utils/config.js";
import { DEPLOYMENT_TAGS } from "../00_utils/constants.js";
import { deployContract, logHeader, logInfo, persistDeploymentGraph } from "../00_utils/deployHelpers.js";

async function main() {
  logHeader(" Deploying Permissionless Presale Base System");

  const deploymentConfig = getDeploymentConfig();
  const [deployer] = await ethers.getSigners();
  const { chainId } = await deployer.provider.getNetwork();

  logInfo(`Network: ${deploymentConfig.networkName} (chainId ${chainId})`);
  logInfo(`Deployer: ${deployer.address}`);

  const deploymentGraph = {
    managerImpl: null,
    publicFactory: null,
    auctionFactory: null,
    upkeepController: null,
    lbpOracle: null,
  };

  const managerImpl = await deployContract("PresaleManager", [], {
    label: "PresaleManager implementation",
  });
  deploymentGraph.managerImpl = managerImpl.target;

  const publicFactory = await deployContract("PublicPresaleFactory", [managerImpl.target], {
    label: "PublicPresaleFactory",
  });
  deploymentGraph.publicFactory = publicFactory.target;

  if (deploymentConfig.deployAuctionFactory) {
    const auctionFactory = await deployContract("AuctionFactory", [managerImpl.target], {
      label: "AuctionFactory",
    });
    deploymentGraph.auctionFactory = auctionFactory.target;
    logInfo("AuctionFactory ownership initialized to manager implementation");
  } else {
    logInfo("Skipping AuctionFactory deployment (config override)");
  }

  if (deploymentConfig.deployUpkeepController) {
    const upkeepController = await deployContract("UpkeepController", [managerImpl.target], {
      label: "UpkeepController",
    });
    deploymentGraph.upkeepController = upkeepController.target;
  } else {
    logInfo("Skipping UpkeepController deployment (config override)");
  }

  if (deploymentConfig.deployLBPOracle) {
    const lbpOracle = await deployContract("LBPOracle", [deploymentConfig.priceFeedAddress], {
      label: "LBPOracle",
    });
    deploymentGraph.lbpOracle = lbpOracle.target;
  } else {
    logInfo("Skipping LBPOracle deployment (config override)");
  }

  logHeader(" Base system contracts deployed");
  console.table(deploymentGraph);

  persistDeploymentGraph(DEPLOYMENT_TAGS.baseSystem, deploymentGraph, {
    network: deploymentConfig.networkName,
    chainId,
    deployer: deployer.address,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export default main;
