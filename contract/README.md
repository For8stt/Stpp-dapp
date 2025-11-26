# Sample Hardhat Project

This Hardhat workspace powers the permissionless presale tooling used by the `sttp-dapp` UI.

## Local presale deployment

1. `npx hardhat node` &mdash; keep this running while you deploy contracts.
2. In another terminal run:
   - `npx hardhat run scripts/deployPresaleManagerImplementation.ts --network localhost`
   - `npx hardhat run scripts/deployPublicPresaleFactory.ts --network localhost`
   - `npx hardhat run scripts/deployTestToken.ts --network localhost` (the newly added helper that deploys `TestToken` and records its address under `client/src/abi/addresses.json`)
3. Optionally run `npx hardhat run scripts/deploy.js --network localhost` if you need the example `Lock` contract synced into `client/src/abi/Lock_ABI.json`.
4. Copy the recorded `testToken` address from `client/src/abi/addresses.json` into your presale `saleToken` field when interacting with `PresaleDeploy`.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts





//Test
npx hardhat test
npx hardhat test --verbose
npx hardhat coverage


//Compile after a change
npx hardhat compile

//Start node
npx hardhat node

//Make sure that ./ignition/parameters.json has the correct params

//Deploy
npx hardhat ignition deploy ./ignition/modules/Lock.ts --network localhost --parameters ./ignition/parameters.json

//Copy ./artifacts/contracts/Lock.sol/Lock.json abi list to client/src/utils/Lock_ABI.json


nvm install 20
nvm use 20
node -v

npx hardhat clean
npx hardhat compile

npx hardhat run scripts/deploy.js --network localhost



step by sep how to start aplication 

npx hardhat compile
npx hardhat node

npx hardhat run scripts/deploy.js --network localhost

npm start




     rm -rf contract/cache contract/artifacts
     npx hardhat node
     npx hardhat run scripts/deploy.js --network localhost
     npm run deploy:all    
```
