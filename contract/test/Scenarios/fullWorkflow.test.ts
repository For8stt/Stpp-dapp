import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const BPS = 10_000n;
const abi = ethers.AbiCoder.defaultAbiCoder();

function hashAddress(address: string): string {
    return ethers.solidityPackedKeccak256(["address"], [address]);
}

// Builds a Merkle tree for an address whitelist and returns the root plus per-account proofs.
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

// Spins up the full auction + LBP environment used across the scenario test.
async function deployFullWorkflowFixture() {
    const [owner, treasury, alice, bob, carol, whale] = await ethers.getSigners();

    // --- Deployment Phase ---
    const tokenFactory = await ethers.getContractFactory("TestToken");
    const saleTokenTotalSupply = ethers.parseUnits("1000000", 18);
    const saleToken = await tokenFactory.deploy(saleTokenTotalSupply);
    await saleToken.waitForDeployment();

    // Treat second TestToken as a mock stablecoin (e.g., USDC) for documentation purposes.
    const stableToken = await tokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await stableToken.waitForDeployment();

    const managerFactory = await ethers.getContractFactory("PresaleManager");
    const manager = await managerFactory.deploy();
    await manager.waitForDeployment();

    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest?.timestamp ?? 0n);

    const startTime = now + 120n;
    const commitDuration = 600n;
    const revealDuration = 600n;
    const demandCheckTime = startTime + 180n;
    const priceTicks = [ethers.parseEther("2"), ethers.parseEther("1")];

    const whitelist = buildMerkleWhitelist([alice.address, bob.address, carol.address]);

    const auctionInput = {
        saleToken: await saleToken.getAddress(),
        treasury: treasury.address,
        startTime,
        commitDuration,
        revealDuration,
        perAddressCap: ethers.parseUnits("200", 18),
        softCap: ethers.parseEther("20"),
        tokensForSale: ethers.parseUnits("120", 18),
        bonusReserve: ethers.parseUnits("12", 18),
        earlyBonusWindow: 300n,
        earlyBonusPct: 500n,
        nonRevealPenaltyBps: 250n,
        lbpStableShareBps: 2_000n,
        thresholdLow: ethers.parseEther("200"),
        maxDecayMultiplier: ethers.parseEther("3"),
        minCommitDuration: 180n,
        demandCheckTime,
        vestingStart: startTime,
        vestingDuration: 0n,
        merkleRoot: whitelist.root,
        priceTicks
    };

    // Predict + deploy the Dutch auction via the manager contract.
    const predictedAuction = await manager.createAuction.staticCall(auctionInput);
    await manager.createAuction(auctionInput);
    const auction = await ethers.getContractAt("DutchAuction", predictedAuction);

    // Seed auction contract with sale inventory (sale + bonus buckets).
    const fundingAmount = auctionInput.tokensForSale + auctionInput.bonusReserve;
    await saleToken.transfer(predictedAuction, fundingAmount);

    const commitEndTime = startTime + commitDuration;
    const revealEndTime = commitEndTime + revealDuration;

    return {
        owner,
        treasury,
        alice,
        bob,
        carol,
        whale,
        saleToken,
        stableToken,
        manager,
        auction,
        auctionInput,
        priceTicks,
        startTime,
        commitEndTime,
        revealEndTime,
        demandCheckTime,
        whitelistProofs: whitelist.proofs,
        whitelistRoot: whitelist.root
    };
}

