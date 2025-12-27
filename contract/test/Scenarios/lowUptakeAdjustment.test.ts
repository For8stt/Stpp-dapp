import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const abi = ethers.AbiCoder.defaultAbiCoder();

function hashAddress(address: string): string {
    return ethers.solidityPackedKeccak256(["address"], [address]);
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

async function deployLowUptakeFixture() {
    const [owner, treasury, alice, bob, carol, dave, erin] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TestToken");
    const saleToken = await tokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await saleToken.waitForDeployment();

    const managerFactory = await ethers.getContractFactory("PresaleManager");
    const manager = await managerFactory.deploy();
    await manager.waitForDeployment();

    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest?.timestamp ?? 0);
    const startTime = now + 120n;
    const commitDuration = 600n;
    const revealDuration = 600n;
    const demandCheckTime = startTime + 240n;

    const priceTicks = [ethers.parseEther("4"), ethers.parseEther("3"), ethers.parseEther("2")];
    const whitelist = buildMerkleWhitelist([alice, bob, carol, dave, erin].map((s) => s.address));

    const auctionInput = {
        saleToken: await saleToken.getAddress(),
        treasury: treasury.address,
        startTime,
        commitDuration,
        revealDuration,
        perAddressCap: ethers.parseUnits("200", 18),
        softCap: ethers.parseEther("50"),
        tokensForSale: ethers.parseUnits("500", 18),
        bonusReserve: ethers.parseUnits("50", 18),
        earlyBonusWindow: 300n,
        earlyBonusPct: 500n,
        nonRevealPenaltyBps: 250n,
        lbpStableShareBps: 2_000n,
        thresholdLow: ethers.parseEther("80"),
        maxDecayMultiplier: ethers.parseEther("3"),
        minCommitDuration: 300n,
        demandCheckTime,
        vestingStart: startTime,
        vestingDuration: 0n,
        merkleRoot: whitelist.root,
        priceTicks
    };

    const predictedAuction = await manager.createAuction.staticCall(auctionInput);
    await manager.createAuction(auctionInput);
    const auction = await ethers.getContractAt("DutchAuction", predictedAuction);

    const fundingAmount = auctionInput.tokensForSale + auctionInput.bonusReserve + ethers.parseUnits("50", 18);
    await saleToken.transfer(predictedAuction, fundingAmount);

    const commitEndTime = startTime + commitDuration;
    const revealEndTime = commitEndTime + revealDuration;

    return {
        owner,
        treasury,
        alice,
        bob,
        carol,
        dave,
        erin,
        saleToken,
        manager,
        auction,
        priceTicks,
        startTime,
        commitEndTime,
        revealEndTime,
        demandCheckTime,
        whitelistProofs: whitelist.proofs
    };
}

