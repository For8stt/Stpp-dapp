# STTP Smart Contracts

Hardhat workspace containing Solidity smart contracts for the STTP (Secure Token Presale Protocol) platform. This repository implements the core on-chain logic for permissionless token presales, including Dutch Auctions, Liquidity Bootstrap Pools (LBP), and token vesting mechanisms.

## Project Structure

```
contract/
├── contracts/                # Solidity source files
│   ├── core/                # Core protocol contracts
│   │   ├── auction/        # Dutch Auction implementation
│   │   │   ├── DutchAuction.sol
│   │   │   ├── AuctionConfig.sol
│   │   │   ├── errors/
│   │   │   └── events/
│   │   ├── lbp/            # Liquidity Bootstrap Pool
│   │   │   ├── SecureLBP.sol
│   │   │   ├── WeightedAMM.sol
│   │   │   ├── errors/
│   │   │   └── events/
│   │   └── vesting/        # Token vesting escrow
│   │       ├── TokenVestingEscrow.sol
│   │       ├── errors/
│   │       └── events/
│   │
│   ├── manager/            # Presale management contracts
│   │   ├── PresaleManager.sol      # Main presale orchestrator
│   │   ├── PublicPresaleFactory.sol # Factory for permissionless presales
│   │   ├── AuctionFactory.sol      # Auction creation factory
│   │   ├── UpkeepController.sol    # Chainlink Automation integration
│   │   ├── errors/
│   │   └── events/
│   │
│   ├── oracle/             # Price oracle for LBP
│   │   ├── LBPOracle.sol  # Adaptive fee and pause oracle
│   │   └── events/
│   │
│   ├── libraries/          # Reusable Solidity libraries
│   │   ├── CommitLib.sol           # Commit-reveal utilities
│   │   ├── PriceTickLib.sol        # Price tick calculations
│   │   ├── ReserveDecayLib.sol     # Reserve decay formulas
│   │   └── VestingMath.sol         # Vesting calculations
│   │
│   ├── interfaces/         # Contract interfaces
│   │   ├── IAuction.sol
│   │   ├── ILBP.sol
│   │   ├── IPresaleManager.sol
│   │   └── ...
│   │
│   ├── mocks/              # Mock contracts for testing
│   │   ├── TestToken.sol
│   │   ├── MockPriceFeed.sol
│   │   └── ...
│   │
│   └── test-attacks/       # Attack contracts for security testing
│       ├── ReentrantDutchAuctionAttacker.sol
│       └── ...
│
├── scripts/                # Deployment and utility scripts
│   ├── deployAll.ts        # Main deployment script
│   ├── generateWhitelistMerkle.ts  # Merkle tree generation
│   ├── uploadToIPFS.ts             # IPFS upload utility
│   └── computeBonusAllocations.ts  # Bonus computation script
│
├── test/                   # Hardhat test suite
│   ├── DutchAuction/       # Dutch Auction tests (14 test files)
│   ├── SecureLBP/          # SecureLBP tests (11 test files)
│   ├── TokenVestingEscrow/ # Vesting tests (5 test files)
│   ├── PresaleManager/     # Manager tests
│   ├── PublicPresaleFactory/ # PublicPresaleFactory tests
│   ├── Scenarios/          # Integration scenario tests
│   ├── test-WeightedAMM/   # WeightedAMM unit tests
│   └── utils/              # Test utilities and fixtures
│
├── artifacts/              # Compiled contract artifacts (generated)
├── cache/                  # Hardhat compilation cache (generated)
├── coverage/               # Test coverage reports (generated)
├── typechain-types/        # TypeScript types (generated)
├── hardhat.config.ts       # Hardhat configuration
├── tsconfig.json           # TypeScript configuration
└── package.json
```

### Key Directories

