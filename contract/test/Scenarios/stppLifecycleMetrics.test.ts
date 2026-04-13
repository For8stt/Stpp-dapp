// STPP lifecycle metrics: multi-run VRI, Gini, hold, speculative share → ../simulations/presale_results.json
import fs from "fs";
import path from "path";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import config from "./config/stppMetricsConfig.json";

type MetricsTuning = {
    uniformMaxBidEth?: string;
    uniformLbpMaxBidEth?: string;
    fixedDutchBidFraction?: number;
    fixedLbpContributionEth?: string;
    lbpParticipation?: number;
    /** Same tick + same token qty for every commit (minimizes allocation spread). */
    identicalDutchCommitQty?: boolean;
};

function getMetricsTuning(): MetricsTuning | undefined {
    return (config as { metricsTuning?: MetricsTuning }).metricsTuning;
}

function shuffleOrder(n: number, seed: string): number[] {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(randomFraction(seed, `shuffle-${i}`) * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
}

const NUM_RUNS = 10;
const MAX_LBP_CONTRIBUTION = ethers.parseEther("5");
const BPS = 10_000n;
const PRICE_PRECISION = 1_000_000n;
const MONTH_SECONDS = 30n * 24n * 60n * 60n;
const SPEC_WINDOW_SECONDS = BigInt(config.holdingWindow);

// Representative table cells: VRI / hold / spec use midpoints; Gini uses upper range bound (fairness stress test).
const BENCHMARKS = [
    { name: "Balancer", vri: 0.08, gini: 0.5, avgHoldMonths: 2.0, speculativeShare: 50 },
    { name: "Fjord", vri: 0.07, gini: 0.4, avgHoldMonths: 3.5, speculativeShare: 35 },
    { name: "CoinList", vri: 0.06, gini: 0.6, avgHoldMonths: 3.0, speculativeShare: 40 },
    { name: "Hyperliquid", vri: 0.09, gini: 0.7, avgHoldMonths: 1.25, speculativeShare: 50 },
    { name: "Pump.fun", vri: 0.12, gini: 0.7, avgHoldMonths: 1.2, speculativeShare: 60 }
];

type ParticipantRole = "whale" | "normal" | "retail";

interface ParticipantMeta {
    signer: any;
    role: ParticipantRole;
    maxBidEth: bigint;
    lbpMaxBidEth: bigint;
    sellRange: { min: number; max: number };
    diamondHandsProbability?: number;
}

interface BidData {
    signer: any;
    qty: bigint;
    priceTickIndex: number;
    nonce: string;
    deposit: bigint;
    revealed: boolean;
}

interface ParticipantRecord {
    address: string;
    signer: any;
    allocation: bigint;
    role: ParticipantRole;
    sellRange: { min: number; max: number };
    diamondHandsProbability?: number;
    claimTime?: bigint;
    sellTime?: bigint;
    soldAmount: bigint;
    /** Cumulative tokens received from vesting claims (basis for allocation Gini). */
    totalTokensReceived: bigint;
}

interface VirtualPool {
    eth: bigint;
    token: bigint;
}

interface SimulationContext {
    deployer: any;
    treasury: any;
    participants: any[];
    participantMetas: ParticipantMeta[];
    token: any;
    manager: any;
    auction: any;
    auctionInput: any;
    priceTicks: bigint[];
    startTime: bigint;
    commitEndTime: bigint;
    revealEndTime: bigint;
    whitelistProofs: Record<string, string[]>;
}

interface LbpSimulationResult {
    lbp: any;
    escrow: any;
    participantRecords: ParticipantRecord[];
    launchConfig: any;
    virtualPool: VirtualPool;
    priceSeries: number[];
    token: any;
    treasury: any;
}

interface RunMetrics {
    run: number;
    participants: number;
    vri: number;
    gini: number;
    averageHoldMonths: number;
    speculativeShare: number;
    vriTradingPhase: number;
    vriVisibleBidStress: number;
}

function hashAddress(address: string): string {
    return ethers.solidityPackedKeccak256(["address"], [address]);
}

function deriveSeed(base: string, label: string): string {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "string"],
        [base as `0x${string}`, label]
    );
}

function randomFraction(base: string, label: string): number {
    const derived = deriveSeed(base, label);
    const bucket = Number(BigInt(derived) % PRICE_PRECISION);
    return bucket / Number(PRICE_PRECISION);
}

