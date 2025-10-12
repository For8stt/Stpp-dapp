import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";


// npx hardhat test test/PresaleManager/PresaleManagerTransaction.test.ts
describe("PresaleManager Transaction", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, user1: any, treasury: any;
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const START_PRICE = ethers.parseEther("0.01");
    const RESERVE_PRICE = ethers.parseEther("0.005");
    const AUCTION_DURATION = 3600; // 1 hour
    const LBP_COMMIT_DURATION = 60;
    const LBP_REVEAL_DURATION = 60;
    const EARLY_BONUS_DURATION = 300; // 5 min
    const POOL_START_WEIGHT_TOKEN = 70n * 10n ** 16n; // 0.7e18
    const POOL_END_WEIGHT_TOKEN = 30n * 10n ** 16n;   // 0.3e18
    const POOL_SWAP_FEE = 3n * 10n ** 15n;            // 0.003e18 (0.3%)

    beforeEach(async () => {
        [owner, user1, treasury] = await ethers.getSigners();

        // Reset balances to ensure sufficient funds
        await network.provider.send("hardhat_setBalance", [
            owner.address,
            "0x" + (20000n * 10n**18n).toString(16)
        ]);
        await network.provider.send("hardhat_setBalance", [
            user1.address,
            "0x" + (20000n * 10n**18n).toString(16)
        ]);

        // Deploy test token
        const Token = await ethers.getContractFactory("TestToken");
        token = (await Token.deploy(TOTAL_TOKENS)) as TestToken;
        await token.waitForDeployment();

        // Mint tokens to owner for presale
        await token.mint(owner.address, TOTAL_TOKENS);

        // Time windows
        const block = await ethers.provider.getBlock("latest");
        const now = BigInt(block!.timestamp);
        startTime = now + 10n;

        // Deploy PresaleManager (deploys DA, LBP, Vesting internally)
        const PresaleManagerFactory = await ethers.getContractFactory("PresaleManager");
        presaleManager = (await PresaleManagerFactory.deploy({
            token: await token.getAddress(),
            treasury: treasury.address,
            softCap: SOFT_CAP,
            startTime: startTime,
            auctionDuration: BigInt(AUCTION_DURATION),
            lbpCommitDuration: BigInt(LBP_COMMIT_DURATION),
            lbpRevealDuration: BigInt(LBP_REVEAL_DURATION),
            startPrice: START_PRICE,
            reservePrice: RESERVE_PRICE,
            totalTokens: TOTAL_TOKENS,
            earlyBonusDurationSeconds: BigInt(EARLY_BONUS_DURATION),
            poolStartWeightToken: POOL_START_WEIGHT_TOKEN,
            poolEndWeightToken: POOL_END_WEIGHT_TOKEN,
            poolSwapFee: POOL_SWAP_FEE
        })) as PresaleManager;
        await presaleManager.waitForDeployment();

        // Access deployed contracts
        dutchAuction = (await ethers.getContractAt("DutchAuction", await presaleManager.dutchAuction(), owner)) as DutchAuction;
        secureLBP = (await ethers.getContractAt("SecureLBP", await presaleManager.secureLBP(), owner)) as SecureLBP;
        vesting = (await ethers.getContractAt("TestVesting", await presaleManager.vesting(), owner)) as TestVesting;
    });

    // --- Helpers ---
    async function mineTo(ts: bigint) {
        const block = await ethers.provider.getBlock("latest");
        const latest = BigInt(block!.timestamp);
        if (ts <= latest) ts = latest + 1n;
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
        await ethers.provider.send("evm_mine", []);
    }

    async function simulateDutchAuctionBids(bidAmount: bigint) {
        await mineTo(startTime + 1n);
        await dutchAuction.placeBid({ value: bidAmount });
        // Process the bid
        await dutchAuction.settleBatch(100);
    }

    async function simulateLBPCommitAndReveal(user: any, amount: bigint, nonce: bigint) {
        const hash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, nonce, await secureLBP.getAddress()]
        );
        const lbpStart = BigInt(await secureLBP.startTime());
        await mineTo(lbpStart + 1n);
        // Commit with hash and value
        await secureLBP.connect(user).commitBid(hash, { value: amount });
        await mineTo(lbpStart + BigInt(LBP_COMMIT_DURATION) + 1n);
        await secureLBP.connect(user).revealBid(amount, nonce);
    }

    describe("transitionToLBP", () => {
        // Helper function to call as PresaleManager (impersonate) - returns tx for emit checks
        async function callAsPresaleManager(contract: any, method: string, ...args: any[]) {
            const pmAddress = await presaleManager.getAddress();
            // const daAddress = await dutchAuction.getAddress();
            // const lbpAddress = await secureLBP.getAddress();
            // const pmBalanceBefore = await ethers.provider.getBalance(pmAddress);
            // const daBalanceBefore = await ethers.provider.getBalance(daAddress);  // Для точного delta ETH
            // const daCollectedBefore = await dutchAuction.collected();
            // const daAllocatedBefore = await dutchAuction.totalAllocatedTokens();
            // const lbpTokenBefore = await token.balanceOf(lbpAddress);
            // const lbpPoolBefore = await secureLBP.poolInitialized();
            // console.log(`[DEBUG] Impersonating ${pmAddress} for ${method} on ${daAddress}`);
            // console.log(`[DEBUG] PM balance before: ${pmBalanceBefore}`);
            // console.log(`[DEBUG] DA balance before: ${daBalanceBefore}`);
            // console.log(`[DEBUG] DA collected before: ${daCollectedBefore}`);
            // console.log(`[DEBUG] DA allocated before: ${daAllocatedBefore}`);
            // console.log(`[DEBUG] LBP token balance before: ${lbpTokenBefore}`);
            // console.log(`[DEBUG] LBP poolInitialized before: ${lbpPoolBefore}`);

            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [pmAddress],
            });
            const signer = await ethers.getSigner(pmAddress);

            const tx = await contract.connect(signer)[method](...args);

            // Wait for tx to simulate inner logs
            // const receipt = await tx.wait();
            // console.log(`[DEBUG] Tx hash: ${receipt.hash}`);
            // console.log(`[DEBUG] Tx gas used: ${receipt.gasUsed}`);
            // console.log(`[DEBUG] PM balance after: ${await ethers.provider.getBalance(pmAddress)}`);
            // console.log(`[DEBUG] DA collected after: ${await dutchAuction.collected()}`);
            // console.log(`[DEBUG] DA allocated after: ${await dutchAuction.totalAllocatedTokens()}`);
            // console.log(`[DEBUG] LBP token balance after: ${await token.balanceOf(lbpAddress)}`);
            // console.log(`[DEBUG] LBP poolInitialized after: ${await secureLBP.poolInitialized()}`);

            await network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [pmAddress],
            });

            // Log if ETH was transferred (delta in PM balance)
            // const pmBalanceAfter = await ethers.provider.getBalance(pmAddress);
            // const daBalanceAfter = await ethers.provider.getBalance(daAddress);  // Для точного delta ETH
            // const receivedETH = daBalanceBefore - daBalanceAfter;  // Реальний delta ETH з DA (включає transfer)
            // const netDelta = pmBalanceAfter - pmBalanceBefore;  // PM change (received - gas)
            // console.log(`[DEBUG] ETH received from DA (balance delta): ${receivedETH}`);
            // console.log(`[DEBUG] PM net delta: ${netDelta} (received - gas)`);

            return tx;
        }

        beforeEach(async () => {
            // Fund PM globally for all tests in this describe
            const pmAddress = await presaleManager.getAddress();
            await network.provider.send("hardhat_setBalance", [
                pmAddress, "0x" + (20000n * 10n**18n).toString(16)
            ]);
            // console.log(`[DEBUG] Funded PM with 20k ETH for all transition tests`);
        });

        it("should transition to LBP after successful DutchAuction finalize", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            const bidAmount = ethers.parseEther("101"); // Above soft cap
            await simulateDutchAuctionBids(bidAmount);
            const actualAllocated = await dutchAuction.totalAllocatedTokens();
            const expectedRemaining = tokenAmount - actualAllocated;
            const expectedCollected = bidAmount;
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Add these logs
            // const daAddress = await dutchAuction.getAddress();
            // const pmAddress = await presaleManager.getAddress();
            // const lbpAddress = await secureLBP.getAddress();
            // console.log(`[DEBUG] Token balance of DA before finalize: ${await token.balanceOf(daAddress)}`);
            // console.log(`[DEBUG] Token balance of PM before finalize: ${await token.balanceOf(pmAddress)}`);
            // console.log(`[DEBUG] Token balance of LBP before finalize: ${await token.balanceOf(lbpAddress)}`);
            // console.log(`[DEBUG] totalTokens in DA: ${await dutchAuction.totalTokens()}`);
            // console.log(`[DEBUG] totalAllocatedTokens in DA: ${await dutchAuction.totalAllocatedTokens()}`);
            // console.log(`[DEBUG] Calculated remainingTokens: ${await dutchAuction.totalTokens() - await dutchAuction.totalAllocatedTokens()}`);
            // console.log(`[DEBUG] collected in DA: ${await dutchAuction.collected()}`);

            const tx = await callAsPresaleManager(dutchAuction, "finalize");
            await expect(tx)
                .to.emit(presaleManager, "TransitionToLBP")
                .withArgs(expectedCollected, expectedRemaining)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");
            expect(await presaleManager.transitioned()).to.be.true;
            expect(await presaleManager.presaleActive()).to.be.false;

            // Фікс: Очікуй leftover = remaining - floor(50%) (враховує rounding для ceil(50%))
            const expectedPoolTokens = (expectedRemaining * 50n) / 100n;
            const expectedLBPBalance = expectedRemaining - expectedPoolTokens;
            expect(await token.balanceOf(await secureLBP.getAddress())).to.equal(expectedLBPBalance);

            expect(await secureLBP.poolInitialized()).to.be.true;
        });

        it("should handle full sale in DA (remaining > 0 to init pool)", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            const fullBid = ethers.parseEther("100"); // Above soft cap
            await simulateDutchAuctionBids(fullBid);
            const actualAllocated = await dutchAuction.totalAllocatedTokens();
            const expectedRemaining = tokenAmount - actualAllocated;
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Add these logs
            // const daAddress = await dutchAuction.getAddress();
            // const pmAddress = await presaleManager.getAddress();
            // const lbpAddress = await secureLBP.getAddress();
            // console.log(`[DEBUG] Token balance of DA before finalize: ${await token.balanceOf(daAddress)}`);
            // console.log(`[DEBUG] Token balance of PM before finalize: ${await token.balanceOf(pmAddress)}`);
            // console.log(`[DEBUG] Token balance of LBP before finalize: ${await token.balanceOf(lbpAddress)}`);
            // console.log(`[DEBUG] totalTokens in DA: ${await dutchAuction.totalTokens()}`);
            // console.log(`[DEBUG] totalAllocatedTokens in DA: ${await dutchAuction.totalAllocatedTokens()}`);
            // console.log(`[DEBUG] Calculated remainingTokens: ${await dutchAuction.totalTokens() - await dutchAuction.totalAllocatedTokens()}`);
            // console.log(`[DEBUG] collected in DA: ${await dutchAuction.collected()}`);

            const tx = await callAsPresaleManager(dutchAuction, "finalize");
            await expect(tx)
                .to.emit(presaleManager, "TransitionToLBP")
                .withArgs(fullBid, expectedRemaining)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("LBP Started");
            expect(await token.balanceOf(await secureLBP.getAddress())).to.be.above(0n);
            expect(await secureLBP.poolInitialized()).to.be.true;
        });

        it("should handle failure below soft cap (no revert, emit refund)", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            await simulateDutchAuctionBids(ONE_ETH); // Below soft cap
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            const tx = await callAsPresaleManager(dutchAuction, "finalize");
            await expect(tx)
                .to.emit(presaleManager, "PresaleFailedRefund")
                .withArgs(ONE_ETH)
                .to.emit(presaleManager, "PhaseStarted")
                .withArgs("Presale Failed - Refunded");
            expect(await presaleManager.transitioned()).to.be.false;
        });
    });
});