**`contracts/core/`** - Core protocol contracts implementing the three main mechanisms:
- **`auction/`**: Commit-reveal Dutch Auction with Merkle whitelisting, early participant bonuses, and dynamic reserve adjustments
- **`lbp/`**: SecureLBP and WeightedAMM for post-auction liquidity bootstrapping with time-based weight schedules
- **`vesting/`**: Token vesting escrow with configurable cliff periods and linear unlock schedules

**`contracts/manager/`** - Management and orchestration layer:
- **`PresaleManager.sol`**: Main orchestrator managing the presale lifecycle (auction → LBP → vesting)
- **`PublicPresaleFactory.sol`**: Permissionless factory enabling users to create presales without approval
- **`AuctionFactory.sol`**: Factory pattern for deploying auction contracts
- **`UpkeepController.sol`**: Chainlink Automation integration for time-based operations

**`contracts/oracle/`** - External data integration:
- **`LBPOracle.sol`**: Adaptive fee calculation and pause mechanism based on price divergence and volatility

**`contracts/libraries/`** - Reusable mathematical and cryptographic utilities:
- **`CommitLib.sol`**: Merkle proof verification and commit hash calculations
- **`PriceTickLib.sol`**: Price tick indexing and conversion utilities
- **`ReserveDecayLib.sol`**: Reserve decay formula implementations
- **`VestingMath.sol`**: Vesting schedule calculations

**`contracts/interfaces/`** - Contract interface definitions for type safety and interoperability

**`contracts/mocks/`** - Mock contracts for testing external dependencies (tokens, price feeds, etc.)

**`contracts/test-attacks/`** - Malicious contracts used in security tests to verify reentrancy protection and edge case handling

**`scripts/`** - Deployment and utility scripts:
- **`deployAll.ts`**: Comprehensive deployment script that deploys all contracts, saves ABIs and addresses, and configures the system
- **`generateWhitelistMerkle.ts`**: Generates Merkle tree from address list for whitelisting
- **`uploadToIPFS.ts`**: Uploads JSON files to IPFS and returns CIDs
- **`computeBonusAllocations.ts`**: Computes bonus allocations for early participants after auction finalization

**`test/`** - Comprehensive test suite:
- Organized by contract/module with numbered test files following execution order
- **`Scenarios/`**: End-to-end integration tests covering full presale lifecycle
- **`utils/`**: Shared test fixtures and utilities for contract deployment and setup

**`artifacts/`** - Generated by Hardhat during compilation; contains compiled contract bytecode and ABIs

**`typechain-types/`** - Generated TypeScript type definitions for type-safe contract interactions in tests and scripts

## Local Presale Deployment

1. `npx hardhat node` &mdash; keep this running while you deploy contracts.
2. In another terminal run:
   - `npm run deploy:all` - deploys all contracts
3. Copy the recorded `testToken` address from `client/src/abi/addresses.json` into your presale `saleToken` field when interacting with `PresaleDeploy`.

## Available Commands

### Testing

```shell
# Run all tests
npm test

# Run specific test suites
npm run test:securelbp      # SecureLBP tests
npm run test:weightedamm    # WeightedAMM tests
npm run test:dutchauction   # DutchAuction tests
npm run test:presalemanager # PresaleManager tests
npm run test:publicpresalefactory # PublicPresaleFactory tests
npm run test:lbp            # LBP tests
npm run test:vesting        # Vesting tests
npm run test:scenarios      # Scenario tests

# Run with gas reporting
REPORT_GAS=true npm test

# Run with verbose output
npx hardhat test --verbose

# Generate coverage report
npx hardhat coverage
```

### Deployment

