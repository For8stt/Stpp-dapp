import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { buildCommitHash, deployAuctionFixture, fixtureWithOverrides, randomNonce } from "./utils/dutchAuctionFixtures";

// Helper function to convert whole number qty to wei and calculate deposit
function qtyToWeiAndDeposit(qtyWhole: bigint, priceTick: bigint) {
    const qtyWei = qtyWhole * 10n**18n;
    const deposit = (qtyWei * priceTick) / 10n**18n;
    return { qtyWei, deposit };
}

function leaf(address: string): string {
    return ethers.keccak256(ethers.solidityPacked(["address"], [address]));
}

function sortHexPair(a: string, b: string): [string, string] {
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function buildTwoLeafMerkle(addressA: string, addressB: string) {
    const leafA = leaf(addressA);
    const leafB = leaf(addressB);
    const [first, second] = sortHexPair(leafA, leafB);
    const root = ethers.keccak256(ethers.concat([ethers.getBytes(first), ethers.getBytes(second)]));
    const proofForA = [leafB];
    const proofForB = [leafA];
    return {
        root,
        proofFor: (address: string) => (address === addressA ? proofForA : proofForB)
    };
}

async function activeAuctionFixture() {
    const ctx = await deployAuctionFixture();
    await time.increaseTo(ctx.startTime + 1n);
    return ctx;
}

describe("DutchAuction – 03_commit", function () {
    it("should accept a valid commit during commit window", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        const qtyWhole = 100n;
        const qtyWei = qtyWhole * 10n**18n; // Convert to wei
        const nonce = randomNonce();
        const hash = buildCommitHash(0n, qtyWei, nonce);
        // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;

        await expect(auction.connect(alice).commit(hash, [], { value: deposit }))
            .to.emit(auction, "CommitSubmitted")
            .withArgs(await alice.getAddress(), hash, deposit, qtyWei);
    });

    it("should store commit data and increment aggregates", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        const qtyWhole = 50n;
        const qtyWei = qtyWhole * 10n**18n; // Convert to wei
        const nonce = randomNonce();
        const hash = buildCommitHash(0n, qtyWei, nonce);
        // deposit in wei (ETH) = (qtyWei * priceTicks[0]) / 1e18
        const deposit = (qtyWei * priceTicks[0]) / 10n**18n;

        const tx = await auction.connect(alice).commit(hash, [], { value: deposit });
        const receipt = await tx.wait();
        const commitBlock = await ethers.provider.getBlock(receipt!.blockNumber!);

        const stored = await auction.commits(await alice.getAddress(), 0);
        expect(stored.commitHash).to.equal(hash);
        expect(stored.deposit).to.equal(deposit);
        expect(stored.commitTime).to.equal(BigInt(commitBlock!.timestamp));
        expect(stored.revealed).to.equal(false);
        expect(stored.withdrawn).to.equal(false);

        expect(await auction.committedQty(await alice.getAddress())).to.equal(qtyWei);
        expect(await auction.totalDepositCommitted()).to.equal(deposit);
        expect(await auction.totalCommitsCount()).to.equal(1n);
        expect(await auction.commitsCount(await alice.getAddress())).to.equal(1n);
    });

    it("should revert if called before startTime", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        const { qtyWei, deposit } = qtyToWeiAndDeposit(10n, priceTicks[0]);
        const hash = buildCommitHash(0n, qtyWei, randomNonce());

        await expect(auction.connect(alice).commit(hash, [], { value: deposit })).to.be.revertedWithCustomError(
            auction,
            "AuctionNotActive"
        );
    });

    it("should revert if called after commitEndTime", async function () {
        const ctx = await loadFixture(deployAuctionFixture);
        const { auction, alice, priceTicks, startTime, commitEndTime } = ctx;

        await time.increaseTo(startTime + 1n);
        await time.increaseTo(commitEndTime + 1n);

        const { qtyWei, deposit } = qtyToWeiAndDeposit(10n, priceTicks[0]);
        const hash = buildCommitHash(0n, qtyWei, randomNonce());

        await expect(auction.connect(alice).commit(hash, [], { value: deposit })).to.be.revertedWithCustomError(
            auction,
            "AuctionNotActive"
        );
    });

    it("should revert if msg.value is zero", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice } = ctx;

        const qtyWei = 10n * 10n**18n;
        const hash = buildCommitHash(0n, qtyWei, randomNonce());
        await expect(auction.connect(alice).commit(hash, [], { value: 0n })).to.be.revertedWithCustomError(
            auction,
            "InvalidCommit"
        );
    });

    it("should revert if deposit not divisible by price tick", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        const qtyWei = 1n * 10n**18n;
        const deposit = priceTicks[0] + 1n;
        const hash = buildCommitHash(0n, qtyWei, randomNonce());
        await expect(auction.connect(alice).commit(hash, [], { value: deposit })).to.be.revertedWithCustomError(
            auction,
            "DepositMismatch"
        );
    });

    it("should revert if implied quantity is zero", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        // Deposit must be so small that impliedQty = (deposit * 1e18) / priceTicks[0] = 0
        // This happens when deposit < priceTicks[0] / 1e18, but since priceTicks[0] is already in wei,
        // we need deposit < 1 wei, which is essentially 0
        const deposit = 0n;
        const qtyWei = 1n * 10n**18n;
        const hash = buildCommitHash(0n, qtyWei, randomNonce());
        await expect(auction.connect(alice).commit(hash, [], { value: deposit })).to.be.revertedWithCustomError(
            auction,
            "InvalidCommit"
        );
    });

    it("should revert if per-address cap exceeded", async function () {
        // perAddressCap must be in wei
        const ctx = await fixtureWithOverrides({ perAddressCap: ethers.parseUnits("60", 18) })();
        await time.increaseTo(ctx.startTime + 1n);

        const { auction, alice, priceTicks } = ctx;

        const { qtyWei: qty1Wei, deposit: deposit1 } = qtyToWeiAndDeposit(50n, priceTicks[0]);
        const hash = buildCommitHash(0n, qty1Wei, randomNonce());
        await auction.connect(alice).commit(hash, [], { value: deposit1 });

        const { qtyWei: qty2Wei, deposit: deposit2 } = qtyToWeiAndDeposit(20n, priceTicks[0]);
        const secondHash = buildCommitHash(0n, qty2Wei, randomNonce());
        await expect(
            auction.connect(alice).commit(secondHash, [], { value: deposit2 })
        ).to.be.revertedWithCustomError(auction, "CapExceeded");
    });

    it("should allow commit when merkle root is empty", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        const { qtyWei, deposit } = qtyToWeiAndDeposit(30n, priceTicks[0]);
        const hash = buildCommitHash(0n, qtyWei, randomNonce());
        await expect(auction.connect(alice).commit(hash, [], { value: deposit })).to.not.be.reverted;
    });

    it("should accept a valid proof when merkle root is set", async function () {
        const signers = await ethers.getSigners();
        const aliceSigner = signers[2];
        const bobSigner = signers[3];
        const { root, proofFor } = buildTwoLeafMerkle(aliceSigner.address, bobSigner.address);

        const ctx = await fixtureWithOverrides({ merkleRoot: root })();
        await time.increaseTo(ctx.startTime + 1n);

        const { auction, alice, priceTicks } = ctx;

        const { qtyWei, deposit } = qtyToWeiAndDeposit(25n, priceTicks[0]);
        const hash = buildCommitHash(0n, qtyWei, randomNonce());
        await expect(
            auction.connect(alice).commit(hash, proofFor(alice.address), { value: deposit })
        )
            .to.emit(auction, "CommitSubmitted")
            .withArgs(alice.address, hash, deposit, qtyWei);
    });

    it("should revert with InvalidProof when proof is incorrect", async function () {
        const signers = await ethers.getSigners();
        const aliceSigner = signers[2];
        const bobSigner = signers[3];
        const { root, proofFor } = buildTwoLeafMerkle(aliceSigner.address, bobSigner.address);

        const ctx = await fixtureWithOverrides({ merkleRoot: root })();
        await time.increaseTo(ctx.startTime + 1n);

        const { auction, alice, priceTicks } = ctx;

        const { qtyWei, deposit } = qtyToWeiAndDeposit(10n, priceTicks[0]);
        const hash = buildCommitHash(0n, qtyWei, randomNonce());
        const wrongProof = proofFor(bobSigner.address);

        await expect(
            auction.connect(alice).commit(hash, wrongProof, { value: deposit })
        ).to.be.revertedWithCustomError(auction, "InvalidProof");
    });

    it("should allow a user to submit multiple commits", async function () {
        const ctx = await loadFixture(activeAuctionFixture);
        const { auction, alice, priceTicks } = ctx;

        const { qtyWei: qty1Wei, deposit: deposit1 } = qtyToWeiAndDeposit(20n, priceTicks[0]);
        const { qtyWei: qty2Wei, deposit: deposit2 } = qtyToWeiAndDeposit(30n, priceTicks[0]);

        const hash1 = buildCommitHash(0n, qty1Wei, randomNonce());
        const hash2 = buildCommitHash(0n, qty2Wei, randomNonce());

        await auction.connect(alice).commit(hash1, [], { value: deposit1 });
        await auction.connect(alice).commit(hash2, [], { value: deposit2 });

        expect(await auction.commitsCount(await alice.getAddress())).to.equal(2n);
        const first = await auction.commits(await alice.getAddress(), 0);
        const second = await auction.commits(await alice.getAddress(), 1);
        expect(first.commitHash).to.equal(hash1);
        expect(second.commitHash).to.equal(hash2);

        await expect(auction.commits(await alice.getAddress(), 2n)).to.be.reverted;
    });
});
