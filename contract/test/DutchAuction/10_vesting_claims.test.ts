import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    BPS_DENOMINATOR,
    buildCommitHash,
    fixtureWithOverrides,
    randomNonce
} from "./utils/dutchAuctionFixtures";

// Import Merkle tree building functions from computeBonusAllocations script
function computeLeaf(address: string, bonusQty: bigint): string {
    return ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [address, bonusQty]));
}

function buildMerkleTree(leaves: string[]): { root: string; proofs: Record<string, string[]> } {
    if (leaves.length === 0) {
        return { root: ethers.ZeroHash, proofs: {} };
    }

    const sortedLeaves = [...leaves].sort((a, b) => {
        return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
    });

    const layers: string[][] = [sortedLeaves];
    while (layers[layers.length - 1].length > 1) {
        const current = layers[layers.length - 1];
        const next: string[] = [];
        
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = i + 1 < current.length ? current[i + 1] : current[i];
            const [lo, hi] = BigInt(left) < BigInt(right) ? [left, right] : [right, left];
            next.push(ethers.keccak256(ethers.concat([lo, hi])));
        }
        
        layers.push(next);
    }

    const root = layers[layers.length - 1][0];
    const proofs: Record<string, string[]> = {};

    for (let leafIndex = 0; leafIndex < sortedLeaves.length; leafIndex++) {
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
        
        proofs[sortedLeaves[leafIndex]] = proof;
    }

    return { root, proofs };
}

type AuctionFixture = Awaited<ReturnType<ReturnType<typeof fixtureWithOverrides>>>;

async function commitBid(
    ctx: AuctionFixture,
    {
        signer,
        qty,
        priceTickIndex = 0n
    }: { signer: Signer; qty: bigint; priceTickIndex?: bigint }
) {
    const { auction, priceTicks } = ctx;
    const nonce = randomNonce();
    // Convert qty to wei if it's a whole number
    const qtyWei = qty < 10n**18n ? qty * 10n**18n : qty;
    const commitHash = buildCommitHash(priceTickIndex, qtyWei, nonce);
    // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
    await auction.connect(signer).commit(commitHash, [], { value: deposit });
    return { nonce, deposit, priceTickIndex, qty: qtyWei };
}

async function finalizeSuccessfulAuction(
    ctx: AuctionFixture,
    params: { signer?: Signer; qty?: bigint; priceTickIndex?: bigint } = {}
) {
    const { auction, startTime, commitEndTime, revealEndTime, config } = ctx;
    const signer = params.signer ?? ctx.alice;
    const qty = params.qty ?? config.tokensForSale;
    const priceTickIndex = params.priceTickIndex ?? 0n;

    await time.increaseTo(startTime + 1n);
    const commitData = await commitBid(ctx, { signer, qty, priceTickIndex });

    await time.increaseTo(commitEndTime + 1n);
    // Use qty in wei from commitBid result
    await auction
        .connect(signer)
        .reveal(Number(priceTickIndex), commitData.qty, commitData.nonce, 0);

    await time.increaseTo(revealEndTime + 1n);
    await auction.finalize();

    return { qty: commitData.qty, ...commitData };
}