describe("Scenario – Low Uptake Adjustment", function () {
    it("handles reserve adjustment and completes the lifecycle", async function () {
        const ctx = await loadFixture(deployLowUptakeFixture);
        const {
            owner,
            treasury,
            alice,
            bob,
            carol,
            dave,
            erin,
            saleToken,
            manager,
            auction,
            priceTicks,
            startTime,
            commitEndTime,
            demandCheckTime,
            whitelistProofs
        } = ctx;

        const participants = [alice, bob, carol, dave, erin];
        const auctionAddress = await auction.getAddress();
        const basePrice = priceTicks[0];

        // --- Phase 1: Low uptake commits ---
        await time.increaseTo(startTime + 5n);

        type CommitInfo = { signer: any; priceIndex: number; qty: bigint; nonce: string; commitIndex: number };
        const commitInfos: CommitInfo[] = [];
        const commitCounts = new Map<string, number>();

        const earlyBids = [
            { signer: alice, qty: ethers.parseUnits("4", 18), priceIndex: 0 },
            { signer: bob, qty: ethers.parseUnits("6", 18), priceIndex: 1 },
            { signer: carol, qty: ethers.parseUnits("2", 18), priceIndex: 0 }
        ];

        const commitBid = async (entry: { signer: any; qty: bigint; priceIndex: number }) => {
            const nonce = ethers.hexlify(ethers.randomBytes(32));
            const commitHash = ethers.keccak256(abi.encode(["uint256", "uint256", "bytes32"], [entry.priceIndex, entry.qty, nonce]));
            const commitIndex = commitCounts.get(entry.signer.address) ?? 0;
            commitCounts.set(entry.signer.address, commitIndex + 1);
            // entry.qty is in wei, deposit = (qty * basePrice) / 1e18
            const deposit = (entry.qty * basePrice) / 10n**18n;
            await auction
                .connect(entry.signer)
                .commit(commitHash, whitelistProofs[entry.signer.address.toLowerCase()], { value: deposit });
            commitInfos.push({ signer: entry.signer, priceIndex: entry.priceIndex, qty: entry.qty, nonce, commitIndex });
        };

        for (const entry of earlyBids) {
            await commitBid(entry);
        }

        // Calculate expected total deposit: sum of (qty * basePrice) / 1e18 for each bid
        const expectedDeposit = earlyBids.reduce((sum, entry) => {
            const deposit = (entry.qty * basePrice) / 10n**18n;
            return sum + deposit;
        }, 0n);

        const initialCommitted = await auction.totalDepositCommitted();
        expect(initialCommitted).to.equal(expectedDeposit);
        expect(initialCommitted).to.be.lt(await auction.softCap());

        // --- Phase 2: Owner triggers reserve adjustment ---
        await time.increaseTo(demandCheckTime + 1n);
        const decayBefore = await auction.decayMultiplier();
        const commitEndBefore = await auction.commitEndTime();
        const upkeepData = abi.encode(["address"], [auctionAddress]);
        await expect(manager.performUpkeep(upkeepData))
            .to.emit(manager, "AuctionDemandCheckExecuted")
            .withArgs(auctionAddress);
        const decayAfter = await auction.decayMultiplier();
        const commitEndAfter = await auction.commitEndTime();
        const revealEndAfter = await auction.revealEndTime();
        expect(decayAfter).to.be.gt(decayBefore);
        expect(commitEndAfter).to.be.lt(commitEndBefore);

        // --- Phase 3: Additional demand after adjustment ---
        const lateBids = [
            { signer: dave, qty: ethers.parseUnits("9", 18), priceIndex: 0 },
            { signer: erin, qty: ethers.parseUnits("6.5", 18), priceIndex: 2 }
        ];

        for (const entry of lateBids) {
            await commitBid(entry);
        }

        // Calculate expected total deposit: sum of all bids
        const allBids = [...earlyBids, ...lateBids];
        const expectedTotalDeposit = allBids.reduce((sum, entry) => {
            const deposit = (entry.qty * basePrice) / 10n**18n;
            return sum + deposit;
        }, 0n);

        const committedAfterAdjustment = await auction.totalDepositCommitted();
        expect(committedAfterAdjustment).to.equal(expectedTotalDeposit);
        expect(committedAfterAdjustment).to.be.gte(await auction.softCap());

        // --- Phase 4: Reveal bids for all participants ---
        await time.increaseTo(commitEndAfter + 1n);
        for (const info of commitInfos) {
            await auction
                .connect(info.signer)
                .reveal(info.priceIndex, info.qty, info.nonce, info.commitIndex);
        }

        await time.increaseTo(revealEndAfter + 1n);

        // --- Phase 5: Finalize Dutch auction and launch LBP ---
        const finalizeTx = await manager.connect(owner).finalizeAuction(auctionAddress);
        await expect(finalizeTx)
            .to.emit(manager, "AuctionFinalized")
            .withArgs(auctionAddress, anyValue, anyValue, anyValue, anyValue);
        const totalRaised = await auction.totalRaised();
        expect(totalRaised).to.be.gte(await auction.softCap());
        expect(await auction.successful(), "auction should succeed after additional demand").to.equal(true);

        const lbpStart = revealEndAfter + 600n;
        const lbpEnd = lbpStart + 1_200n;
        const launchConfig = {
            startTime: lbpStart,
            endTime: lbpEnd,
            poolStartWeightToken: ethers.parseUnits("0.7", 18),
            poolEndWeightToken: ethers.parseUnits("0.3", 18),
            poolSwapFee: ethers.parseUnits("0.003", 18),
            vestingStartTime: lbpEnd + 600n,
            vestingCliffDuration: 0n,
            vestingFinalDuration: 0n,
            vestingCliffPercentBP: 0n,
            initialFeePreset: 1, // TEN_PERCENT
            feeDecayDurationPreset: 1, // FIFTEEN_MINUTES
            maxContributionPerAddress: 0n // Use default 5 ETH
        };

        const launchTx = await manager.connect(owner).launchLBP(auctionAddress, launchConfig);
        await expect(launchTx)
            .to.emit(manager, "LBPInitialized")
            .withArgs(auctionAddress, anyValue, anyValue, anyValue, anyValue);

        const recordAfterLaunch = await manager.getAuctionRecord(auctionAddress);
        const lbpAddress = recordAfterLaunch.lbp;
        expect(lbpAddress).to.not.equal(ethers.ZeroAddress);
        const lbp = await ethers.getContractAt("SecureLBP", lbpAddress);
        expect(await lbp.poolInitialized()).to.equal(true);

        const poolAddress = await lbp.pool();
        const pool = await ethers.getContractAt("LBPWeightedAMM", poolAddress);
        expect(await pool.reserveETH()).to.equal(recordAfterLaunch.lbpEthProvided);
        expect(await pool.reserveToken()).to.equal(recordAfterLaunch.lbpTokensProvided);

        // --- Phase 6: LBP trading ---
        await time.increaseTo(lbpStart + 5n);
        await expect(lbp.connect(alice).placeBid(0, { value: ethers.parseEther("2") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(alice.address, ethers.parseEther("2"), anyValue, anyValue, anyValue);
        await expect(lbp.connect(dave).placeBid(0, { value: ethers.parseEther("3") }))
            .to.emit(lbp, "BidPlaced")
            .withArgs(dave.address, ethers.parseEther("3"), anyValue, anyValue, anyValue);
        expect(await lbp.totalEthRaised()).to.equal(ethers.parseEther("5"));
        expect(await lbp.allocations(alice.address)).to.be.gt(0n);

        // --- Phase 7: Finalize LBP into vesting ---
        await time.increaseTo(lbpEnd + 5n);
        const escrowFactory = await ethers.getContractFactory("TokenVestingEscrow");
        const escrow = await escrowFactory.deploy(await saleToken.getAddress(), lbpAddress);
        await escrow.waitForDeployment();

        const finalizeLbpTx = await manager.connect(owner).finalizeLbp(auctionAddress, await escrow.getAddress());
        const totalAllocated = await lbp.totalTokensAllocated();
        await expect(finalizeLbpTx)
            .to.emit(lbp, "FinalizedToVesting")
            .withArgs(await escrow.getAddress(), totalAllocated);
        expect(await saleToken.balanceOf(await escrow.getAddress())).to.equal(totalAllocated);

        const lbpEthBalance = await ethers.provider.getBalance(lbpAddress);
        if (lbpEthBalance > 0n) {
            const withdrawAmount = lbpEthBalance / 4n;
            await expect(manager.connect(owner).withdrawLbpEth(auctionAddress, withdrawAmount))
                .to.emit(lbp, "WithdrawnETH")
                .withArgs(treasury.address, withdrawAmount);
        }

        const updatedRecord = await manager.getAuctionRecord(auctionAddress);
        expect(updatedRecord.lbpFinalized).to.equal(true);
        expect(updatedRecord.vestingEscrow).to.equal(await escrow.getAddress());

        // --- Phase 8: Dutch auction claims after success ---
        const aliceBalanceBefore = await saleToken.balanceOf(alice.address);
        await expect(auction.connect(alice).claim(0, [])).to.emit(saleToken, "Transfer");
        const aliceBalanceAfter = await saleToken.balanceOf(alice.address);
        expect(aliceBalanceAfter).to.be.gt(aliceBalanceBefore);
    });
});