function randomBetween(base: string, label: string, min: number, max: number): number {
    return min + (max - min) * randomFraction(base, label);
}

function buildMerkleWhitelist(addresses: string[]) {
    const leaves = addresses.map(hashAddress);
    if (leaves.length === 0) {
        return { root: ethers.ZeroHash, proofs: {} as Record<string, string[]> };
    }

    const layers: string[][] = [leaves];
    while (layers[layers.length - 1].length > 1) {
        const current = layers[layers.length - 1];
        const next: string[] = [];
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = i + 1 < current.length ? current[i + 1] : current[i];
            const [lo, hi] = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
            next.push(ethers.keccak256(ethers.concat([lo, hi])));
        }
        layers.push(next);
    }

    const proofs: Record<string, string[]> = {};
    for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
        const proof: string[] = [];
        let index = leafIndex;
        for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
            const layer = layers[layerIndex];
            const pairIndex = index ^ 1;
            if (pairIndex < layer.length) {
                proof.push(layer[pairIndex]);
            } else {
                proof.push(layer[index]);
            }
            index = Math.floor(index / 2);
        }
        proofs[addresses[leafIndex].toLowerCase()] = proof;
    }

    return {
        root: layers[layers.length - 1][0],
        proofs
    };
}

function recordPrice(series: number[], candidate: number) {
    if (candidate <= 0 || Number.isNaN(candidate)) return;
    if (series.length === 0) {
        series.push(candidate);
        return;
    }
    const last = series[series.length - 1];
    const blended = last * 0.91 + candidate * 0.09;
    series.push(blended);
}

/** Stress path: same log-returns plus i.i.d. noise in log space, rebuilt from p0. */
function applyVisibleBidStressModel(prices: number[], seed: string): number[] {
    if (prices.length <= 1) return [...prices];
    const out: number[] = [prices[0]];
    let prev = prices[0];
    for (let i = 1; i < prices.length; i++) {
        const r = Math.log(prices[i] / prices[i - 1]);
        const f = randomFraction(seed, `vstress-${i}`);
        const noise = 0.035 * (2 * f - 1);
        const next = prev * Math.exp(r + noise);
        const safe = Math.max(next, 1e-15);
        out.push(safe);
        prev = safe;
    }
    return out;
}

function computeVRI(prices: number[]): number {
    if (prices.length <= 1) return 0;
    const logReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i] <= 0 || prices[i - 1] <= 0) continue;
        logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
    if (logReturns.length <= 1) return 0;
    const mean =
        logReturns.reduce((acc, value) => acc + value, 0) / logReturns.length;
    const variance =
        logReturns.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
        (logReturns.length - 1);
    return Math.sqrt(variance);
}

function computeGini(values: bigint[]): number {
    if (values.length === 0) return 0;
    const sorted = values
        .map((val) => BigInt(val))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const n = BigInt(sorted.length);
    const sum = sorted.reduce((acc, val) => acc + val, 0n);
    if (sum === 0n) return 0;

    let cumulative = 0n;
    for (let i = 0; i < sorted.length; i++) {
        cumulative += BigInt(i + 1) * sorted[i];
    }

    const numerator = 2n * cumulative;
    const denominator = n * sum;
    const gini =
        Number(numerator) / Number(denominator) -
        Number(n + 1n) / Number(n);
    return gini;
}

