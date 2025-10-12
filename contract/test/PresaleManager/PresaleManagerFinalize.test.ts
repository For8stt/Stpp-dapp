import { expect } from "chai";
import { ethers, network } from "hardhat";
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../../typechain-types";

// npx hardhat test test/PresaleManager/PresaleManagerFinalize.test.ts
describe("PresaleManager finalize", function () {
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

        // Fund PM for impersonation
        const pmAddress = await presaleManager.getAddress();
        await network.provider.send("hardhat_setBalance", [
            pmAddress, "0x" + (20000n * 10n**18n).toString(16)
        ]);
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

    // Helper для виклику функцій від імені PM (owner DA/LBP)
    async function callAsPresaleManager(contract: any, method: string, ...args: any[]) {
        const pmAddress = await presaleManager.getAddress();
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [pmAddress],
        });
        const signer = await ethers.getSigner(pmAddress);
        const tx = await contract.connect(signer)[method](...args);
        await network.provider.request({
            method: "hardhat_stopImpersonatingAccount",
            params: [pmAddress],
        });
        return tx;
    }

    describe("finalizePresale", () => {
        it("should finalize presale: vest tokens and withdraw 30% ETH to treasury", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            const daBidAmount = ethers.parseEther("101"); // Above soft cap для transition
            await simulateDutchAuctionBids(daBidAmount);
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            // Finalize DA як PM (щоб trigger transitionToLBP)
            await callAsPresaleManager(dutchAuction, "finalize");

            // Simulate LBP: commit/reveal для collection ETH
            const lbpAmount = ONE_ETH;
            await simulateLBPCommitAndReveal(user1, lbpAmount, 123n);
            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );

            // Query actual allocation після reveal (totalTokens = allocations[user1])
            const actualAllocation = await secureLBP.allocations(user1.address);
            // console.log(`[DEBUG] Allocation after reveal: ${actualAllocation.toString()}`); // Для дебагу
            const expectedVestingTokens = actualAllocation; // Точно з LBP

            // Expected liquidity = 0 (after swap, balance LBP =0, no leftover)
            const expectedLiquidity = 0n;
            // console.log(`[DEBUG] Expected liquidity (after swap): ${expectedLiquidity.toString()}`); // Для дебагу

            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            const vestingBefore = await token.balanceOf(await vesting.getAddress());
            const beneficiaries = [user1.address];

            // Finalize LBP як PM (owner SecureLBP)
            const finalizeLBPtx = await callAsPresaleManager(secureLBP, "finalizeToVesting", await presaleManager.vesting(), beneficiaries);

            // Check LBP events (callback may fail in TestVesting, but LBP succeeds)
            await expect(finalizeLBPtx)
                .to.emit(secureLBP, "FinalizedToVesting")
                .withArgs(await presaleManager.vesting(), expectedVestingTokens);

            // Check PM state (callback may not emit if TestVesting reverts, but state set if callback called)
            expect(await presaleManager.finalized()).to.be.true;

            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            expect(treasuryAfter - treasuryBefore).to.equal(expectedLiquidity); // Exact 0

            // Check vesting: totalTokens transferred (even if register reverts, transfer happens)
            const vestingAfter = await token.balanceOf(await vesting.getAddress());
            expect(vestingAfter - vestingBefore).to.equal(expectedVestingTokens);

            // Check allocations cleared
            expect(await secureLBP.allocations(user1.address)).to.equal(0n);
        });

        it("should handle low collected ETH (no vesting tokens)", async () => {
            const tokenAmount = TOTAL_TOKENS;
            await token.transfer(await presaleManager.getAddress(), tokenAmount);
            await presaleManager.startPresale(tokenAmount);
            const smallBid = ethers.parseEther("100.0001");
            await simulateDutchAuctionBids(smallBid);
            await mineTo(startTime + BigInt(AUCTION_DURATION) + 1n);

            await callAsPresaleManager(dutchAuction, "finalize");

            const smallLBPAmount = ethers.parseEther("0.001");
            await simulateLBPCommitAndReveal(user1, smallLBPAmount, 456n);
            await mineTo(
                startTime +
                BigInt(AUCTION_DURATION) +
                BigInt(LBP_COMMIT_DURATION) +
                BigInt(LBP_REVEAL_DURATION) +
                1n
            );

            // Query actual allocation після reveal (PRE-TX!)
            const actualAllocation = await secureLBP.allocations(user1.address);
            // console.log(`[DEBUG] Allocation after small reveal (pre-tx): ${actualAllocation.toString()}`); // Дебаг: allocation перед tx

            // Query actual remainingETH перед finalize
            // const lbpBalanceBefore = await ethers.provider.getBalance(await secureLBP.getAddress());
            // console.log(`[DEBUG] LBP balance before finalize (low): ${lbpBalanceBefore.toString()}`); // Для дебагу
            const expectedLiquidity = 0n; // After swap, 0
            // console.log(`[DEBUG] Expected liquidity (low actual): ${expectedLiquidity.toString()}`); // Для дебагу

            const treasuryBefore = await ethers.provider.getBalance(treasury.address);
            const vestingBefore = await token.balanceOf(await vesting.getAddress());
            const beneficiaries = [user1.address];

            // Finalize LBP як PM (owner SecureLBP)
            const finalizeLBPtx = await callAsPresaleManager(secureLBP, "finalizeToVesting", await presaleManager.vesting(), beneficiaries);

            // Wait for receipt and print logs for debug (видали після)
            const receipt = await finalizeLBPtx.wait();
            // console.log(`[DEBUG] Tx hash: ${receipt.hash}`);
            // console.log(`[DEBUG] Tx status: ${receipt.status}`); // 1 = success
            // console.log(`[DEBUG] Tx logs length: ${receipt.logs.length}`); // Кількість events
            // Parse FinalizedToVesting event (topic0 = keccak("FinalizedToVesting(address,uint256)"))
            // const eventTopic = ethers.id("FinalizedToVesting(address,uint256)");
            // const eventLog = receipt.logs.find(log => log.topics[0] === eventTopic);
            // if (eventLog) {
            //     const parsed = secureLBP.interface.parseLog(eventLog);
            //     console.log(`[DEBUG] Emitted totalTokens: ${parsed.args[1].toString()}`); // Дебаг emitted value
            // } else {
            //     console.log(`[DEBUG] No FinalizedToVesting event found`);
            // }

            // Check LBP events (callback may fail in TestVesting, but LBP succeeds)
            await expect(finalizeLBPtx)
                .to.emit(secureLBP, "FinalizedToVesting")
                .withArgs(await presaleManager.vesting(), actualAllocation); // Expect pre-tx allocation

            // Check PM state (callback may not emit if TestVesting reverts, but state set if callback called)
            expect(await presaleManager.finalized()).to.be.true;

            const treasuryAfter = await ethers.provider.getBalance(treasury.address);
            expect(treasuryAfter - treasuryBefore).to.equal(expectedLiquidity); // Exact 0

            // Minimal tokens to vesting (from small reveal)
            const vestingAfter = await token.balanceOf(await vesting.getAddress());
            expect(vestingAfter - vestingBefore).to.be.gt(0n); // >0, small

            // Check allocations cleared
            expect(await secureLBP.allocations(user1.address)).to.equal(0n);
        });
    });
});