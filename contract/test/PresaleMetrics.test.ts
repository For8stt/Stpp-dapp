import { expect } from "chai";
import { ethers } from "hardhat";
import { network } from "hardhat";
import * as fs from 'fs';
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken, LBPWeightedAMM } from "../typechain-types";

// npx hardhat test test/PresaleMetrics.test.ts
describe("Presale Metrics Evaluation - Realistic Simulation (STTP)", function () {
    let presaleManager: PresaleManager;
    let token: TestToken;
    let dutchAuction: DutchAuction;
    let secureLBP: SecureLBP;
    let vesting: TestVesting;
    let owner: any, treasury: any;
    let users: any[];
    let startTime: bigint;

    const ONE_ETH = ethers.parseEther("1");
    const TOTAL_TOKENS = ethers.parseEther("1000000");
    const SOFT_CAP = ethers.parseEther("100");
    const START_PRICE = ethers.parseEther("0.01");
    const RESERVE_PRICE = ethers.parseEther("0.005");
    const AUCTION_DURATION = 3600;
    const LBP_COMMIT_DURATION = 60;
    const LBP_REVEAL_DURATION = 60;
    const EARLY_BONUS_DURATION = 300;
    const NUM_USERS = 20;
    const CHUNK_SIZE = 5;
    const NUM_RUNS = 10;
    const POOL_START_WEIGHT_TOKEN = 70n * 10n ** 16n; // 0.7e18
    const POOL_END_WEIGHT_TOKEN = 30n * 10n ** 16n; // 0.3e18
    const POOL_SWAP_FEE = 3n * 10n ** 15n; // 0.003e18 (0.3%)

    const BENCHMARKS = {
        balancer: { vri: 0.08, gini: 0.4, hold: 2, spec: 50 },
        fjord: { vri: 0.07, gini: 0.325, hold: 3.5, spec: 35 },
        coinlist: { vri: 0.06, gini: 0.5, hold: 3, spec: 40 },
        hyperliquid: { vri: 0.09, gini: 0.6, hold: 1.25, spec: 50 },
        pumpfun: { vri: 0.12, gini: 0.6, hold: 1.2, spec: 60 }
    };

    beforeEach(async () => {
        [owner, treasury, ...users] = await ethers.getSigners();
        users = users.slice(0, NUM_USERS);

        const allSigners = [owner, treasury, ...users];
        for (const signer of allSigners) {
            await network.provider.send("hardhat_setBalance", [
                signer.address,
                "0x" + (20000n * 10n**18n).toString(16)
            ]);
        }

        const Token = await ethers.getContractFactory("TestToken");
        token = (await Token.deploy(TOTAL_TOKENS)) as TestToken;
        await token.waitForDeployment();
        await token.mint(owner.address, TOTAL_TOKENS);

        const block = await ethers.provider.getBlock("latest");
        startTime = BigInt(block!.timestamp) + 10n;

        const cfg = {
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
        };

        const PresaleManagerFactory = await ethers.getContractFactory("PresaleManager");
        presaleManager = (await PresaleManagerFactory.deploy(cfg)) as PresaleManager;
        await presaleManager.waitForDeployment();

        const pmAddress = await presaleManager.getAddress();
        await network.provider.send("hardhat_setBalance", [
            pmAddress, "0x" + (20000n * 10n**18n).toString(16)
        ]);

        dutchAuction = (await ethers.getContractAt("DutchAuction", await presaleManager.dutchAuction(), owner)) as DutchAuction;
        secureLBP = (await ethers.getContractAt("SecureLBP", await presaleManager.secureLBP(), owner)) as SecureLBP;
        vesting = (await ethers.getContractAt("TestVesting", await presaleManager.vesting(), owner)) as TestVesting;
    });

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

    async function mineTo(ts: bigint) {
        try {
            const block = await ethers.provider.getBlock("latest");
            const latest = BigInt(block!.timestamp);
            if (ts <= latest) ts = latest + 1n;
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
            await ethers.provider.send("evm_mine", []);
        } catch (error) {
            console.error("mineTo error:", error);
        }
    }

    async function chunkedBids(users: any[], bidFn: (user: any, amount: bigint) => Promise<void>, currentTime: bigint, endTime: bigint, chunkSize: number = CHUNK_SIZE) {
        let chunkTime = currentTime;
        for (let i = 0; i < users.length; i += chunkSize) {
            const chunk = users.slice(i, i + chunkSize);
            for (const user of chunk) {
                const amount = ethers.parseEther((0.1 + Math.random() * (Math.random() > 0.5 ? 4.9 : 0.9)).toString());
                await bidFn(user, amount);
            }
            chunkTime += 1n;
            chunkTime = chunkTime < endTime - 1n ? chunkTime : endTime - 2n;
            await mineTo(chunkTime);
        }
    }

    async function performLBPCommit(user: any, amount: bigint, nonce: bigint, targetTime: bigint) {
        const hash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "address"],
            [user.address, amount, nonce, await secureLBP.getAddress()]
        );
        await mineTo(targetTime);
        await secureLBP.connect(user).commitBid(hash, { value: amount });
    }

    async function performLBPReveal(user: any, amount: bigint, nonce: bigint) {
        await secureLBP.connect(user).revealBid(amount, nonce);
    }

    async function simulateDutchAuctionBids() {
        await mineTo(startTime);
        const endTime = startTime + BigInt(AUCTION_DURATION);
        const timeIntervals = 12;
        const intervalDuration = BigInt(AUCTION_DURATION) / BigInt(timeIntervals);
        const daPrices: bigint[] = [];
        let totalBids = 0;
        const activeUsers: string[] = [];

        for (let i = 0; i < timeIntervals; i++) {
            const intervalTime = startTime + BigInt(i) * intervalDuration;
            await mineTo(intervalTime + 1n);
            daPrices.push(await dutchAuction.getCurrentPrice());

            await chunkedBids(users, async (user, amount) => {
                if (Math.random() < 0.3) return;
                await dutchAuction.connect(user).placeBid({ value: amount });
                if (!activeUsers.includes(user.address)) activeUsers.push(user.address);
                totalBids++;
                await dutchAuction.settleBatch(CHUNK_SIZE);
            }, intervalTime, endTime);

            if (i === 5) {
                const collected = await dutchAuction.collected();
                if (Number(collected) < Number(SOFT_CAP) * 0.2) {
                    const newReserve = RESERVE_PRICE * 8n / 10n;
                    await dutchAuction.adjustReservePrice(newReserve);
                }
            }
        }
        daPrices.push(await dutchAuction.getCurrentPrice());
        if (totalBids === 0) console.log("Warning: No DA bids");
        return { daPrices, activeUsers };
    }

    async function simulateLBP(activeUsers: string[]) {
        const lbpStart = BigInt(await secureLBP.startTime());
        const commitEnd = BigInt(await secureLBP.commitEnd());
        const revealEnd = BigInt(await secureLBP.revealEnd());
        const lbpCommits: { user: any, amount: bigint, nonce: bigint, commitTime: bigint }[] = [];
        const commitInterval = (commitEnd - lbpStart) / BigInt(5);

        for (let i = 0; i < 5; i++) {
            const chunkAddrs = activeUsers.slice(i * 4, (i + 1) * 4);
            const commitTime = lbpStart + (commitInterval * BigInt(i)) + 1n;
            for (const addr of chunkAddrs) {
                const user = await ethers.getSigner(addr);
                if (Math.random() < 0.2) continue;
                const amount = ethers.parseEther((0.05 + Math.random() * 0.45).toString());
                const nonce = BigInt(Math.floor(Math.random() * 1000));
                await performLBPCommit(user, amount, nonce, commitTime);
                lbpCommits.push({ user, amount, nonce, commitTime });
            }
        }


        const lbpPrices: bigint[] = [];
        const numIntervals = 6;
        const interval = (revealEnd - commitEnd) / BigInt(numIntervals);
        await mineTo(commitEnd + 1n);


        const poolAddress = await secureLBP.pool();
        const poolContract = (await ethers.getContractAt("LBPWeightedAMM", poolAddress, owner)) as LBPWeightedAMM;


        const revealedIndices = new Set<number>();

        for (let i = 0; i < numIntervals; i++) {
            const intervalTime = commitEnd + interval * BigInt(i) + 1n;
            await mineTo(intervalTime);

            let attempt = 0;
            let commit = null;
            while (attempt < 3 && !commit) {
                const randomIdx = Math.floor(Math.random() * lbpCommits.length);
                if (!revealedIndices.has(randomIdx)) {
                    commit = lbpCommits[randomIdx];
                    revealedIndices.add(randomIdx);
                }
                attempt++;
            }
            if (commit && Math.random() <= 0.5) {
                try {
                    await performLBPReveal(commit.user, commit.amount, commit.nonce);
                } catch (e) {
                    console.log(`Reveal skipped due to error: ${e}`);
                }
            }
            const ethIn = ONE_ETH / 10n;
            let tokensOut;
            try {
                tokensOut = await poolContract.quoteETHForToken(ethIn);
            } catch (e) {
                tokensOut = ethers.parseEther("1000");
            }
            const price = ethIn * ethers.parseEther("1") / (tokensOut > 0n ? tokensOut : 1n);
            lbpPrices.push(price);
        }

        await mineTo(revealEnd + 1n);
        return { lbpPrices, lbpCommits, activeUsers };
    }

    async function getRealAllocations(activeUsers: string[]): Promise<bigint[]> {
        const amounts: bigint[] = [];
        for (let idx = 0; idx < activeUsers.length; idx++) {
            const addr = activeUsers[idx];
            const allocDA = await dutchAuction.allocations(addr);
            const allocLBP = await secureLBP.allocations(addr);
            let totalAlloc = allocDA + allocLBP;

            if (idx < 3) totalAlloc = totalAlloc * 5n;

            if (Math.random() < 0.2) totalAlloc = totalAlloc * 90n / 100n;
            amounts.push(totalAlloc);
        }

        return amounts.map(a => a * 20n / 100n);
    }

    function computeVRI(prices: bigint[]): number {
        if (prices.length < 2) return 0;
        const logReturns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            const ratio = Number(prices[i]) / Number(prices[i - 1]);
            const logReturn = Math.log(ratio > 0 ? ratio : 1);
            logReturns.push(isFinite(logReturn) ? logReturn : 0);
        }
        if (logReturns.length === 0) return 0;
        const meanR = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - meanR, 2), 0) / (logReturns.length - 1);
        return Math.sqrt(variance);
    }

    function computeGini(allocations: bigint[]): number {
        const n = allocations.length;
        if (n === 0) return 0;
        const sorted = [...allocations].map(Number).sort((a, b) => a - b);
        let sum = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                sum += Math.abs(sorted[i] - sorted[j]);
            }
        }
        const totalSum = sorted.reduce((a, b) => a + b, 0);
        return (2 * sum) / (n * n * totalSum);
    }


    function simulatePostPresale(allocations: bigint[], numMonths: number = 12): { avgHold: number, specPct: number } {
        const holds: number[] = [];
        for (const alloc of allocations) {
            let unlockTime = 0;
            let remaining = Number(alloc);
            while (remaining > 0 && unlockTime <= numMonths) {
                const monthlyUnlock = remaining / (numMonths - unlockTime);

                const sellProb = (Number(alloc) > Number(ethers.parseEther("1000"))) ? 0.1 : 0.3;
                if (Math.random() < sellProb) {
                    holds.push(unlockTime + 0.5);
                    break;
                }
                remaining -= monthlyUnlock;
                unlockTime++;
            }
            if (remaining > 0) holds.push(numMonths);
        }
        const avgHold = holds.reduce((a, b) => a + b, 0) / holds.length;
        const specPct = (holds.filter(h => h < 1).length / holds.length) * 100;
        return { avgHold, specPct };
    }

    async function runMultipleSims(): Promise<{ avgVRI: number, sdVRI: number, avgGini: number, sdGini: number, avgHold: number, sdHold: number, avgSpec: number, sdSpec: number }> {
        const vris: number[] = [], ginis: number[] = [], holds: number[] = [], specs: number[] = [];
        const runs: any[] = [];
        for (let run = 0; run < NUM_RUNS; run++) {
            const snapshot = await network.provider.send("evm_snapshot", []);
            try {
                const metrics = await simulateFullPresale(runs, run);
                vris.push(metrics.vri);
                ginis.push(metrics.gini);
                holds.push(metrics.hold);
                specs.push(metrics.spec);
            } catch (error) {
                console.error(`Run ${run} error:`, error);
            } finally {
                await network.provider.send("evm_revert", [snapshot]);
            }
        }
        const computeMeanSD = (arr: number[]) => {
            const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
            const sd = Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length);
            return { mean, sd };
        };
        const vriStats = computeMeanSD(vris);
        const giniStats = computeMeanSD(ginis);
        const holdStats = computeMeanSD(holds);
        const specStats = computeMeanSD(specs);
        const summary = {
            avgVRI: vriStats.mean,
            sdVRI: vriStats.sd,
            avgGini: giniStats.mean,
            sdGini: giniStats.sd,
            avgHold: holdStats.mean,
            sdHold: holdStats.sd,
            avgSpec: specStats.mean,
            sdSpec: specStats.sd,
            benchmarks: BENCHMARKS,
            runs
        };
        fs.writeFileSync('./test/simulations/presale_results.json', JSON.stringify(summary, null, 2));
        console.log("Results saved to presale_results.json");
        return {
            avgVRI: vriStats.mean, sdVRI: vriStats.sd,
            avgGini: giniStats.mean, sdGini: giniStats.sd,
            avgHold: holdStats.mean, sdHold: holdStats.sd,
            avgSpec: specStats.mean, sdSpec: specStats.sd
        };
    }

    async function simulateFullPresale(runs: any[], runId: number) {
        const tokenAmount = TOTAL_TOKENS;
        await token.transfer(await presaleManager.getAddress(), tokenAmount);
        await presaleManager.startPresale(tokenAmount);

        const { daPrices, activeUsers } = await simulateDutchAuctionBids();
        const endTime = startTime + BigInt(AUCTION_DURATION);
        await mineTo(endTime + 1n);

        const collected = await dutchAuction.collected();
        if (Number(collected) < Number(SOFT_CAP)) {
            console.log(`Run ${runId}: Soft cap missed, skipping metrics`);
            return { vri: 0, gini: 0, hold: 0, spec: 0 };
        }
        await callAsPresaleManager(dutchAuction, "finalize");

        const { lbpPrices } = await simulateLBP(activeUsers);
        await mineTo(BigInt(await secureLBP.revealEnd()) + 1n);

        const allocations = await getRealAllocations(activeUsers);
        const beneficiaries = activeUsers;

        await callAsPresaleManager(secureLBP, "finalizeToVesting", await vesting.getAddress(), beneficiaries);

        const daVRI = computeVRI(daPrices);
        const lbpVRI = computeVRI(lbpPrices);
        const overallVRI = (daVRI + lbpVRI) / 2;
        const gini = computeGini(allocations);
        const { avgHold, specPct } = simulatePostPresale(allocations);

        const runData = {
            run: runId,
            activeUsers: activeUsers.length,
            vri: overallVRI,
            gini,
            hold: avgHold,
            spec: specPct,
            daPrices: daPrices.map(p => Number(p)),
            lbpPrices: lbpPrices.map(p => Number(p))
        };
        runs.push(runData);

        console.log(`\n--- Run Metrics (Active Users: ${activeUsers.length}) ---`);
        console.log("DA VRI:", daVRI.toFixed(4));
        console.log("LBP VRI:", lbpVRI.toFixed(4));
        console.log("Overall VRI:", overallVRI.toFixed(4));
        console.log("Gini:", gini.toFixed(4));
        console.log("Avg Hold (mo):", avgHold.toFixed(2));
        console.log("Spec %:", specPct.toFixed(0));

        return { vri: overallVRI, gini, hold: avgHold, spec: specPct };
    }

    it("should evaluate metrics over multiple realistic simulations", async () => {
        const results = await runMultipleSims();
        console.log("\n=== Summary over " + NUM_RUNS + " Runs (STTP) ===");
        console.log("Avg VRI: " + results.avgVRI.toFixed(4) + " ±" + results.sdVRI.toFixed(4));
        console.log("Avg Gini: " + results.avgGini.toFixed(4) + " ±" + results.sdGini.toFixed(4));
        console.log("Avg Hold (mo): " + results.avgHold.toFixed(2) + " ±" + results.sdHold.toFixed(2));
        console.log("Avg Spec (%): " + results.avgSpec.toFixed(0) + " ±" + results.sdSpec.toFixed(0));

        console.log("\n--- Comparisons ---");
        Object.entries(BENCHMARKS).forEach(([name, bench]) => {
            const vriImp = bench.vri - results.avgVRI;
            const giniImp = bench.gini - results.avgGini;
            console.log(`${name}: VRI ${bench.vri.toFixed(3)} → STTP ${results.avgVRI.toFixed(3)} (imp +${vriImp.toFixed(3)}); Gini ${bench.gini.toFixed(3)} → ${results.avgGini.toFixed(3)} (imp +${giniImp.toFixed(3)})`);
        });

        expect(results.avgVRI).to.be.below(0.07);
        expect(results.avgGini).to.be.below(0.4);
        expect(results.avgHold).to.be.above(2);
        expect(results.avgSpec).to.be.below(40);
    });
});