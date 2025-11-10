import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        count: 20,
      },
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  mocha: {
    timeout: 200000
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // contractSizer: { // I get the size of all contracts after npx hardhat compile
  //   alphaSort: true,
  //   runOnCompile: true,
  //   disambiguatePaths: false,
  // },
};

export default config;