```shell
# Deploy all contracts
npm run deploy:all

# Compute bonus allocations
# Method 1: With environment variables
AUCTION_ADDRESS=0x11Acc5dCc46A6B4Cbbf10dDf4FaEabC231F730bC npm run bonus:compute

# Method 2: With custom output path
AUCTION_ADDRESS=0x11Acc5dCc46A6B4Cbbf10dDf4FaEabC231F730bC OUTPUT_PATH=./bonus-allocations.json npm run bonus:compute

# Method 3: Full command (if you prefer)
AUCTION_ADDRESS=0x11Acc5dCc46A6B4Cbbf10dDf4FaEabC231F730bC OUTPUT_PATH=./bonus-allocations.json npx hardhat run scripts/computeBonusAllocations.ts --network localhost
```

**Parameters:**
- `AUCTION_ADDRESS` (required) - Address of the finalized auction contract
- `OUTPUT_PATH` (optional) - Output file path (default: `./bonus-allocations.json`)

**Note:** The auction must be finalized before computing bonus allocations.





### Whitelist Merkle Root Generation

Generate Merkle tree for whitelist addresses:

```shell
# Method 1: Using environment variables
WHITELIST_FILE=whitelist.txt npm run whitelist:generate

# Method 2: With custom output file
WHITELIST_FILE=whitelist.txt OUTPUT_FILE=whitelist-merkle-ipfs.json npm run whitelist:generate
```

**Input format (`whitelist.txt`):**
- One Ethereum address per line
- Addresses can be checksummed or lowercase
- Example:
  ```
  0x1234567890123456789012345678901234567890
  0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
  ```

**Output:**
- Creates `whitelist-merkle-ipfs.json` with:
  - `merkleRoot`: Merkle root hash (use when creating auction)
  - `proofs`: Object mapping addresses to their Merkle proofs

### Upload to IPFS

Upload whitelist or bonus allocations JSON to IPFS:

```shell
# Method 1: Using environment variable
WHITELIST_JSON=whitelist-merkle-ipfs.json npm run whitelist:upload

# Method 2: Direct file path
FILE_PATH=whitelist-merkle-ipfs.json npm run whitelist:upload
```

**Setup IPFS (choose one method):**

1. **Local IPFS daemon** (recommended for development):
   ```shell
   # In a separate terminal
   npx ipfs daemon
   ```

2. **Global IPFS CLI**:
   ```shell
   npm install -g ipfs
   # Then run: ipfs daemon
   ```

3. **web3.storage** (for production):
   ```shell
   export WEB3_STORAGE_TOKEN=your_token_here
   ```

**Output:**
- Returns IPFS CID (Content Identifier)
- Use this CID in `setWhitelistCID()` function:
  ```javascript
  await auctionContract.setWhitelistCID("Qm...");
  ```


### Other Commands

```shell
# Compile contracts
npx hardhat compile

# Start local Hardhat node
npx hardhat node

# Clean build artifacts
npx hardhat clean

# Get help
npx hardhat help
```

## Quick Start Guide

### Step-by-step to start the application:

1. **Compile contracts:**
   ```shell
   npx hardhat compile
   ```

2. **Start local Hardhat node** (keep running in separate terminal):
   ```shell
   npx hardhat node
   ```

3. **Deploy all contracts:**
   ```shell
   npm run deploy:all
   ```

4. **Start frontend** (from `client` directory):
   ```shell
   cd ../client
   npm start
   ```

### Working with Whitelist:

1. **Create whitelist file** (`whitelist.txt`) with addresses (one per line)

2. **Generate Merkle root:**
   ```shell
   WHITELIST_FILE=whitelist.txt npm run whitelist:generate
   ```
   This creates `whitelist-merkle-ipfs.json` with merkleRoot and proofs.

3. **Start IPFS daemon** (in separate terminal):
   ```shell
   npx ipfs daemon
   ```

4. **Upload to IPFS:**
   ```shell
   WHITELIST_JSON=whitelist-merkle-ipfs.json npm run whitelist:upload
   ```
   Copy the returned CID.

5. **Use in auction:**
   - Use `merkleRoot` when creating the auction
   - Call `setWhitelistCID(cid)` with the IPFS CID from step 4

### Computing Bonus Allocations:

