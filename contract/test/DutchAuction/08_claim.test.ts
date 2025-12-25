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

type AuctionFixture = Awaited<ReturnType<ReturnType<typeof fixtureWithOverrides>>>;

interface BidParams {
    signer?: Signer;
    qty?: bigint;
    priceTickIndex?: bigint;
}

async function commitBid(
    ctx: AuctionFixture,
    {
        signer,
        qty,
        priceTickIndex
    }: { signer: Signer; qty: bigint; priceTickIndex: bigint }
) {
    const { auction, priceTicks } = ctx;
    const bidder = signer;
    const address = await bidder.getAddress();
    const commitIndex = await auction.commitsCount(address);
    const nonce = randomNonce();
    // Convert qty to wei if it's a whole number
    const qtyWei = qty < 10n**18n ? qty * 10n**18n : qty;
    // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
    const deposit = (qtyWei * priceTicks[0]) / 10n**18n;

    await auction
        .connect(bidder)
        .commit(buildCommitHash(priceTickIndex, qtyWei, nonce), [], { value: deposit });

    return { nonce, deposit, commitIndex: Number(commitIndex), qty: qtyWei };
}

async function finalizeSuccessfulAuction(ctx: AuctionFixture, params: BidParams = {}) {
    const signer = params.signer ?? ctx.alice;
    const qty = params.qty ?? ctx.config.tokensForSale;
    const priceTickIndex = params.priceTickIndex ?? 0n;

    const { auction, startTime, commitEndTime, revealEndTime } = ctx;

    await time.increaseTo(startTime + 1n);
    const { nonce, deposit, commitIndex, qty: qtyWei } = await commitBid(ctx, {
        signer,
        qty,
        priceTickIndex
    });

    await time.increaseTo(commitEndTime + 1n);
    // Use qty in wei from commitBid result
    await auction.connect(signer).reveal(priceTickIndex, qtyWei, nonce, commitIndex);

    await time.increaseTo(revealEndTime + 1n);
    await auction.connect(ctx.deployer).finalize();

    return { signer, qty: qtyWei, priceTickIndex, nonce, deposit };
}

