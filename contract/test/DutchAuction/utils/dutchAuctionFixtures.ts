import { ethers } from "hardhat";

export const abiCoder = ethers.AbiCoder.defaultAbiCoder();
export const BPS_DENOMINATOR = 10_000n;

export interface AuctionTestConfig {
    startTime: bigint;
    commitDuration: bigint;
    revealDuration: bigint;
    perAddressCap: bigint;
    softCap: bigint;
    tokensForSale: bigint;
    bonusReserve: bigint;
    earlyBonusWindow: bigint;
    earlyBonusPct: bigint;
    nonRevealPenaltyBps: bigint;
    lbpStableShareBps: bigint;
    thresholdLow: bigint;
    maxDecayMultiplier: bigint;
    minCommitDuration: bigint;
    vestingStart: bigint;
    vestingDuration: bigint;
    treasury: string;
    lbpTokenRecipient: string;
    lbpStableRecipient: string;
    merkleRoot: string;
    priceTicks: bigint[];
}

export type FixtureContext = Awaited<ReturnType<typeof deployAuctionFixture>>;

export function buildCommitHash(priceTickIndex: bigint, qty: bigint, nonce: string): string {
    return ethers.keccak256(abiCoder.encode(["uint256", "uint256", "bytes32"], [priceTickIndex, qty, nonce]));
}

export function randomNonce(): string {
    return ethers.hexlify(ethers.randomBytes(32));
}

export async function commitBid(
    ctx: FixtureContext,
    params: { signer: any; priceTickIndex: bigint; qty: bigint; merkleProof?: string[] }
) {
    const { auction, priceTicks } = ctx;
    const nonce = randomNonce();
    const commitHash = buildCommitHash(params.priceTickIndex, params.qty, nonce);
    const deposit = params.qty * priceTicks[0];
    await auction.connect(params.signer).commit(commitHash, params.merkleProof ?? [], { value: deposit });
    return { nonce, commitHash, deposit };
}

export function fixtureWithOverrides(overrides: Partial<AuctionTestConfig>) {
    return async function fixture() {
        return deployAuctionFixture(overrides);
    };
}

export async function deployAuctionFixture(overrides: Partial<AuctionTestConfig> = {}) {
    const [deployer, treasurySigner, alice, bob, carol, dave, outsider] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const token = await tokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await token.waitForDeployment();

    const auctionFactory = await ethers.getContractFactory("DutchAuction");
    const auction = await auctionFactory.deploy(await token.getAddress(), await deployer.getAddress());
    await auction.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const now = BigInt(latestBlock?.timestamp ?? 0);
    const defaultStart = now + 120n;

    const defaultPriceTicks = [
        ethers.parseUnits("0.003", 18),
        ethers.parseUnits("0.002", 18),
        ethers.parseUnits("0.001", 18)
    ];

    const finalConfig: AuctionTestConfig = {
        startTime: overrides.startTime ?? defaultStart,
        commitDuration: overrides.commitDuration ?? 900n,
        revealDuration: overrides.revealDuration ?? 900n,
        perAddressCap: overrides.perAddressCap ?? 200n,
        softCap: overrides.softCap ?? ethers.parseEther("0.2"),
        tokensForSale: overrides.tokensForSale ?? 150n,
        bonusReserve: overrides.bonusReserve ?? 30n,
        earlyBonusWindow: overrides.earlyBonusWindow ?? 300n,
        earlyBonusPct: overrides.earlyBonusPct ?? 500n,
        nonRevealPenaltyBps: overrides.nonRevealPenaltyBps ?? 100n,
        lbpStableShareBps: overrides.lbpStableShareBps ?? 0n,
        thresholdLow: overrides.thresholdLow ?? ethers.parseEther("0.1"),
        maxDecayMultiplier: overrides.maxDecayMultiplier ?? ethers.parseEther("2"),
        minCommitDuration: overrides.minCommitDuration ?? 300n,
        vestingStart: overrides.vestingStart ?? defaultStart,
        vestingDuration: overrides.vestingDuration ?? 0n,
        treasury: overrides.treasury ?? treasurySigner.address,
        lbpTokenRecipient: overrides.lbpTokenRecipient ?? ethers.ZeroAddress,
        lbpStableRecipient: overrides.lbpStableRecipient ?? ethers.ZeroAddress,
        merkleRoot: overrides.merkleRoot ?? ethers.ZeroHash,
        priceTicks: overrides.priceTicks ?? defaultPriceTicks
    };

    await auction.initializeAuction({
        startTime: finalConfig.startTime,
        commitDuration: finalConfig.commitDuration,
        revealDuration: finalConfig.revealDuration,
        perAddressCap: finalConfig.perAddressCap,
        softCap: finalConfig.softCap,
        tokensForSale: finalConfig.tokensForSale,
        bonusReserve: finalConfig.bonusReserve,
        earlyBonusWindow: finalConfig.earlyBonusWindow,
        earlyBonusPct: finalConfig.earlyBonusPct,
        nonRevealPenaltyBps: finalConfig.nonRevealPenaltyBps,
        lbpStableShareBps: finalConfig.lbpStableShareBps,
        thresholdLow: finalConfig.thresholdLow,
        maxDecayMultiplier: finalConfig.maxDecayMultiplier,
        minCommitDuration: finalConfig.minCommitDuration,
        vestingStart: finalConfig.vestingStart,
        vestingDuration: finalConfig.vestingDuration,
        treasury: finalConfig.treasury,
        lbpTokenRecipient: finalConfig.lbpTokenRecipient,
        lbpStableRecipient: finalConfig.lbpStableRecipient,
        merkleRoot: finalConfig.merkleRoot,
        priceTicks: finalConfig.priceTicks
    });

    const fundingAmount = finalConfig.tokensForSale + finalConfig.bonusReserve + 10n;
    await token.transfer(await auction.getAddress(), fundingAmount);

    const commitEndTime = finalConfig.startTime + finalConfig.commitDuration;
    const revealEndTime = commitEndTime + finalConfig.revealDuration;

    return {
        auction,
        token,
        deployer,
        treasury: treasurySigner,
        alice,
        bob,
        carol,
        dave,
        outsider,
        config: finalConfig,
        priceTicks: finalConfig.priceTicks,
        startTime: finalConfig.startTime,
        commitEndTime,
        revealEndTime
    };
}

export async function softCapFixture() {
    return deployAuctionFixture({ softCap: ethers.parseEther("1") });
}
