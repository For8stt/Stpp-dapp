# STTP DApp

**STTP (Secure Token Presale Protocol)** is a permissionless, decentralized presale platform built on Ethereum that solves critical problems in token launch mechanisms.

## What is STTP?

STTP combines three complementary mechanisms to create a secure and fair token launch framework:

1. **Commit-Reveal Dutch Auction** — Fair price discovery through cryptographic commitments and time-locked reveals
2. **Liquidity Bootstrapping Pool (LBP)** — Post-auction price formation with gradual weight adjustments and oracle-driven adaptive fees
3. **Token Vesting System** — Controlled distribution with configurable unlocking schedules

## Problems Solved

Traditional presale models suffer from several critical issues that STTP addresses:

- **Unfair Allocation** — Bots and well-connected participants often get preferential treatment
- **Price Manipulation** — Front-running and MEV (Maximal Extractable Value) exploitation distort prices
- **Immediate Dumping** — Token price crashes due to coordinated sell-offs after launch

## How STTP Works

### Security Mechanisms

- **Commit-Reveal Scheme** — Prevents front-running by hiding bid details until reveal phase
- **Merkle Tree Whitelisting** — Efficient access control for early participants
- **Early Participant Bonuses** — Rewards genuine early supporters
- **Oracle-Driven Adaptive Fees** — Automatically adjusts fees and pauses trading during volatility
- **Gradual Vesting** — Prevents coordinated sell-offs through time-locked distributions

### Architecture

STTP uses a **hybrid on-chain/off-chain architecture**:

- **On-Chain**: Critical data (Merkle roots, IPFS CIDs, cryptographic commitments) for transparency and verifiability
- **Off-Chain (IPFS)**: Large datasets (Merkle proofs, bonus allocations) to minimize gas costs
- **Cryptographic Integrity**: Participants can independently verify inclusion through Merkle proofs

This design minimizes transaction costs while maintaining full cryptographic security.

## Who is This For?

This project is **open-source** and designed for:

- **Researchers** studying Web3 presale mechanisms
- **Educators** teaching decentralized finance concepts
- **Developers** building custom token launch protocols
- **Projects** seeking fair and secure token distribution

The codebase is suitable for academic study, educational purposes, and production-grade experimentation.

## Quick Start (TL;DR)

For users familiar with Web3 development, here are the essential steps:

1. **Install dependencies**: `cd contract && npm install && cd ../client && npm install`
2. **Start Hardhat node**: `cd contract && npx hardhat node` (keep running)
3. **Deploy contracts**: Open new terminal, `cd contract && npm run deploy:all`
4. **(Optional) Start IPFS**: `ipfs daemon` (for uploads only)
5. **Start frontend**: Open new terminal, `cd client && npm start`
6. **Connect wallet**: Add Hardhat Local network (RPC: `http://127.0.0.1:8545`, Chain ID: `31337`) and import test account from Hardhat node output
7. **Verify**: Open `http://localhost:3000`, connect wallet, verify connection to chainId 31337