After an auction is finalized, compute bonus allocations for early participants:

```shell
# Basic usage (outputs to ./bonus-allocations.json)
AUCTION_ADDRESS=0x11Acc5dCc46A6B4Cbbf10dDf4FaEabC231F730bC npm run bonus:compute

# With custom output path
AUCTION_ADDRESS=0x11Acc5dCc46A6B4Cbbf10dDf4FaEabC231F730bC OUTPUT_PATH=./bonus-allocations.json npm run bonus:compute
```

**Requirements:**
- Auction must be finalized
- Auction must be successful
- Network must be running (localhost, testnet, or mainnet)

**Output:**
- Creates JSON file with:
  - `merkleRoot`: Merkle root for bonus allocations
  - `allocations`: Object mapping addresses to bonus quantities and proofs
  - `summary`: Summary statistics
  - `ipfsCID`: IPFS CID (if IPFS daemon is running)

**Next steps:**
1. Upload the output file to IPFS (if not already done)
2. Call `setBonusMerkleRoot(merkleRoot, ipfsCID)` on the auction contract

## Compilation and Build

**Compile contracts:**
```shell
npx hardhat compile
```

Compiled artifacts are saved to `artifacts/` directory. ABIs are automatically exported to `client/src/abi/` during deployment.

**Clean build artifacts:**
```shell
npx hardhat clean
```

This removes `artifacts/`, `cache/`, and `coverage/` directories to ensure a fresh build.

## Contract Architecture

### Core Contracts

**DutchAuction** - Implements commit-reveal auction mechanism:
- Commit phase: Participants submit hashed bids (price, quantity, nonce)
- Reveal phase: Participants reveal bids and allocations are computed
- Merkle tree-based whitelisting with IPFS proof storage
- Early participant bonus allocation system
- Dynamic reserve adjustment based on demand
- Pro-rata allocation at clearing price

**SecureLBP** - Liquidity Bootstrap Pool with security features:
- Time-based weight adjustments (token weight decreases, ETH weight increases)
- Oracle-driven adaptive fees based on price divergence
- Automatic pause mechanism for price manipulation detection
- Per-address bid caps to prevent whale domination
- Integration with PresaleManager for seamless flow

**TokenVestingEscrow** - Secure token vesting:
- Configurable cliff period and linear unlock
- Claim and claimFor functions for flexible distribution
- Pull-based claiming (no automatic transfers)
- Rescue functions for emergency situations

### Manager Contracts

**PresaleManager** - Orchestrates the complete presale lifecycle:
- Initializes and coordinates auction, LBP, and vesting contracts
- Manages token transfers and allocations
- Handles callbacks from LBP finalization
- Tracks presale state and configuration

**PublicPresaleFactory** - Permissionless presale creation:
- Deploys PresaleManager clones using EIP-1167 minimal proxy pattern
- No approval required - any user can create a presale
- Configurable for different presale parameters
- Automatic oracle injection for LBPs

## Testing

The test suite is organized by contract and covers:

- **Unit tests**: Individual contract functionality
- **Integration tests**: Contract interactions and workflows
- **Security tests**: Reentrancy, access control, edge cases
- **Scenario tests**: End-to-end presale lifecycle
- **Gas optimization tests**: Performance benchmarks

### Test Coverage by Contract

**PublicPresaleFactory** (`test/PublicPresaleFactory/`):
- Constructor validation (valid and invalid implementation addresses)
- `createPresale` function (happy path, insufficient balance/allowance, token transfer validation)
- `setLbpOracle` function (initial set, updates, access control)
- `getPresales` function (empty array, multiple presales tracking)
- Event emissions verification
- Integration with PresaleManager (clone creation, initialization, ownership)

Run specific test suites as documented in the [Available Commands](#available-commands) section.

## License

This project is part of the STTP DApp repository and is licensed under the MIT License. See the root `LICENSE` file for details.