// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title CommitLib
 * @notice Helper functions for commit hash calculation and whitelist/deposit validation.
 */
library CommitLib {
    /**
     * @dev Returns true when `proof` validates `account` against `root`.
     */
    function verifyWhitelist(bytes32 root, bytes32[] calldata proof, address account) internal pure returns (bool) {
        if (root == bytes32(0)) {
            return true;
        }
        return MerkleProof.verify(proof, root, keccak256(abi.encodePacked(account)));
    }

    /**
     * @dev Computes the sealed bid hash used during commit phase.
     */
    function bidHash(uint256 priceTickIndex, uint256 qty, bytes32 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(priceTickIndex, qty, nonce));
    }

    /**
     * @dev Checks deposits match the implied quantity at a given reference price.
     * @notice qty is in wei (token amount with 18 decimals), referencePrice is in wei (ETH per token with 18 decimals).
     * @notice deposit = (qty * referencePrice) / 1e18
     * @notice Example: qty = 1.5e18 (1.5 tokens), referencePrice = 1e18 (1 ETH/token) => deposit = 1.5e18 wei
     */
    function depositMatches(uint256 deposit, uint256 qty, uint256 referencePrice) internal pure returns (bool) {
        return deposit == (qty * referencePrice) / 1e18;
    }
}