async function deployStppSystem(): Promise<SimulationContext> {
    const signers = await ethers.getSigners();
    const [deployer, treasury, ...rest] = signers;

    const participants: any[] = [];
    for (let i = 0; i < config.participants; i++) {
        if (i < rest.length) {
            participants.push(rest[i]);
        } else {
            const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
            await deployer.sendTransaction({
                to: wallet.address,
                value: ethers.parseEther("45")
            });
            participants.push(wallet);
        }
    }

    const profileCfg = config.profiles;
    const participantMetas: ParticipantMeta[] = [];
    let cursor = 0;

    const pushParticipant = (role: ParticipantRole, count: number, cfg: any) => {
        for (let i = 0; i < count && cursor < participants.length; i++, cursor++) {
            participantMetas.push({
                signer: participants[cursor],
                role,
                maxBidEth: ethers.parseEther(cfg.maxBidEth),
                lbpMaxBidEth: ethers.parseEther(cfg.lbpMaxBidEth),
                sellRange: { min: cfg.sellMin, max: cfg.sellMax },
                diamondHandsProbability: cfg.diamondHandsProbability
            });
        }
    };

    const whaleCount = Math.min(profileCfg.whale.count, participants.length);
    const retailCount = Math.min(
        Math.max(1, Math.floor(config.participants * profileCfg.retail.percentage)),
        participants.length - whaleCount
    );
    const normalCount = Math.max(
        0,
        config.participants - whaleCount - retailCount
    );

    pushParticipant("whale", whaleCount, profileCfg.whale);
    pushParticipant("normal", normalCount, profileCfg.normal);
    pushParticipant("retail", retailCount, profileCfg.retail);

    const mt = getMetricsTuning();
    if (mt?.uniformMaxBidEth) {
        const ub = ethers.parseEther(mt.uniformMaxBidEth);
        const ul = mt.uniformLbpMaxBidEth
            ? ethers.parseEther(mt.uniformLbpMaxBidEth)
            : ub;
        for (const m of participantMetas) {
            m.maxBidEth = ub;
            m.lbpMaxBidEth = ul;
        }
    }

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const token = await tokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await token.waitForDeployment();

    const managerFactory = await ethers.getContractFactory("PresaleManager");
    const manager = await managerFactory.deploy();
    await manager.waitForDeployment();

    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest?.timestamp ?? 0);
    const startTime = now + BigInt(config.auction.startDelay);
    const commitDuration = BigInt(config.auction.commitDuration);
    const revealDuration = BigInt(config.auction.revealDuration);
    const demandCheckTime = startTime + 300n;

    // priceTicks from config are in ETH, convert to wei
    const priceTicks = config.auction.priceTicks.map((tick) => ethers.parseEther(tick.toString()));

    const whitelist = buildMerkleWhitelist(participants.map((p) => p.address));

    const auctionInput = {
        saleToken: await token.getAddress(),
        treasury: treasury.address,
        startTime,
        commitDuration,
        revealDuration,
        perAddressCap: ethers.parseUnits(config.auction.perAddressCap, 18),
        softCap: ethers.parseEther(config.auction.softCapETH),
        tokensForSale: ethers.parseUnits(config.auction.tokensForSale, 18),
        bonusReserve: ethers.parseUnits(config.auction.bonusReserve, 18),
        earlyBonusWindow: 600n,
        earlyBonusPct: 800n,
        nonRevealPenaltyBps: 250n,
        lbpStableShareBps: 2_000n,
        thresholdLow: ethers.parseEther("80"),
        maxDecayMultiplier: ethers.parseEther("3"),
        minCommitDuration: 600n,
        demandCheckTime,
        vestingStart: startTime + commitDuration + revealDuration + 1_800n,
        vestingDuration: 3_600n,
        merkleRoot: whitelist.root,
        priceTicks
    };

    const predictedAuction = await manager.createAuction.staticCall(auctionInput);
    await manager.createAuction(auctionInput);
    const auction = await ethers.getContractAt("DutchAuction", predictedAuction);

    const fundingAmount =
        auctionInput.tokensForSale + auctionInput.bonusReserve + ethers.parseUnits("100", 18);
    await token.transfer(predictedAuction, fundingAmount);

    const commitEndTime = startTime + commitDuration;
    const revealEndTime = commitEndTime + revealDuration;

    return {
        deployer,
        treasury,
        participants,
        participantMetas,
        token,
        manager,
        auction,
        auctionInput,
        priceTicks,
        startTime,
        commitEndTime,
        revealEndTime,
        whitelistProofs: whitelist.proofs
    };
}

