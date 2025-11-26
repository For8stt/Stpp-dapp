# STPP DApp

Build the contracts with Hardhat before you run or package the full stack. Inside `contract` you can run `npx hardhat compile` and, once your contracts are ready, `npx hardhat compile` again before doing a production-style frontend build with `npm run build` inside `client`.

Tests live in the contracts directory as well. Run `npx hardhat test` to execute the suite, use `npx hardhat test --verbose` when you need the extra output, enable gas reporting with `REPORT_GAS=true npx hardhat test`, and gather coverage with `npx hardhat coverage`. If you also want to exercise the React UI tests, switch into `client` and run `npm test` from there.

To work with the frontend locally, first start a local Hardhat node (`npx hardhat node`), deploy your contracts (`npx hardhat run scripts/deploy.js --network localhost` or the ignition module via `npx hardhat ignition deploy ./ignition/modules/Lock.ts`) and keep `npm start` running inside the `client` directory to launch the React app.

## Helpful commands

- `npx hardhat help`
- `npx hardhat test`
- `npx hardhat test --verbose`
- `REPORT_GAS=true npx hardhat test`
- `npx hardhat coverage`
- `npx hardhat compile`
- `npx hardhat clean`
- `npx hardhat node`
- `npx hardhat run scripts/deploy.js --network localhost`
- `npx hardhat ignition deploy ./ignition/modules/Lock.ts --network localhost --parameters ./ignition/parameters.json`
- `npm start` (from `client`)
- `npx hardhat ignition deploy ./ignition/modules/Lock.ts`
- `nvm install 20`
- `nvm use 20`
- `node -v`

## How to run locally and deploy the contracts

1. In a terminal inside the `contract` directory (after installing dependencies if needed) start a Hardhat node that the UI will talk to:

   ```bash
   cd contract
   npx hardhat node
   ```

2. Open another terminal, stay in `contract`, and make sure the contracts are compiled:

   ```bash
   npx hardhat compile
   ```

3. Deploy the base system with the dedicated script:

   ```bash
   npx hardhat run scripts/deploy/deployBaseSystem.js --network localhost
   ```

   For the simple sample Lock deployment run `npx hardhat run scripts/deploy.js --network localhost`.

4. The deploy scripts write ABI and address data; verify `client/src/abi` (or `client/src/abi/data/stppDeployments.json`) to see the exported artifacts.

5. In a separate terminal start the frontend (`cd client && npm start`) so it connects to the local contracts using the just-written ABI/address files.

6. Control which pieces deploy by setting `STTP_DEPLOY_AUCTION_FACTORY`, `STTP_DEPLOY_UPKEEP_CONTROLLER`, `STTP_DEPLOY_LBP_ORACLE`, or `STTP_LBP_PRICE_FEED` before running the deploy script—those environment variables toggle optional contracts and price feeds.