describe("DutchAuction – 10_vesting_claims", function () {
    it("should return 0 vested tokens before finalize", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 10_000n
            })
        );

        const { auction, token, alice, startTime, commitEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = randomNonce();
        const qtyWhole = 25n;
        const qtyWei = qtyWhole * 10n**18n;
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
        await auction.connect(alice).commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

        expect(await token.balanceOf(await alice.getAddress())).to.equal(0n);
        expect(await auction.tokensClaimed(await alice.getAddress())).to.equal(0n);
    });

    it("should revert claim if auction is not finalized", async function () {
        const ctx = await loadFixture(fixtureWithOverrides({}));
        const { auction, alice, startTime, commitEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = randomNonce();
        const qtyWhole = 40n;
        const qtyWei = qtyWhole * 10n**18n;
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
        await auction.connect(alice).commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

        await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
    });

    it("should revert claim if auction was unsuccessful", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                softCap: ethers.parseEther("100"),
                tokensForSale: ethers.parseUnits("50", 18),
                perAddressCap: ethers.parseUnits("100", 18)
            })
        );
        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const nonce = randomNonce();
        const qtyWhole = 50n;
        const qtyWei = qtyWhole * 10n**18n;
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
        await auction.connect(alice).commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();
        expect(await auction.successful()).to.equal(false);

        await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
    });

    it("should compute allocation on first claim call", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, alice } = ctx;

        await finalizeSuccessfulAuction(ctx);

        const before = await auction.accountAllocations(await alice.getAddress());
        expect(before.computed).to.equal(false);

        await auction.connect(alice).claim(0, []);

        const after = await auction.accountAllocations(await alice.getAddress());
        expect(after.computed).to.equal(true);
        expect(await auction.tokensClaimed(await alice.getAddress())).to.equal(after.totalQty + after.bonusQty);
    });

    it("should allow user to claim vested tokens correctly", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, token, alice } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx);
        const aliceAddress = await alice.getAddress();
        await auction.connect(alice).claim(0, []);

        const allocation = await auction.accountAllocations(aliceAddress);
        const expectedTotal = allocation.totalQty + allocation.bonusQty;

        expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTotal);
        expect(await token.balanceOf(aliceAddress)).to.equal(expectedTotal);
        expect(expectedTotal).to.be.gte(qty);
    });

    it("should not allow user to claim more than allocated tokens", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, alice } = ctx;

        await finalizeSuccessfulAuction(ctx);
        await auction.connect(alice).claim(0, []);
        await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "NothingToClaim");
    });

    it("should unlock 0 tokens if vesting has not started (vestingStart > block.timestamp)", async function () {
        const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingStart: now + 50_000n,
                vestingDuration: 3_600n
            })
        );
        const { auction, alice } = ctx;

        await finalizeSuccessfulAuction(ctx);

        await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "NothingToClaim");
        expect(await auction.tokensClaimed(await alice.getAddress())).to.equal(0n);
    });

    it("should unlock full tokens if vestingDuration is 0", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, token, alice } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx);
        const aliceAddress = await alice.getAddress();
        await auction.connect(alice).claim(0, []);

        const allocation = await auction.accountAllocations(aliceAddress);
        const expectedTotal = allocation.totalQty + allocation.bonusQty;

        expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTotal);
        expect(await token.balanceOf(aliceAddress)).to.equal(expectedTotal);
        expect(expectedTotal).to.be.gte(qty);
    });

    it("should unlock full tokens after vestingDuration has passed", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 4_800n
            })
        );
        const { auction, token, alice, config } = ctx;

        const { qty } = await finalizeSuccessfulAuction(ctx);
        const aliceAddress = await alice.getAddress();
        await time.increaseTo(config.vestingStart + config.vestingDuration + 1n);
        await auction.connect(alice).claim(0, []);

        const allocation = await auction.accountAllocations(aliceAddress);
        const expectedTotal = allocation.totalQty + allocation.bonusQty;

        expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTotal);
        expect(await token.balanceOf(aliceAddress)).to.equal(expectedTotal);
        expect(expectedTotal).to.be.gte(qty);
    });

    it("should emit BonusAllocated when bonus tokens are included in claim", async function () {
        const bonusPct = 1_000n;
        const saleAmount = 20n;
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n,
                bonusReserve: ethers.parseUnits("50", 18),
                earlyBonusPct: bonusPct,
                tokensForSale: ethers.parseUnits(saleAmount.toString(), 18),
                perAddressCap: ethers.parseUnits(saleAmount.toString(), 18),
                softCap: ethers.parseEther("0.005")
            })
        );
        const { auction, alice, deployer } = ctx;

        // saleAmount is a whole number, convert to wei
        const saleAmountWei = ethers.parseUnits(saleAmount.toString(), 18);
        const { qty: qtyWei } = await finalizeSuccessfulAuction(ctx, { qty: saleAmountWei });
        
        // bonus = (qtyWei * bonusPct) / BPS_DENOMINATOR (both in wei)
        const expectedBonus = (qtyWei * bonusPct) / BPS_DENOMINATOR;
        
        // Build Merkle tree for bonus allocation
        const aliceAddress = await alice.getAddress();
        const leaf = computeLeaf(aliceAddress, expectedBonus);
        const { root, proofs } = buildMerkleTree([leaf]);
        const merkleProof = proofs[leaf] || [];

        await auction.connect(deployer).setBonusMerkleRoot(root, "");

        await expect(auction.connect(alice).claim(expectedBonus, merkleProof))
            .to.emit(auction, "BonusAllocated")
            .withArgs(aliceAddress, expectedBonus);
    });

    it("should send correct ETH refund if user over-deposited", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n,
                tokensForSale: ethers.parseUnits("60", 18),
                perAddressCap: ethers.parseUnits("60", 18),
                softCap: ethers.parseEther("0.05")
            })
        );
        const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

        await time.increaseTo(startTime + 1n);
        const qtyWhole = 60n;
        const qtyWei = qtyWhole * 10n**18n;
        const nonce = randomNonce();
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;

        await auction.connect(alice).commit(buildCommitHash(2n, qtyWei, nonce), [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(2, qtyWei, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        const clearingPrice = priceTicks[2];
        // paymentDue = (qtyWei * clearingPrice) / 1e18
        const expectedPayment = (qtyWei * clearingPrice) / 10n**18n;
        const expectedRefund = deposit - expectedPayment;

        const balanceBefore = await ethers.provider.getBalance(await alice.getAddress());
        const tx = await auction.connect(alice).claim(0, []);
        const receipt = await tx.wait();
        const gasPaid = receipt ? receipt.gasUsed * (tx.gasPrice ?? 0n) : 0n;
        const balanceAfter = await ethers.provider.getBalance(await alice.getAddress());

        expect(balanceAfter + gasPaid - balanceBefore).to.equal(expectedRefund);
    });

    it("should revert claim if nothing to claim (no tokens and no refund left)", async function () {
        const ctx = await loadFixture(
            fixtureWithOverrides({
                vestingDuration: 0n
            })
        );
        const { auction, alice, outsider, startTime, commitEndTime, revealEndTime, priceTicks, config } = ctx;

        await time.increaseTo(startTime + 1n);
        // config.tokensForSale is now in wei
        const qtyWei = config.tokensForSale;
        const nonce = randomNonce();
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
        await auction.connect(alice).commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

        await time.increaseTo(commitEndTime + 1n);
        await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

        await time.increaseTo(revealEndTime + 1n);
        await auction.finalize();

        await expect(auction.connect(outsider).claim(0, [])).to.be.revertedWithCustomError(auction, "NothingToClaim");
    });
});