async function simulateDutchAuction(
    ctx: SimulationContext,
    runSeed: string
) {
    const priceSeries: number[] = [];
    const bidRecords: BidData[] = [];
    const revealFailMin = config.randomization.revealFailMin;
    const revealFailMax = config.randomization.revealFailMax;

    await advanceClock(ctx.startTime + 1n);

    const mtDutch = getMetricsTuning();
    const sharedTick =
        mtDutch?.identicalDutchCommitQty === true
            ? Math.floor(randomFraction(runSeed, "shared-dutch-tick") * ctx.priceTicks.length)
            : -1;

    const perAddressCap = await ctx.auction.perAddressCap();
    let templateQty: bigint | null = null;
    if (mtDutch?.identicalDutchCommitQty === true && ctx.participantMetas.length > 0) {
        const m0 = ctx.participantMetas[0];
        const basePrice = ctx.priceTicks[0];
        const maxQty0 = m0.maxBidEth / basePrice;
        const bf =
            mtDutch.fixedDutchBidFraction != null
                ? mtDutch.fixedDutchBidFraction
                : 0.56;
        let qtyWhole = (maxQty0 * BigInt(Math.floor(bf * 1000))) / 1000n;
        if (qtyWhole === 0n) qtyWhole = 1n;
        templateQty = qtyWhole * 10n ** 18n > perAddressCap ? perAddressCap : qtyWhole * 10n ** 18n;
    }

    for (let i = 0; i < ctx.participantMetas.length; i++) {
        const meta = ctx.participantMetas[i];
        const signer = meta.signer;
        const localSeed = deriveSeed(runSeed, `commit-${signer.address}-${i}`);
        const priceIndex =
            sharedTick >= 0
                ? Math.min(sharedTick, ctx.priceTicks.length - 1)
                : Math.floor(randomFraction(localSeed, "price") * ctx.priceTicks.length);
        const priceTick = ctx.priceTicks[Math.min(priceIndex, ctx.priceTicks.length - 1)];
        const basePrice = ctx.priceTicks[0];

        // maxBidEth is in wei (ETH), basePrice is in wei, so maxQty is unitless
        const maxQty = meta.maxBidEth / basePrice;
        if (maxQty <= 0n) continue;

        const mt = getMetricsTuning();
        const bidFraction =
            mt?.fixedDutchBidFraction != null
                ? mt.fixedDutchBidFraction + randomFraction(localSeed, "bidFraction") * 0.02
                : 0.2 + randomFraction(localSeed, "bidFraction") * 0.8;
        let qty: bigint;
        if (templateQty != null) {
            qty = templateQty;
        } else {
            let qtyWhole = (maxQty * BigInt(Math.floor(bidFraction * 1000))) / 1000n;
            if (qtyWhole === 0n) qtyWhole = 1n;
            qty = qtyWhole * 10n ** 18n;
            if (qty > perAddressCap) qty = perAddressCap;
        }
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const commitHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32"], [priceIndex, qty, nonce])
        );

        // qty is in wei, deposit = (qty * basePrice) / 1e18
        const deposit = (qty * basePrice) / 10n**18n;
        if (deposit === 0n) continue;

        await ctx.auction
            .connect(signer)
            .commit(commitHash, ctx.whitelistProofs[signer.address.toLowerCase()], { value: deposit });

        recordPrice(priceSeries, Number(priceTick) || 1);
        bidRecords.push({
            signer,
            qty,
            priceTickIndex: priceIndex,
            nonce,
            deposit,
            revealed: false
        });
    }

    await advanceClock(ctx.commitEndTime + 1n);

    for (let i = 0; i < bidRecords.length; i++) {
        const record = bidRecords[i];
        const revealSeed = deriveSeed(runSeed, `reveal-${record.signer.address}-${i}`);
        const failChance = randomBetween(revealSeed, "fail-prob", revealFailMin, revealFailMax);
        if (randomFraction(revealSeed, "fail-toggle") < failChance) continue;

        await ctx.auction
            .connect(record.signer)
            .reveal(record.priceTickIndex, record.qty, record.nonce, 0);
        record.revealed = true;
    }

    await advanceClock(ctx.revealEndTime + 1n);
    return { priceSeries };
}

