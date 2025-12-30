/**
 * IPFS Whitelist Utility
 * 
 * Fetches whitelist Merkle proofs from IPFS with caching support.
 * Automatically loads proof for connected wallet address.
 */

import { fetchFromIPFS, isValidCID } from '../services/ipfs/ipfsService';

const CACHE_PREFIX = 'sttp:whitelist:';
const CACHE_VERSION = '1';

/**
 * Generates cache key for localStorage
 * @param {string} auctionAddress - Auction contract address
 * @param {string} merkleRoot - Merkle root from contract
 * @returns {string} - Cache key
 */
const getCacheKey = (auctionAddress, merkleRoot) => {
    return `${CACHE_PREFIX}${auctionAddress.toLowerCase()}:${merkleRoot}`;
};

/**
 * Gets cached whitelist data if available and valid
 * @param {string} auctionAddress - Auction contract address
 * @param {string} merkleRoot - Merkle root from contract
 * @returns {Object|null} - Cached whitelist data or null
 */
const getCachedWhitelist = (auctionAddress, merkleRoot) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }

    try {
        const cacheKey = getCacheKey(auctionAddress, merkleRoot);
        const cached = window.localStorage.getItem(cacheKey);
        
        if (!cached) {
            return null;
        }

        const parsed = JSON.parse(cached);
        if (!parsed.version || parsed.version !== CACHE_VERSION) {
            return null;
        }

        if (!parsed.merkleRoot || parsed.merkleRoot !== merkleRoot) {
            return null;
        }

        if (!parsed.proofs || typeof parsed.proofs !== 'object') {
            return null;
        }

        return parsed;
    } catch (error) {
        console.warn('[IPFS Whitelist] Error reading cache:', error);
        return null;
    }
};

/**
 * Caches whitelist data
 * @param {string} auctionAddress - Auction contract address
 * @param {string} merkleRoot - Merkle root from contract
 * @param {Object} whitelistData - Whitelist data to cache
 */
const setCachedWhitelist = (auctionAddress, merkleRoot, whitelistData) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const cacheKey = getCacheKey(auctionAddress, merkleRoot);
    const cacheData = {
        version: CACHE_VERSION,
        merkleRoot,
        proofs: whitelistData.proofs || {},
        cachedAt: Date.now(),
    };

    try {
        window.localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('[IPFS Whitelist] Error writing cache:', error);
    }
};

/**
 * Fetches whitelist JSON from IPFS and returns proof for a specific address
 * @param {string} cid - IPFS CID of whitelist JSON file
 * @param {string} address - Ethereum address to get proof for (normalized to lowercase)
 * @param {string} auctionAddress - Auction contract address (for cache key)
 * @param {string} merkleRoot - Merkle root from contract (for cache validation)
 * @returns {Promise<{proof: string[]}|null>} - Merkle proof array or null if not found
 */
export const loadWhitelistProofFromIPFS = async (cid, address, auctionAddress, merkleRoot) => {
    if (!cid || !isValidCID(cid)) {
        console.warn('[IPFS Whitelist] Invalid CID:', cid);
        return null;
    }

    if (!address) {
        console.warn('[IPFS Whitelist] Address is required');
        return null;
    }

    const normalizedAddress = address.toLowerCase();

    if (auctionAddress && merkleRoot) {
        const cached = getCachedWhitelist(auctionAddress, merkleRoot);
        if (cached && cached.proofs[normalizedAddress]) {
            console.log('[IPFS Whitelist] Using cached proof for', normalizedAddress);
            return {
                proof: cached.proofs[normalizedAddress]
            };
        }
    }

    try {
        console.log('[IPFS Whitelist] Fetching from IPFS:', cid);
        const data = await fetchFromIPFS(cid);
        
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid whitelist data format');
        }

        let proofsData;
        let dataMerkleRoot = null;
        if (data.proofs && typeof data.proofs === 'object') {
            proofsData = data.proofs;
            dataMerkleRoot = data.merkleRoot;
        } else {
            proofsData = data;
        }
        if (!proofsData || typeof proofsData !== 'object' || Array.isArray(proofsData)) {
            throw new Error('Whitelist data must be an object mapping addresses to proof arrays');
        }
        if (merkleRoot && dataMerkleRoot) {
            if (dataMerkleRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
                console.warn('[IPFS Whitelist] Merkle root mismatch:', {
                    expected: merkleRoot,
                    got: dataMerkleRoot
                });
            }
        }

        if (auctionAddress && merkleRoot) {
            const cacheData = {
                merkleRoot: dataMerkleRoot || merkleRoot,
                proofs: proofsData
            };
            setCachedWhitelist(auctionAddress, merkleRoot || dataMerkleRoot || "", cacheData);
        }

        const proof = proofsData[normalizedAddress];
        
        if (!proof || !Array.isArray(proof)) {
            console.log('[IPFS Whitelist] No proof found for address:', normalizedAddress);
            return null;
        }

        console.log('[IPFS Whitelist] Found proof for', normalizedAddress, 'with', proof.length, 'elements');
        return { proof };
    } catch (error) {
        console.error('[IPFS Whitelist] Error loading from IPFS:', error);
        return null;
    }
};


