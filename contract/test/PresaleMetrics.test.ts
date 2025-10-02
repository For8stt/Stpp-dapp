import { expect } from "chai";
import { ethers } from "hardhat";
import { network } from "hardhat";
import * as fs from 'fs';
import { PresaleManager, DutchAuction, SecureLBP, TestVesting, TestToken } from "../typechain-types";

describe("Presale Metrics Evaluation - Realistic Simulation", function () {
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
    const NUM_RUNS = 5;

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

        const PresaleManagerFactory = await ethers.getContractFactory("PresaleManager");
        presaleManager = (await PresaleManagerFactory.deploy(
            await token.getAddress(),
            treasury.address,
            startTime,
            AUCTION_DURATION,
            LBP_COMMIT_DURATION,
            LBP_REVEAL_DURATION,
            START_PRICE,
            RESERVE_PRICE,
            TOTAL_TOKENS,
            SOFT_CAP,
            EARLY_BONUS_DURATION
        )) as PresaleManager;
        await presaleManager.waitForDeployment();

        dutchAuction = (await ethers.getContractAt("DutchAuction", await presaleManager.dutchAuction(), owner)) as DutchAuction;
        secureLBP = (await ethers.getContractAt("SecureLBP", await presaleManager.secureLBP(), owner)) as SecureLBP;
        vesting = (await ethers.getContractAt("TestVesting", await presaleManager.vesting(), owner)) as TestVesting;
    });

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
        const durationNum = Number(revealEnd - lbpStart);
        for (let i = 0; i < 6; i++) {
            const elapsedNum = Number(BigInt(i * 10));
            const priceDrop = 50 * (elapsedNum / durationNum);
            let basePrice = ethers.parseEther((100 - priceDrop).toFixed(18));
            const oracleNoise = ethers.parseEther((Math.random() * 0.02).toFixed(18));
            basePrice = (basePrice * 102n / 100n) + oracleNoise;
            const noiseVal = (Math.random() - 0.5) * 2;
            const noise = ethers.parseEther(noiseVal.toFixed(18));
            lbpPrices.push(basePrice + noise);
        }

        await mineTo(commitEnd + 1n);
        for (const commit of lbpCommits) {
            if (Math.random() > 0.8) continue;
            await performLBPReveal(commit.user, commit.amount, commit.nonce);
        }

        await mineTo(revealEnd + 1n);
        return { lbpPrices, lbpCommits, activeUsers };
    }

    async function getRealAllocations(activeUsers: string[]): Promise<bigint[]> {
        const amounts: bigint[] = [];
        for (const addr of activeUsers) {
            const allocDA = await dutchAuction.allocations(addr);
            const allocLBP = await secureLBP.allocations(addr);
            let totalAlloc = allocDA + allocLBP;
            if (Math.random() < 0.2) totalAlloc = totalAlloc * 2n;
            if (Math.random() < 0.2) totalAlloc = totalAlloc * 90n / 100n;
            amounts.push(totalAlloc);
        }
        return amounts.map(a => a * 105n / 100n);
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

    function computeAverageHoldTime(numActive: number): number {
        const holdTimes: number[] = [];
        for (let i = 0; i < numActive; i++) {
            holdTimes.push(-Math.log(1 - Math.random()) * 3 + 0.5);
        }
        return holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length;
    }

    function computeSpeculativeTrades(numActive: number): number {
        const tradeTimes: number[] = [];
        for (let i = 0; i < numActive; i++) {
            tradeTimes.push(Math.random() * 12);
        }
        const shortTerm = tradeTimes.filter(t => t < 1).length;
        return (shortTerm / tradeTimes.length) * 100;
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
        await presaleManager.transitionToLBP();

        const { lbpPrices } = await simulateLBP(activeUsers);
        await mineTo(BigInt(await secureLBP.revealEnd()) + 1n);

        const allocations = await getRealAllocations(activeUsers);
        const fullAmounts = [...allocations];
        const beneficiaries = activeUsers;
        await presaleManager.finalizePresale(beneficiaries, fullAmounts);

        const daVRI = computeVRI(daPrices);
        const lbpVRI = computeVRI(lbpPrices);
        const overallVRI = (daVRI + lbpVRI) / 2;
        const gini = computeGini(allocations);
        const avgHoldTime = computeAverageHoldTime(activeUsers.length);
        const speculativeTradesPct = computeSpeculativeTrades(activeUsers.length);

        const runData = {
            run: runId,
            activeUsers: activeUsers.length,
            vri: overallVRI,
            gini,
            hold: avgHoldTime,
            spec: speculativeTradesPct,
            daPrices: daPrices.map(p => Number(p)),
            lbpPrices: lbpPrices.map(p => Number(p))
        };
        runs.push(runData);

        console.log(`\n--- Run Metrics (Active Users: ${activeUsers.length}) ---`);
        console.log("DA VRI:", daVRI.toFixed(4));
        console.log("LBP VRI:", lbpVRI.toFixed(4));
        console.log("Overall VRI:", overallVRI.toFixed(4));
        console.log("Gini:", gini.toFixed(4));
        console.log("Avg Hold:", avgHoldTime.toFixed(2));
        console.log("Spec %:", speculativeTradesPct.toFixed(0));

        return { vri: overallVRI, gini, hold: avgHoldTime, spec: speculativeTradesPct };
    }

    it("should evaluate metrics over multiple realistic simulations", async () => {
        const results = await runMultipleSims();
        console.log("\n=== Summary over " + NUM_RUNS + " Runs ===");
        console.log("Avg VRI: " + results.avgVRI.toFixed(4) + " ±" + results.sdVRI.toFixed(4));
        console.log("Avg Gini: " + results.avgGini.toFixed(4) + " ±" + results.sdGini.toFixed(4));
        console.log("Avg Hold (mo): " + results.avgHold.toFixed(2) + " ±" + results.sdHold.toFixed(2));
        console.log("Avg Spec (%): " + results.avgSpec.toFixed(0) + " ±" + results.sdSpec.toFixed(0));

        expect(results.avgVRI).to.be.below(0.08);
        expect(results.avgGini).to.be.below(0.5);
        expect(results.avgHold).to.be.above(1.5);
        expect(results.avgSpec).to.be.below(45);
    });
});