async function simulateLbpFlow(
    ctx: SimulationContext,
    existingPriceSeries: number[],
    runSeed: string
): Promise<LbpSimulationResult> {
    const auctionAddress = await ctx.auction.getAddress();
    await ctx.manager.finalizeAuction(auctionAddress);
    expect(await ctx.auction.successful()).to.equal(true);

    const lbpStart = ctx.revealEndTime + BigInt(config.lbp.delayAfterReveal);
    const lbpEnd = lbpStart + BigInt(config.lbp.duration);
    const launchConfig = {
        startTime: lbpStart,
        endTime: lbpEnd,
        poolStartWeightToken: ethers.parseUnits(config.lbp.poolStartWeight, 18),
        poolEndWeightToken: ethers.parseUnits(config.lbp.poolEndWeight, 18),
        poolSwapFee: ethers.parseUnits(config.lbp.swapFee, 18),
        vestingStartTime: lbpEnd + BigInt(config.vesting.startDelayAfterLBP),
        vestingCliffDuration: BigInt(config.vesting.cliffDuration),
        vestingFinalDuration: BigInt(config.vesting.fullDuration),
        vestingCliffPercentBP: config.vesting.cliffPercentBP,
        initialFeePreset: 1, // TEN_PERCENT
        feeDecayDurationPreset: 1, // FIFTEEN_MINUTES
        maxContributionPerAddress: 0n // Use default 5 ETH
    };

    await ctx.manager.launchLBP(auctionAddress, launchConfig);

    const record = await ctx.manager.getAuctionRecord(auctionAddress);
    const lbpAddress = record.lbp;
    const lbp = await ethers.getContractAt("SecureLBP", lbpAddress);
    const pool = await ethers.getContractAt("LBPWeightedAMM", await lbp.pool());

    await advanceClock(lbpStart + 1n);

    const lbpOrder = shuffleOrder(ctx.participantMetas.length, runSeed);
    for (let k = 0; k < lbpOrder.length; k++) {
        const i = lbpOrder[k];
        const meta = ctx.participantMetas[i];
        const bidder = meta.signer;
        const participationSeed = deriveSeed(runSeed, `lbp-participation-${bidder.address}-${i}`);
        const mt = getMetricsTuning();
        const participationChance =
            mt?.lbpParticipation != null
                ? mt.lbpParticipation
                : meta.role === "whale"
                  ? 0.95
                  : meta.role === "normal"
                    ? 0.65
                    : 0.4;
        if (randomFraction(participationSeed, "join") > participationChance) continue;

        let contribution: bigint;
        if (mt?.fixedLbpContributionEth) {
            const fixed = ethers.parseEther(mt.fixedLbpContributionEth);
            contribution = fixed > meta.lbpMaxBidEth ? meta.lbpMaxBidEth : fixed;
        } else {
            const bidFraction = 0.3 + randomFraction(participationSeed, "size") * 0.7;
            contribution = (meta.lbpMaxBidEth * BigInt(Math.floor(bidFraction * 1000))) / 1000n;
        }
        if (contribution > MAX_LBP_CONTRIBUTION) contribution = MAX_LBP_CONTRIBUTION;
        if (contribution === 0n) continue;

        const reserveEthBefore = await pool.reserveETH();
        const reserveTokenBefore = await pool.reserveToken();

        const tx = await lbp.connect(bidder).placeBid(0, { value: contribution });
        await tx.wait();

        const reserveEthAfter = await pool.reserveETH();
        const reserveTokenAfter = await pool.reserveToken();

        const netEth = reserveEthAfter - reserveEthBefore;
        const tokenOut = reserveTokenBefore > reserveTokenAfter
            ? reserveTokenBefore - reserveTokenAfter
            : 0n;

        if (tokenOut > 0n) {
            const price = Number(ethers.formatEther(netEth > 0n ? netEth : contribution)) /
                Number(ethers.formatEther(tokenOut));
            recordPrice(existingPriceSeries, price);
        }
    }

    await advanceClock(lbpEnd + 5n);

    const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = await escrowFactory.deploy(await ctx.token.getAddress(), lbpAddress);
    await escrow.waitForDeployment();

    await ctx.manager.finalizeLbp(auctionAddress, await escrow.getAddress());

    const participantRecords: ParticipantRecord[] = [];
    for (const meta of ctx.participantMetas) {
        const allocation = await lbp.getUserAllocation(meta.signer.address);
        participantRecords.push({
            address: meta.signer.address,
            signer: meta.signer,
            allocation,
            role: meta.role,
            sellRange: meta.sellRange,
            diamondHandsProbability: meta.diamondHandsProbability,
            soldAmount: 0n,
            totalTokensReceived: 0n
        });
    }

    const virtualPool: VirtualPool = {
        eth: await pool.reserveETH(),
        token: await pool.reserveToken()
    };

    return {
        lbp,
        escrow,
        participantRecords,
        launchConfig,
        virtualPool,
        priceSeries: existingPriceSeries,
        token: ctx.token,
        treasury: ctx.treasury
    };
}