describe("Scenario – STPP full lifecycle", function () {
    it("test_fullWorkflow_success()", async function () {
        const ctx = await loadFixture(deployFullWorkflowFixture);
        const {
            owner,
            treasury,
            alice,
            bob,
            carol,
            whale,
            saleToken,
            manager,
            auction,
            auctionInput,
            priceTicks,
            startTime,
            commitEndTime,
            revealEndTime,
            demandCheckTime,
            whitelistProofs,
            whitelistRoot
        } = ctx;

        const auctionAddress = await auction.getAddress();

        // Sanity-check whitelist configuration.
        const actualRoot = await auction.merkleRoot();
        expect(actualRoot).to.equal(whitelistRoot);
        for (const participant of [alice, bob, carol]) {
            const proof = whitelistProofs[participant.address.toLowerCase()];
            expect(proof, "whitelist proof missing").to.exist;
            let cursor = hashAddress(participant.address);
            for (const sibling of proof) {
                const [lo, hi] = cursor.toLowerCase() < sibling.toLowerCase() ? [cursor, sibling] : [sibling, cursor];
                cursor = ethers.keccak256(ethers.concat([lo, hi]));
            }
            expect(cursor).to.equal(whitelistRoot);
        }

        // --- Commit Phase ---
        await time.increaseTo(startTime + 5n);

        const qtyAlice = ethers.parseUnits("60", 18);
        const qtyBob = ethers.parseUnits("40", 18);
        const qtyCarol = ethers.parseUnits("20", 18);

        const nonceAlice = ethers.hexlify(ethers.randomBytes(32));
        const nonceBob = ethers.hexlify(ethers.randomBytes(32));
        const nonceCarol = ethers.hexlify(ethers.randomBytes(32));

        const commitAlice = ethers.keccak256(abi.encode(["uint256", "uint256", "bytes32"], [0, qtyAlice, nonceAlice]));
        const commitBob = ethers.keccak256(abi.encode(["uint256", "uint256", "bytes32"], [1, qtyBob, nonceBob]));
        const commitCarol = ethers.keccak256(abi.encode(["uint256", "uint256", "bytes32"], [0, qtyCarol, nonceCarol]));

        // qtyAlice, qtyBob, qtyCarol are in wei, deposit = (qty * priceTicks[0]) / 1e18
        const depositAlice = (qtyAlice * priceTicks[0]) / 10n**18n;
        const depositBob = (qtyBob * priceTicks[0]) / 10n**18n;
        const depositCarol = (qtyCarol * priceTicks[0]) / 10n**18n;

        await expect(
            auction.connect(alice).commit(commitAlice, whitelistProofs[alice.address.toLowerCase()], { value: depositAlice })
        )
            .to.emit(auction, "CommitSubmitted")
            .withArgs(alice.address, commitAlice, depositAlice, qtyAlice);

        // Keeper-style demand check to trigger dynamic reserve adjustment.
        await time.increaseTo(demandCheckTime + 1n);
        const upkeepData = abi.encode(["address"], [auctionAddress]);
        await expect(manager.performUpkeep(upkeepData)).to.emit(manager, "AuctionDemandCheckExecuted").withArgs(auctionAddress);

        await expect(
            auction.connect(bob).commit(commitBob, whitelistProofs[bob.address.toLowerCase()], { value: depositBob })
        )
            .to.emit(auction, "CommitSubmitted")
            .withArgs(bob.address, commitBob, depositBob, qtyBob);

        await auction
            .connect(carol)
            .commit(commitCarol, whitelistProofs[carol.address.toLowerCase()], { value: depositCarol });

        // --- Reveal Phase ---
        await time.increaseTo(commitEndTime + 5n);
        await expect(auction.connect(alice).reveal(0, qtyAlice, nonceAlice, 0))
            .to.emit(auction, "BidRevealed")
            .withArgs(alice.address, 0, 0, qtyAlice, anyValue);

        await expect(auction.connect(bob).reveal(1, qtyBob, nonceBob, 0))
            .to.emit(auction, "BidRevealed")
            .withArgs(bob.address, 0, 1, qtyBob, anyValue);

        // Carol never reveals and will later withdraw with penalty.

        await time.increaseTo(revealEndTime + 10n);

        // Finalize the Dutch auction once reveal window elapses.
        const finalizeTx = await manager.finalizeAuction(auctionAddress);
        const tokensSold = qtyAlice + qtyBob; // both in wei
        const lastPrice = priceTicks[priceTicks.length - 1];
        // totalRaised = (tokensSold * clearingPrice) / 1e18
        const expectedTotalRaised = (tokensSold * lastPrice) / 10n**18n;
        await expect(finalizeTx)
            .to.emit(auction, "AuctionFinalized")
            .withArgs(true, lastPrice, tokensSold, expectedTotalRaised);

        expect(await auction.successful()).to.equal(true);
        expect(await auction.tokensSold()).to.equal(tokensSold);

        // Carol withdraws unrevealed commit minus penalty.
        // Unrevealed bidder recovers deposit minus configured penalty.
        const penalty = (depositCarol * auctionInput.nonRevealPenaltyBps) / BPS;
        await expect(auction.connect(carol).withdrawUnrevealed(0))
            .to.emit(auction, "RefundIssued")
            .withArgs(carol.address, depositCarol - penalty);

        // Winning bidder claims auction allocation immediately (no additional vesting configured here).
        // Note: With Merkle-based bonuses, bonus would need Merkle root set first
        // For now, test without bonus (bonusQty = 0)
        await expect(auction.connect(alice).claim(0, []))
            .to.emit(saleToken, "Transfer")
            .withArgs(await auction.getAddress(), alice.address, qtyAlice);

        // --- Transition to LBP ---
        const lbpStart = revealEndTime + 600n;
        const lbpEnd = lbpStart + 1_200n;
        const launchConfig = {
            startTime: lbpStart,
            endTime: lbpEnd,
            poolStartWeightToken: ethers.parseUnits("0.7", 18),
            poolEndWeightToken: ethers.parseUnits("0.3", 18),
            poolSwapFee: ethers.parseUnits("0.003", 18),
            vestingStartTime: lbpEnd + 60n,
            vestingCliffDuration: 120n,
            vestingFinalDuration: 480n,
            vestingCliffPercentBP: 2_500n, // 25% unlock at cliff.
            initialFeePreset: 1, // TEN_PERCENT
            feeDecayDurationPreset: 1, // FIFTEEN_MINUTES
            maxContributionPerAddress: 0n // Use default 5 ETH
        };

        // Transition residual inventory + ETH into the Secure LBP.
        const launchTx = await manager.launchLBP(auctionAddress, launchConfig);
        await expect(launchTx)
            .to.emit(manager, "LBPInitialized")
            .withArgs(auctionAddress, anyValue, anyValue, auctionInput.tokensForSale - (qtyAlice + qtyBob), anyValue);

        const recordAfterLaunch = await manager.getAuctionRecord(auctionAddress);
        const lbpAddress = recordAfterLaunch.lbp;
        expect(lbpAddress).to.not.equal(ethers.ZeroAddress);

        const lbp = await ethers.getContractAt("SecureLBP", lbpAddress);
        expect(await lbp.poolInitialized()).to.equal(true);

        // --- LBP Trading Phase ---
        await time.increaseTo(lbpStart + 1n);

        // Simulate public bids flowing into the pool across multiple participants.
        await expect(lbp.connect(alice).placeBid(0, { value: ethers.parseEther("5") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(alice.address, ethers.parseEther("5"), anyValue, anyValue, anyValue);

        await expect(lbp.connect(bob).placeBid(0, { value: ethers.parseEther("3") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(bob.address, ethers.parseEther("3"), anyValue, anyValue, anyValue);

        await expect(lbp.connect(whale).placeBid(0, { value: ethers.parseEther("1") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(whale.address, ethers.parseEther("1"), anyValue, anyValue, anyValue);

        expect(await lbp.totalEthRaised()).to.equal(ethers.parseEther("9"));
        expect(await lbp.totalTokensAllocated()).to.be.gt(0n);
        expect(await lbp.allocations(alice.address)).to.be.gt(0n);

        // --- Finalize LBP → Vesting ---
        await time.increaseTo(lbpEnd + 5n);
        const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await escrowFactory.deploy(await saleToken.getAddress(), lbpAddress);
        await escrow.waitForDeployment();

        // Finalize LBP, handing off allocations to the vesting escrow contract.
        const finalizeLbpTx = await manager.finalizeLbp(auctionAddress, await escrow.getAddress());
        const totalAllocated = await lbp.totalTokensAllocated();
        await expect(finalizeLbpTx)
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), totalAllocated);
        expect(await saleToken.balanceOf(await escrow.getAddress())).to.equal(totalAllocated);

        // Ensure manager stored finalization state.
        // Persisted metadata now reflects LBP finalization and escrow wiring.
        const finalizedRecord = await manager.getAuctionRecord(auctionAddress);
        expect(finalizedRecord.lbpFinalized).to.equal(true);
        expect(finalizedRecord.vestingEscrow).to.equal(await escrow.getAddress());

        // Claim attempts before vesting start should return zero.
        expect(await escrow.claimable(alice.address)).to.equal(0n);

        // Fast-forward to cliff: initial 25% claimable.
        const cliffTime = launchConfig.vestingStartTime + launchConfig.vestingCliffDuration;
        await time.increaseTo(cliffTime + 1n);

        const aliceClaimableAtCliff = await escrow.claimable(alice.address);
        expect(aliceClaimableAtCliff).to.be.gt(0n);

        await expect(escrow.connect(alice).claim())
            .to.emit(escrow, "Claimed")
            .withArgs(alice.address, aliceClaimableAtCliff, aliceClaimableAtCliff);

        // Owner can execute delegated claimFor to distribute vested tokens.
        const bobClaimableAtCliff = await escrow.claimable(bob.address);
        await expect(escrow.connect(owner).claimFor(bob.address))
            .to.emit(escrow, "Claimed")
            .withArgs(bob.address, bobClaimableAtCliff, bobClaimableAtCliff);

        // Advance to full vesting and finish claims.
        // Jump to full-vesting horizon and complete outstanding claims.
        await time.increaseTo(launchConfig.vestingStartTime + launchConfig.vestingFinalDuration + 5n);

        const aliceRemainder = await escrow.claimable(alice.address);
        expect(aliceRemainder).to.be.gt(0n);
        await escrow.connect(alice).claim();

        const bobRemainder = await escrow.claimable(bob.address);
        if (bobRemainder > 0n) {
            await escrow.connect(owner).claimFor(bob.address);
        }

        expect(await escrow.claimable(alice.address)).to.equal(0n);
        await expect(escrow.connect(alice).claim()).to.be.revertedWithCustomError(escrow, "NothingClaimable");

        // Whale did not request delegated claim, can self-claim once fully vested.
        const whaleRemaining = await escrow.claimable(whale.address);
        if (whaleRemaining > 0n) {
            await escrow.connect(whale).claim();
        }

        expect(await saleToken.balanceOf(await escrow.getAddress())).to.equal(0n);
    });
});