describe("DutchAuction – 08_claim", function () {
    describe("success paths", function () {
        it("should compute allocation on first claim if not computed", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n
                })
            );
            const { auction, alice } = ctx;

            await finalizeSuccessfulAuction(ctx);

            const aliceAddress = await alice.getAddress();
            const before = await auction.accountAllocations(aliceAddress);
            expect(before.computed).to.equal(false);

            await auction.connect(alice).claim(0, []);

            const after = await auction.accountAllocations(aliceAddress);
            expect(after.computed).to.equal(true);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(after.totalQty + after.bonusQty);
        });

        it("should allow user to claim vested tokens based on vesting schedule", async function () {
            const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingStart: now + 600n,
                    vestingDuration: 3_600n,
                    bonusReserve: 0n
                })
            );
            const { auction, token, alice, config } = ctx;

            const { qty } = await finalizeSuccessfulAuction(ctx);

            await time.increaseTo(config.vestingStart + config.vestingDuration + 1n);
            await auction.connect(alice).claim(0, []);

            expect(await token.balanceOf(await alice.getAddress())).to.equal(qty);
        });

        it("should allow user to receive ETH refund for overpayment", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n,
                    tokensForSale: ethers.parseUnits("60", 18),
                    perAddressCap: ethers.parseUnits("60", 18),
                    softCap: 0n
                })
            );
            const { auction, alice, priceTicks } = ctx;

            const qtyWhole = 60n;
            const { qty: qtyWei } = await finalizeSuccessfulAuction(ctx, { qty: qtyWhole, priceTickIndex: 2n });

            const clearingPrice = await auction.clearingPrice();
            // qtyWei is in wei, deposit = (qtyWei * priceTicks[0]) / 1e18
            const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
            // paymentDue = (allocatedQty * clearingPrice) / 1e18, allocatedQty = qtyWei
            const paymentDue = (qtyWei * clearingPrice) / 10n**18n;
            const expectedRefund = deposit - paymentDue;

            const aliceAddress = await alice.getAddress();
            const balanceBefore = await ethers.provider.getBalance(aliceAddress);
            const tx = await auction.connect(alice).claim(0, []);
            const receipt = await tx.wait();
            const gasPaid = receipt ? receipt.gasUsed * (tx.gasPrice ?? 0n) : 0n;
            const balanceAfter = await ethers.provider.getBalance(aliceAddress);

            expect(balanceAfter + gasPaid - balanceBefore).to.equal(expectedRefund);
        });

        it("should emit BonusAllocated if bonus tokens are included in claim", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    bonusReserve: ethers.parseUnits("50", 18),
                    earlyBonusPct: 1_000n,
                    tokensForSale: ethers.parseUnits("20", 18),
                    perAddressCap: ethers.parseUnits("20", 18),
                    vestingDuration: 0n,
                    softCap: 0n
                })
            );
            const { auction, alice, deployer } = ctx;

            // ctx.config.tokensForSale is now in wei
            const { qty: qtyWei } = await finalizeSuccessfulAuction(ctx, { qty: ctx.config.tokensForSale });
            // bonus = (qtyWei * earlyBonusPct) / BPS_DENOMINATOR (both in wei)
            const expectedBonus = (qtyWei * ctx.config.earlyBonusPct) / BPS_DENOMINATOR;

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

            const aliceAddress = await alice.getAddress();
            const leaf = computeLeaf(aliceAddress, expectedBonus);
            const { root, proofs } = buildMerkleTree([leaf]);
            const merkleProof = proofs[leaf] || [];
                        await auction.connect(deployer).setBonusMerkleRoot(root, "");

            await expect(auction.connect(alice).claim(expectedBonus, merkleProof))
                .to.emit(auction, "BonusAllocated")
                .withArgs(aliceAddress, expectedBonus);
        });

        it("should update tokensClaimed and refundedAmount correctly", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n,
                    tokensForSale: ethers.parseUnits("90", 18),
                    perAddressCap: ethers.parseUnits("90", 18),
                    softCap: 0n
                })
            );
            const { auction, alice } = ctx;

            const { qty, deposit } = await finalizeSuccessfulAuction(ctx, { qty: 90n, priceTickIndex: 2n });
            await auction.connect(alice).claim(0, []);

            const aliceAddress = await alice.getAddress();
            const allocation = await auction.accountAllocations(aliceAddress);
            const expectedTokensClaimed = allocation.totalQty + allocation.bonusQty;
            const expectedRefund = deposit - allocation.paymentDue;

            expect(await auction.tokensClaimed(aliceAddress)).to.equal(expectedTokensClaimed);
            expect(await auction.refundedAmount(aliceAddress)).to.equal(expectedRefund);
            expect(expectedTokensClaimed).to.equal(qty + allocation.bonusQty);
        });

        it("should allow multiple partial claims over time (vesting increases)", async function () {
            const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingStart: now + 5_000n,
                    vestingDuration: 1_200n,
                    tokensForSale: ethers.parseUnits("80", 18),
                    perAddressCap: ethers.parseUnits("80", 18),
                    softCap: 0n
                })
            );
            const { auction, alice, config } = ctx;

            const { qty, deposit } = await finalizeSuccessfulAuction(ctx, { qty: 80n, priceTickIndex: 2n });
            const aliceAddress = await alice.getAddress();

            // Initial claim before vesting completion should only send refund.
            const refundOnlyTs = config.vestingStart + config.vestingDuration - 10n;
            const currentTs = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
            if (refundOnlyTs > currentTs) {
                await time.increaseTo(refundOnlyTs);
            }

            const clearingPrice = await auction.clearingPrice();
            // qty is in wei, paymentDue = (qty * clearingPrice) / 1e18
            const paymentDue = (qty * clearingPrice) / 10n**18n;
            const expectedRefund = deposit - paymentDue;

            const balanceBefore = await ethers.provider.getBalance(aliceAddress);
            const tx1 = await auction.connect(alice).claim(0, []);
            const receipt1 = await tx1.wait();
            const gasPaid1 = receipt1 ? receipt1.gasUsed * (tx1.gasPrice ?? 0n) : 0n;
            const balanceAfter = await ethers.provider.getBalance(aliceAddress);
            expect(balanceAfter + gasPaid1 - balanceBefore).to.equal(expectedRefund);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(0n);

            // Move past vesting end and claim vested tokens.
            await time.increaseTo(config.vestingStart + config.vestingDuration + 1n);
            await auction.connect(alice).claim(0, []);

            const allocationAfter = await auction.accountAllocations(aliceAddress);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(allocationAfter.totalQty + allocationAfter.bonusQty);
            expect(await auction.refundedAmount(aliceAddress)).to.equal(expectedRefund);
            expect(await auction.revealedDeposit(aliceAddress)).to.equal(deposit);
            expect(await auction.tokensClaimed(aliceAddress)).to.equal(qty + allocationAfter.bonusQty);
        });
    });

    describe("reverts", function () {
        it("should revert if auction is not finalized", async function () {
            const ctx = await loadFixture(fixtureWithOverrides({}));
            const { auction, alice, startTime, commitEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qtyWhole = 40n;
            const qtyWei = qtyWhole * 10n**18n;
            const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

            await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
        });

        it("should revert if auction failed (unsuccessful)", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    softCap: ethers.parseEther("100"),
                    tokensForSale: ethers.parseUnits("50", 18),
                    perAddressCap: ethers.parseUnits("50", 18)
                })
            );
            const { auction, alice, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qtyWhole = 50n;
            const qtyWei = qtyWhole * 10n**18n;
            const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(alice).reveal(0, qtyWei, nonce, 0);

            await time.increaseTo(revealEndTime + 1n);
            await auction.connect(ctx.deployer).finalize();
            expect(await auction.successful()).to.equal(false);

            await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "AuctionNotFinalized");
        });

        it("should revert if user has no revealed bids", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    softCap: 0n,
                    vestingDuration: 0n
                })
            );
            const { auction, alice, bob, startTime, commitEndTime, revealEndTime, priceTicks } = ctx;

            await time.increaseTo(startTime + 1n);
            const nonce = randomNonce();
            const qtyWhole = 30n;
            const qtyWei = qtyWhole * 10n**18n;
            const deposit = (qtyWei * priceTicks[0]) / 10n**18n;
            await auction
                .connect(alice)
                .commit(buildCommitHash(0n, qtyWei, nonce), [], { value: deposit });

            const bobNonce = randomNonce();
            const bobQtyWhole = 40n;
            const bobQtyWei = bobQtyWhole * 10n**18n;
            const bobDeposit = (bobQtyWei * priceTicks[0]) / 10n**18n;
            await auction
                .connect(bob)
                .commit(buildCommitHash(0n, bobQtyWei, bobNonce), [], { value: bobDeposit });

            await time.increaseTo(commitEndTime + 1n);
            await auction.connect(bob).reveal(0, bobQtyWei, bobNonce, 0);

            await time.increaseTo(revealEndTime + 1n);
            await auction.connect(ctx.deployer).finalize();
            expect(await auction.successful()).to.equal(true);

            await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });

        it("should revert if user has already claimed everything", async function () {
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

        it("should revert if nothing is vested yet (before vestingStart)", async function () {
            const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingStart: now + 10_000n,
                    vestingDuration: 3_600n,
                    tokensForSale: ethers.parseUnits("40", 18),
                    perAddressCap: ethers.parseUnits("40", 18),
                    softCap: 0n
                })
            );
            const { auction, alice } = ctx;

            await finalizeSuccessfulAuction(ctx, { qty: 40n, priceTickIndex: 0n });
            await expect(auction.connect(alice).claim(0, [])).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });

        it("should revert if reward tokens are zero and no refund is due (NothingToClaim)", async function () {
            const ctx = await loadFixture(
                fixtureWithOverrides({
                    vestingDuration: 0n
                })
            );
            const { auction, outsider } = ctx;

            await finalizeSuccessfulAuction(ctx);
            await expect(auction.connect(outsider).claim(0, [])).to.be.revertedWithCustomError(auction, "NothingToClaim");
        });
    });
});