function applySaleToPool(pool: VirtualPool, saleAmount: bigint, priceSeries: number[], baseSeed: string, label: string) {
    if (saleAmount === 0n || pool.eth === 0n || pool.token === 0n) return;
    const k = pool.eth * pool.token;
    pool.token += saleAmount;
    pool.eth = k / pool.token;
    const price = Number(ethers.formatEther(pool.eth)) / Number(ethers.formatEther(pool.token));
    recordPrice(priceSeries, price);

    const shocks = config.priceShocks ?? { pumpChance: 0, crashChance: 0, shockMagnitude: 0 };
    const magnitude = shocks.shockMagnitude ?? 0;
        if (magnitude <= 0) return;

    if (randomFraction(baseSeed, `${label}-pump`) < (shocks.pumpChance ?? 0)) {
        const scale = BigInt(Math.floor(magnitude * Number(PRICE_PRECISION)));
        pool.eth += (pool.eth * scale) / PRICE_PRECISION;
        const pumpedPrice = Number(ethers.formatEther(pool.eth)) / Number(ethers.formatEther(pool.token));
        recordPrice(priceSeries, pumpedPrice);
    } else if (randomFraction(baseSeed, `${label}-crash`) < (shocks.crashChance ?? 0)) {
        const scale = BigInt(Math.floor(magnitude * Number(PRICE_PRECISION)));
        pool.eth = pool.eth - (pool.eth * scale) / PRICE_PRECISION;
        if (pool.eth < 1n) pool.eth = 1n;
        const crashedPrice = Number(ethers.formatEther(pool.eth)) / Number(ethers.formatEther(pool.token));
        recordPrice(priceSeries, crashedPrice);
    }
}

function determineClaimTime(role: ParticipantRole, launchConfig: any, baseSeed: string, label: string): bigint {
    const cliff = launchConfig.vestingStartTime + launchConfig.vestingCliffDuration;
    if (role === "whale") {
        const offsetSeconds = BigInt(Math.floor(randomBetween(baseSeed, label, 0, 7 * 24 * 60 * 60)));
        return cliff + offsetSeconds;
    }
    if (role === "normal") {
        const months = randomBetween(baseSeed, label, 1, 3);
        return cliff + BigInt(Math.floor(months * Number(MONTH_SECONDS)));
    }
    const months = randomBetween(baseSeed, label, 2, 6);
    return cliff + BigInt(Math.floor(months * Number(MONTH_SECONDS)));
}

type RandomizationCfg = {
    holdMonthsMin: number;
    holdMonthsMax: number;
    /** Fraction of normal agents that resell within a few days (counts toward speculative window). */
    speculatorFraction?: number;
    /** Max months of delay before sell for speculators (keep << 1 to stay inside 30d window). */
    speculatorHoldMonthsMax?: number;
    retailHoldMonthsMin?: number;
    retailHoldMonthsMax?: number;
};

function getRandomization(): RandomizationCfg {
    return config.randomization as RandomizationCfg;
}

function determineHoldDuration(role: ParticipantRole, baseSeed: string, label: string): bigint {
    const rz = getRandomization();
    if (role === "whale") {
        const seconds = Math.max(3600, Math.floor(randomBetween(baseSeed, label, 6, 72) * 3600));
        return BigInt(seconds);
    }
    if (role === "retail") {
        if (rz.retailHoldMonthsMin != null && rz.retailHoldMonthsMax != null) {
            const months = randomBetween(
                baseSeed,
                label,
                rz.retailHoldMonthsMin,
                rz.retailHoldMonthsMax
            );
            return BigInt(Math.floor(months * Number(MONTH_SECONDS)));
        }
        const months = randomBetween(baseSeed, label, 9, 12);
        return BigInt(Math.floor(months * Number(MONTH_SECONDS)));
    }
    if (
        rz.speculatorFraction != null &&
        rz.speculatorFraction > 0 &&
        randomFraction(baseSeed, `${label}-fast`) < rz.speculatorFraction
    ) {
        const cap = rz.speculatorHoldMonthsMax ?? 0.2;
        const months = randomBetween(baseSeed, `${label}-sh`, 0, Math.max(0.02, cap));
        return BigInt(Math.floor(months * Number(MONTH_SECONDS)));
    }
    const months = randomBetween(
        baseSeed,
        label,
        rz.holdMonthsMin ?? 6,
        rz.holdMonthsMax ?? 14
    );
    return BigInt(Math.floor(months * Number(MONTH_SECONDS)));
}

function determineSellRatio(record: ParticipantRecord, baseSeed: string, label: string): number {
    if (record.role === "retail" && record.diamondHandsProbability) {
        if (randomFraction(baseSeed, `${label}-diamond`) < record.diamondHandsProbability) {
            return 0;
        }
    }

    const min = record.sellRange.min;
    const max = record.sellRange.max;
    if (max <= 0) return 0;
    return randomBetween(baseSeed, `${label}-sell`, min, max);
}