For detailed instructions, see sections below:
- [System Requirements](#system-requirements)
- [How to Run the Project Locally](#how-to-run-the-project-locally)
- [Wallet Setup](#wallet-setup)

## 1️⃣ Architecture Overview

STTP DApp implements a decentralized presale platform with three interconnected layers:

### Smart Contracts

The Solidity contract layer provides the core on-chain functionality:

- **Dutch Auction Contract**: Implements commit-reveal auction mechanism for price discovery, with Merkle tree-based whitelisting and early participant bonus allocation
- **Liquidity Bootstrap Pool (LBP)**: Weighted automated market maker (AMM) for post-auction token trading, with time-based weight adjustments and oracle-driven adaptive fees
- **LBP Oracle**: Circuit breaker oracle that monitors price volatility and automatically pauses trading during rapid price movements, with adaptive fee management
- **Token Vesting Escrow**: Manages gradual token unlocking for participants according to configurable vesting schedules
- **Presale Manager & Factory**: Orchestrates presale lifecycle and enables permissionless presale creation through factory pattern

Contracts store only essential on-chain data (Merkle roots, IPFS Content Identifiers) while delegating large datasets to off-chain storage.

### Frontend

The React-based web application provides the user interface layer:

- Built with Create React App (CRA) and CRACO for build configuration
- Uses wagmi and RainbowKit for Ethereum wallet connectivity and transaction management
- Implements real-time data fetching from smart contracts and IPFS
- Provides interactive interfaces for presale creation, auction participation, LBP trading, and vesting claims

The frontend reads contract addresses and ABIs from deployment artifacts generated during contract deployment.

### IPFS Integration

IPFS serves as the off-chain storage layer:

- **Read Operations**: Frontend fetches whitelist Merkle proofs and bonus allocations from IPFS via public gateways
- **Write Operations**: Deployment and management scripts upload JSON files (whitelist trees, bonus allocations) to IPFS and store resulting CIDs on-chain
- **Hybrid Architecture**: On-chain CIDs enable decentralized data integrity verification while off-chain storage minimizes gas costs

This architecture follows the pattern of storing cryptographic commitments (Merkle roots, hashes) on-chain while storing full data sets off-chain, verified through cryptographic proofs.

## 2️⃣ System Requirements <a id="system-requirements"></a>

### Minimum Required Versions

The following versions represent the minimum requirements for the project to function:

- **Node.js** >= 18.x
- **npm** >= 9.x
- **IPFS (kubo/go-ipfs)** >= 0.20.x
- **Operating System**: macOS, Linux, or Windows (Windows Subsystem for Linux recommended for Windows)

### Tested Configuration

This project has been tested and verified with the following specific versions:

- **Node.js** 24.10.0
- **npm** 11.6.1
- **IPFS** 0.39.0
- **Hardhat** ^2.26.3 (installed as local dependency)

### Local Dependencies

- **Hardhat** ^2.26.3: Installed locally in `contract/` directory and executed via `npx`

> **Note**: Hardhat is installed as a local dependency rather than globally. This ensures version consistency across different environments, avoids conflicts with other projects, and guarantees reproducible builds. All Hardhat commands must be prefixed with `npx` (e.g., `npx hardhat node`).

### Browser Extensions

- **MetaMask** or **Rabby Wallet** browser extension for Web3 interactions

## 3️⃣ Repository Structure

```
sttp-dapp/
├── client/              # React frontend application
│   ├── src/
│   │   ├── components/  # React components (auction, LBP, vesting UI)
│   │   ├── hooks/       # Custom React hooks for contract interactions
│   │   ├── pages/       # Route pages
│   │   ├── services/    # Web3 services and IPFS integration
│   │   └── abi/         # Contract ABIs and addresses (generated after deployment)
│   └── package.json
│
├── contract/            # Hardhat smart contract project
│   ├── contracts/       # Solidity source files
│   │   ├── core/        # Core contracts (auction, LBP, vesting)
│   │   ├── manager/     # Presale management contracts
│   │   └── oracle/      # LBP oracle for price feeds
│   ├── scripts/         # Deployment and utility scripts
│   ├── test/            # Hardhat test suite
│   └── package.json
│
└── README.md
```

**`client/`** - Contains the React frontend built with Create React App (CRA) and CRACO. Handles user interface, wallet connections, and contract interactions.

**`contract/`** - Contains Hardhat workspace with Solidity smart contracts, deployment scripts, and test suite. All contract operations (compile, test, deploy) are executed from this directory.

## 4️⃣ Environment Variables

### Frontend (client/)

Create `client/.env` (optional):

```bash
# WalletConnect Project ID (optional, uses default if not set)
REACT_APP_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

> **Note**: The frontend will work with a default WalletConnect project ID if this variable is not set. However, for production use or to avoid rate limits, obtain a project ID from [WalletConnect Cloud](https://cloud.walletconnect.com).

### Contract Scripts (contract/)

Environment variables for contract deployment and IPFS operations:

```bash
# IPFS Upload via web3.storage (optional, for production IPFS uploads)
WEB3_STORAGE_TOKEN=your_web3_storage_token_here

# Optional deployment flags (set before running deploy:all)
STTP_DEPLOY_AUCTION_FACTORY=true
STTP_DEPLOY_UPKEEP_CONTROLLER=true
STTP_DEPLOY_LBP_ORACLE=true
STTP_LBP_PRICE_FEED=your_price_feed_address
```

**Variable Reference:**

- `WEB3_STORAGE_TOKEN`: Optional. Used by IPFS upload scripts for production deployments. If not set, scripts will attempt to use local IPFS daemon.
- `STTP_DEPLOY_*`: Optional flags to control which contracts are deployed. If not set, all contracts deploy by default.

## 5️⃣ How to Run the Project Locally <a id="how-to-run-the-project-locally"></a>

Follow these steps in order to set up and run the entire stack locally.

### Step 1: Install Dependencies

Install dependencies for both packages:

```bash
# Install contract dependencies
cd contract
npm install

# Install frontend dependencies
cd ../client
npm install
```

### Step 2: Start Local Ethereum Network

Open a terminal and start the Hardhat local network:

```bash
cd contract
npx hardhat node
```

This will:
- Start a local Ethereum node on `http://127.0.0.1:8545`
- Create 20 test accounts with pre-funded ETH
- Display account private keys and addresses in the terminal output

**Keep this terminal running** - the network must remain active while using the application.

### Step 3: Deploy Smart Contracts

Open a **new terminal** (keep the Hardhat node running) and deploy contracts:

```bash
cd contract
npm run deploy:all
```

This script will:
- Compile all Solidity contracts
- Deploy contracts to the local network
- Save contract ABIs and addresses to `client/src/abi/addresses.json`
- Display deployment summary with contract addresses

> **Important**: The deployment script automatically writes contract addresses to the frontend directory. The frontend reads these addresses to connect to deployed contracts.

### Step 4: (Optional) Start Local IPFS Daemon

For IPFS upload functionality, start a local IPFS daemon in a separate terminal:

```bash
ipfs daemon
```

If IPFS is not installed, see [IPFS Installation Guide](https://docs.ipfs.io/install/).

> **Note**: IPFS daemon is optional. The frontend can read from IPFS via public gateways without a local daemon. However, uploading files to IPFS requires either a local daemon or `WEB3_STORAGE_TOKEN` environment variable.

### Step 5: Start Frontend Application

Open a **new terminal** and start the React development server:

```bash
cd client
npm start
```

The application will:
- Start on `http://localhost:3000`
- Automatically open in your default browser
- Hot-reload on code changes

## 6️⃣ Wallet Setup <a id="wallet-setup"></a>

To interact with the application, connect a Web3 wallet to the local Hardhat network.

### MetaMask Setup

1. **Add Local Network**:
   - Open MetaMask extension → network dropdown → "Add network" → "Add a network manually"
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`

2. **Import Test Account**:
   - Copy a private key from the `npx hardhat node` terminal output
   - MetaMask: Account icon → "Import account" → paste private key

3. **Connect to Application**:
   - Switch to "Hardhat Local" network
   - Open `http://localhost:3000` → click "Connect Wallet" → approve connection

### Rabby Wallet Setup

1. **Add Local Network**:
   - Open Rabby Wallet → network dropdown → "Add Custom Network"
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Native token symbol: `ETH`

2. **Import Test Account**:
   - Copy a private key from `npx hardhat node` output
   - Rabby: Settings → "Import Account" → "Private Key" → paste and confirm

3. **Connect to Application**:
   - Switch to "Hardhat Local" network
   - Open `http://localhost:3000` → click "Connect Wallet" → select Rabby

### Security Disclaimer

**Local Testing Accounts Only**: The private keys displayed by Hardhat node are for local development and testing exclusively. These accounts:

- Should never be used on mainnet or public testnets
- Are deterministic and well-known in the development community
- Must not be shared publicly or used with real funds

Hardhat generates these accounts deterministically from a seed phrase for reproducibility in development environments. In production, use securely generated wallets with properly protected private keys.

## 7️⃣ IPFS Integration

The application uses IPFS (InterPlanetary File System) for decentralized off-chain storage of large datasets.

### Rationale

Smart contracts store only essential data on-chain (Merkle roots, CIDs) to minimize gas costs. Large datasets are stored off-chain on IPFS:

- **Whitelist Merkle Proofs**: Only the Merkle root hash is stored on-chain. Full proofs for all whitelisted addresses are stored in a JSON file on IPFS, referenced by CID.
- **Bonus Allocations**: After auction finalization, bonus token allocations and their Merkle proofs are computed off-chain and stored on IPFS, with the CID stored in the auction contract.

This hybrid approach enables cryptographic verification (via Merkle proofs) while keeping transaction costs manageable.

### Read-Only Usage

The frontend reads IPFS data without requiring local infrastructure:

- **Public Gateways**: Data is fetched via public IPFS gateways (ipfs.io, gateway.ipfs.io, cloudflare-ipfs.com)
- **Automatic Fallback**: Multiple gateway endpoints ensure availability
- **No Local Setup Required**: Works immediately after deployment scripts set IPFS CIDs in contracts
- **Decentralized Access**: Any IPFS gateway can serve the content, ensuring redundancy

When a user interacts with a presale that has whitelist or bonus allocation CIDs, the frontend automatically fetches the corresponding JSON files from IPFS and extracts the relevant proofs for the user's address.

### Write/Upload Usage

Uploading files to IPFS requires one of the following methods:

**Method 1: Local IPFS Daemon** (recommended for development)
```bash
ipfs daemon
```
The deployment and management scripts will detect the running daemon and upload files via the local HTTP API (port 5001).

**Method 2: web3.storage** (recommended for production)
```bash
export WEB3_STORAGE_TOKEN=your_token_here
```
Set the environment variable before running upload scripts. The scripts will use web3.storage's API instead of local daemon.

**Upload Scripts:**

The `contract/scripts/` directory includes utilities for IPFS operations:

- `generateWhitelistMerkle.ts`: Generates Merkle tree and proofs, outputs JSON file ready for IPFS
- `uploadToIPFS.ts`: Uploads JSON files to IPFS and returns CID
- `computeBonusAllocations.ts`: Computes bonus allocations and optionally uploads to IPFS

Usage examples:
```bash
# Generate whitelist Merkle tree
WHITELIST_FILE=whitelist.txt npm run whitelist:generate

# Upload to IPFS
WHITELIST_JSON=whitelist-merkle-ipfs.json npm run whitelist:upload
```

## 8️⃣ LBP Oracle Integration

The protocol includes a **LBPOracle** (Liquidity Bootstrapping Pool Oracle) that provides adaptive fee management and circuit breaker functionality for LBP trading.

### Oracle Architecture

The `LBPOracle` contract implements a delta-divergence oracle pattern designed specifically for buy-only LBP presales:

- **Primary Signal (Delta-Price)**: Tracks rapid price changes within the LBP itself, detecting whale buys and sudden price jumps
- **Secondary Signal (Delta-Divergence)**: Optionally compares LBP spot price against an external reference price feed (e.g., Chainlink)
- **Fail-Open Design**: Oracle failures do not block trading—if the oracle reverts or returns invalid data, the LBP falls back to its internal fee schedule

### Key Features

1. **Adaptive Fee Management**:
   - Dynamically adjusts swap fees based on market volatility
   - Base fee: 1% (100 BP) under normal conditions
   - Maximum fee: 10% (1000 BP) during high volatility periods

2. **Circuit Breaker (Pause Mechanism)**:
   - Automatically pauses trading when rapid price movements are detected
   - Prevents whale attacks and price manipulation
   - Configurable pause duration (default: 3-5 minutes)
   - Cooldown period prevents pause spam

3. **Price Anomaly Detection**:
   - **Price Jump Threshold**: Triggers when a single buy causes price to jump by more than 10% (configurable)
   - **Delta-Divergence Threshold**: Triggers when LBP price diverges from external reference by more than 10% (if external feed available)

### Oracle Configuration

The oracle is automatically configured during deployment:

- **Base Fee**: 1% (100 BP)
- **Max Fee**: 10% (1000 BP)
- **Price Jump Threshold**: 10% (1000 BP)
- **Delta-Divergence Threshold**: 10% (1000 BP)
- **Pause Duration**: 3 minutes (configurable)
- **Cooldown**: 1 minute (prevents rapid pause/unpause cycles)

### Price Feed Integration

**Current Implementation (Local Testing)**:
- Uses `MockPriceFeed` for local development and testing
- Mock feed provides a fixed price (2000 USD/ETH) for testing purposes

**Production Deployment**:
- Oracle supports Chainlink-compatible price feeds via `IChainlinkPriceFeed` interface
- Can be configured to use real Chainlink price feeds for production deployments
- The `STTP_LBP_PRICE_FEED` environment variable can specify a production price feed address

> **Note**: The oracle's primary protection mechanism (delta-price detection) works independently of external price feeds. Even without an external feed, the oracle can detect and pause trading during rapid price movements within the LBP.

### Oracle State Management

The oracle maintains per-pool state:
- `lastLbpSpotPrice`: Last recorded LBP spot price for each pool
- `lastCheckpointTime`: Timestamp of last evaluation
- `pausedUntil`: Timestamp when pause expires (per pool)
- `lastComputedFeeBP`: Last computed adaptive fee

### Frontend Integration

The frontend monitors oracle state in real-time:
- Displays oracle pause status in LBP view
- Shows countdown timer when trading is paused
- Prevents bid submission during oracle pause
- Displays adaptive fee information

### Oracle Events

The oracle emits events for monitoring:
- `OraclePaused`: Emitted when trading is paused
- `OracleResumed`: Emitted when pause expires
- `OracleFeeUpdated`: Emitted when adaptive fee changes
- `PriceAnomalyDetected`: Emitted when anomalies are detected
- `OracleEvaluation`: Detailed evaluation data for each checkpoint

## 9️⃣ Verification Checklist

After completing the setup, verify that all components are working:

### ✅ Frontend Loads
- [ ] Open `http://localhost:3000` in browser
- [ ] Application loads without console errors
- [ ] Navigation menu displays correctly

### ✅ Wallet Connection
- [ ] Wallet is connected to chainId `31337` (Hardhat Local)
- [ ] Wallet shows test account with ETH balance
- [ ] Application detects connected wallet and displays address

### ✅ Contract Interactions
- [ ] View deployed presales on "All Presales" page
- [ ] Create new presale (requires test tokens)
- [ ] Read contract data (prices, balances, status)

### ✅ IPFS Data Access
- [ ] If a presale has whitelist CID, proofs load automatically
- [ ] IPFS gateway URLs resolve correctly
- [ ] Bonus allocations load from IPFS when available

### ✅ Oracle Functionality
- [ ] Oracle is deployed and configured (check deployment output)
- [ ] Oracle address is set in PresaleManager
- [ ] LBP view displays oracle pause status correctly
- [ ] Adaptive fees update based on market conditions

### ✅ Network Status
- [ ] Hardhat node terminal shows incoming requests
- [ ] Transactions appear in Hardhat node logs
- [ ] No connection errors in browser console

## Troubleshooting

Common issues and solutions:

**Frontend cannot connect to contracts**
- Verify `client/src/abi/addresses.json` exists (created by deployment script)
- Ensure Hardhat node is running on port 8545
- Check browser console for specific error messages

**Wallet connection fails**
- Verify wallet is connected to "Hardhat Local" network (chainId 31337)
- Ensure Hardhat node is running
- Try disconnecting and reconnecting wallet

**IPFS data not loading**
- Check if IPFS CID is set in contract (some presales may not have IPFS data)
- Verify internet connection (public gateways require internet)
- Check browser console for IPFS fetch errors

**Transaction reverts**
- Verify account has sufficient ETH balance
- Check contract state (auction may be closed, presale may be finalized)
- Review Hardhat node logs for revert reasons

## Academic Context

This project serves as a bachelor's thesis implementation demonstrating a complete Web3 application architecture. The codebase emphasizes:

- **Reproducibility**: All dependencies are pinned, deployment is scripted, and the local environment is deterministic
- **Transparency**: Open-source codebase with comprehensive documentation enables independent verification
- **Completeness**: Full-stack implementation from smart contracts to user interface, including off-chain storage integration

Researchers and developers can use this repository to understand the architecture, replicate the setup, and extend the functionality. All technical decisions are documented, and the setup process is designed to be reproducible across different development environments.

## Additional Resources

- **Contract Documentation**: See `contract/README.md` for detailed contract scripts and testing
- **Hardhat Documentation**: https://hardhat.org/docs
- **IPFS Documentation**: https://docs.ipfs.io
- **RainbowKit Documentation**: https://www.rainbowkit.com/docs

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