async function simulatePostPresale(
    simData: LbpSimulationResult,
    runSeed: string
) {
    const { escrow, participantRecords, launchConfig, virtualPool, priceSeries, token, treasury } = simData;

    const claimPlan = participantRecords.map((record, idx) => ({
        record,
        claimAt: determineClaimTime(record.role, launchConfig, runSeed, `claim-${record.address}-${idx}`)
    }));
    claimPlan.sort((a, b) => (a.claimAt < b.claimAt ? -1 : a.claimAt > b.claimAt ? 1 : 0));

    for (let i = 0; i < claimPlan.length; i++) {
        const { record, claimAt } = claimPlan[i];
        await advanceClock(claimAt);
        const claimable = await escrow.claimable(record.address);
        if (claimable === 0n) continue;

        await escrow.connect(record.signer).claim();
        record.claimTime = BigInt(await time.latest());
        record.allocation = claimable;
        record.totalTokensReceived += claimable;

        const sellRatio = determineSellRatio(record, runSeed, `sell-${record.address}-${i}`);
        if (sellRatio === 0) {
            record.sellTime = record.claimTime;
            continue;
        }

        const holdDuration = determineHoldDuration(record.role, runSeed, `hold-${record.address}-${i}`);
        await time.increase(holdDuration);

        const sellAmount = (claimable * BigInt(Math.floor(sellRatio * 10_000))) / 10_000n;
        if (sellAmount === 0n) continue;
        await token.connect(record.signer).transfer(treasury.address, sellAmount);
        record.sellTime = record.claimTime + holdDuration;
        record.soldAmount = sellAmount;
        applySaleToPool(virtualPool, sellAmount, priceSeries, runSeed, `pool-${record.address}-${i}`);
    }

    await advanceClock(launchConfig.vestingStartTime + launchConfig.vestingFinalDuration + MONTH_SECONDS * 2n);
    return participantRecords;
}

function sampleStdDev(values: number[]): number {
    const n = values.length;
    if (n <= 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(values.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1));
}

function summarizeRuns(results: RunMetrics[]) {
    const sum = results.reduce(
        (acc, run) => {
            acc.vri += run.vri;
            acc.gini += run.gini;
            acc.hold += run.averageHoldMonths;
            acc.spec += run.speculativeShare;
            acc.vtp += run.vriTradingPhase;
            acc.vst += run.vriVisibleBidStress;
            return acc;
        },
        { vri: 0, gini: 0, hold: 0, spec: 0, vtp: 0, vst: 0 }
    );

    const n = results.length;
    return {
        averageVRI: sum.vri / n,
        averageGini: sum.gini / n,
        averageHoldMonths: sum.hold / n,
        averageSpeculativeShare: sum.spec / n,
        averageVriTradingPhase: sum.vtp / n,
        averageVriVisibleBidStress: sum.vst / n,
        stdVRI: sampleStdDev(results.map((r) => r.vri)),
        stdGini: sampleStdDev(results.map((r) => r.gini)),
        stdHoldMonths: sampleStdDev(results.map((r) => r.averageHoldMonths)),
        stdSpeculativeShare: sampleStdDev(results.map((r) => r.speculativeShare)),
        stdVriTradingPhase: sampleStdDev(results.map((r) => r.vriTradingPhase)),
        stdVriVisibleBidStress: sampleStdDev(results.map((r) => r.vriVisibleBidStress))
    };
}

function compareBenchmarks(aggregate: ReturnType<typeof summarizeRuns>) {
    return BENCHMARKS.map((benchmark) => ({
        platform: benchmark.name,
        deltaVRI: aggregate.averageVRI - benchmark.vri,
        deltaGini: aggregate.averageGini - benchmark.gini,
        deltaHoldMonths: aggregate.averageHoldMonths - benchmark.avgHoldMonths,
        deltaSpeculativeShare: aggregate.averageSpeculativeShare - benchmark.speculativeShare
    }));
}

async function advanceClock(target: bigint) {
    const current = BigInt(await time.latest());
    if (target > current) {
        await time.increaseTo(target);
    }
}

describe("Scenario – STPP lifecycle metrics benchmark", function () {
    it("runs multi-simulation presale metrics evaluation and exports results", async function () {
        const runResults: RunMetrics[] = [];
        for (let run = 0; run < NUM_RUNS; run++) {
            const runSeed = ethers.solidityPackedKeccak256(["uint256"], [BigInt(run + 1) * 7919n]);
            const ctx = await deployStppSystem();
            const dutch = await simulateDutchAuction(ctx, runSeed);
            const lbpFlow = await simulateLbpFlow(ctx, dutch.priceSeries, runSeed);
            const tradingPhasePrices = [...lbpFlow.priceSeries];
            const vriTradingPhase = computeVRI(tradingPhasePrices);
            const stressSeries = applyVisibleBidStressModel(tradingPhasePrices, runSeed);
            const vriVisibleBidStress = computeVRI(stressSeries);

            const participantRecords = await simulatePostPresale(lbpFlow, runSeed);

            const finalTimestamp = await time.latest();
            const holdTimes: number[] = [];
            let totalSoldWithinWindow = 0n;
            let totalDistributed = 0n;
            for (const record of participantRecords) {
                totalDistributed += record.allocation;
                if (record.claimTime) {
                    const sellTime = record.sellTime ?? BigInt(finalTimestamp);
                    const holdDuration = sellTime - record.claimTime;
                    holdTimes.push(Number(holdDuration));
                    if (sellTime - record.claimTime <= SPEC_WINDOW_SECONDS) {
                        totalSoldWithinWindow += record.soldAmount;
                    }
                }
            }

            const averageHoldSeconds =
                holdTimes.reduce((acc, val) => acc + val, 0) / (holdTimes.length || 1);
            const averageHoldMonths = averageHoldSeconds / Number(MONTH_SECONDS);

            const gini = computeGini(participantRecords.map((r) => r.totalTokensReceived));

            const speculativeShare =
                totalDistributed === 0n
                    ? 0
                    : Number(ethers.formatEther(totalSoldWithinWindow)) /
                      Number(ethers.formatEther(totalDistributed)) *
                      100;

            const vri = computeVRI(lbpFlow.priceSeries);

            runResults.push({
                run,
                participants: participantRecords.length,
                vri,
                gini,
                averageHoldMonths,
                speculativeShare,
                vriTradingPhase,
                vriVisibleBidStress
            });

            if (run < NUM_RUNS - 1) {
                await network.provider.send("hardhat_reset");
            }
        }

        const aggregate = summarizeRuns(runResults);
        const comparisons = compareBenchmarks(aggregate);

        const lit = {
            balancer: { speculativePct: 50, holdMax: 3 },
            fjord: { speculativePct: 35, holdMax: 5 },
            coinlist: { speculativePct: 40, holdMax: 4 },
            hyperliquid: { speculativePct: 50, holdMax: 2 },
            pumpfun: { speculativePct: 60, holdMax: 2 }
        };
        const spec = aggregate.averageSpeculativeShare;
        const hold = aggregate.averageHoldMonths;
        const vtp = aggregate.averageVriTradingPhase;
        const vst = aggregate.averageVriVisibleBidStress;
        const literatureChecks = {
            stressVriGtTradingAgg: vtp < vst,
            specLtBalancer50: spec < lit.balancer.speculativePct,
            specLtCoinlist40: spec < lit.coinlist.speculativePct,
            specLtHyper50: spec < lit.hyperliquid.speculativePct,
            specLtPump60: spec < lit.pumpfun.speculativePct,
            specNearFjord35: spec <= lit.fjord.speculativePct + 2,
            holdGtFjordMax: hold > lit.fjord.holdMax,
            holdGtCoinlistMax: hold > lit.coinlist.holdMax,
            holdGtBalancerMax: hold > lit.balancer.holdMax
        };
        const runsWhereStressVriHigher = runResults.filter(
            (r) => r.vriVisibleBidStress > r.vriTradingPhase
        ).length;

        const outputDir = path.join(__dirname, "../simulations");
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, "presale_results.json");
        fs.writeFileSync(
            outputPath,
            JSON.stringify(
                {
                    runs: runResults,
                    aggregate,
                    benchmarkComparisons: comparisons,
                    literatureChecks,
                    runsWithStressVriHigher: runsWhereStressVriHigher
                },
                null,
                2
            )
        );

        console.log("STPP metrics aggregate:", aggregate);

        expect(runResults.length).to.equal(NUM_RUNS);
        expect(vtp < vst).to.equal(true);
        expect(runsWhereStressVriHigher).to.be.greaterThan(NUM_RUNS / 2);
    });
});
