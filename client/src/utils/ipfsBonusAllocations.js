/**
 * IPFS Bonus Allocations Utility
 * 
 * Fetches bonus allocations from IPFS with caching support.
 * Replaces the previous local file-based approach.
 */

import { fetchFromIPFS, isValidCID } from '../services/ipfs/ipfsService';

const CACHE_PREFIX = 'sttp:bonus-allocations:';
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
 * Gets cached allocations if available and valid
 * @param {string} auctionAddress - Auction contract address
 * @param {string} merkleRoot - Merkle root from contract
 * @returns {Object|null} - Cached allocations data or null
 */
const getCachedAllocations = (auctionAddress, merkleRoot) => {
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

        if (!parsed.allocations || typeof parsed.allocations !== 'object') {
            return null;
        }

        return parsed;
    } catch (error) {
        console.warn('[IPFS Bonus] Error reading cache:', error);
        return null;
    }
};

/**
 * Caches allocations data
 * @param {string} auctionAddress - Auction contract address
 * @param {string} merkleRoot - Merkle root from contract
 * @param {Object} allocationsData - Allocations data to cache
 */
const setCachedAllocations = (auctionAddress, merkleRoot, allocationsData) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const cacheKey = getCacheKey(auctionAddress, merkleRoot);
    const cacheData = {
        version: CACHE_VERSION,
        merkleRoot,
        allocations: allocationsData.allocations || {},
        summary: allocationsData.summary || null,
        cachedAt: Date.now(),
    };

    try {
        window.localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('[IPFS Bonus] Error writing cache:', error);
        try {
            clearOldCacheEntries();
            window.localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (retryError) {
            console.warn('[IPFS Bonus] Failed to write cache after cleanup:', retryError);
        }
    }
};

/**
 * Clears old cache entries (keeps last 10)
 */
const clearOldCacheEntries = () => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    try {
        const entries = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                const value = window.localStorage.getItem(key);
                if (value) {
                    try {
                        const parsed = JSON.parse(value);
                        entries.push({ key, cachedAt: parsed.cachedAt || 0 });
                    } catch (e) {
                        window.localStorage.removeItem(key);
                    }
                }
            }
        }

        entries.sort((a, b) => b.cachedAt - a.cachedAt);
        entries.slice(10).forEach(({ key }) => {
            window.localStorage.removeItem(key);
        });
    } catch (error) {
        console.warn('[IPFS Bonus] Error clearing old cache:', error);
    }
};

/**
 * Loads bonus allocation from IPFS for a specific user
 * @param {string} cid - IPFS Content Identifier
 * @param {string} userAddress - User's wallet address
 * @param {string} auctionAddress - Auction contract address (for caching)
 * @param {string} merkleRoot - Merkle root from contract (for cache validation)
 * @returns {Promise<{bonusQty: string, merkleProof: string[]}|null>}
 */
export const loadBonusAllocationFromIPFS = async (
    cid,
    userAddress,
    auctionAddress,
    merkleRoot
) => {
    if (!cid || !isValidCID(cid)) {
        console.warn('[IPFS Bonus] Invalid CID:', cid);
        return null;
    }

    if (!userAddress) {
        console.warn('[IPFS Bonus] User address required');
        return null;
    }

    const userKey = userAddress.toLowerCase();

    try {
        if (merkleRoot) {
            const cached = getCachedAllocations(auctionAddress, merkleRoot);
            if (cached && cached.allocations[userKey]) {
                console.log('[IPFS Bonus] Using cached allocation');
                return {
                    bonusQty: cached.allocations[userKey].bonusQty,
                    merkleProof: cached.allocations[userKey].merkleProof || [],
                };
            }
        }

        console.log('[IPFS Bonus] Fetching from IPFS:', cid);
        const allocationsData = await fetchFromIPFS(cid);

        if (!allocationsData.allocations || typeof allocationsData.allocations !== 'object') {
            throw new Error('Invalid allocations data structure');
        }

        if (merkleRoot && allocationsData.merkleRoot !== merkleRoot) {
            console.warn('[IPFS Bonus] Merkle root mismatch:', {
                expected: merkleRoot,
                got: allocationsData.merkleRoot,
            });
        }

        if (auctionAddress && merkleRoot) {
            setCachedAllocations(auctionAddress, merkleRoot, allocationsData);
        }

        const allocation = allocationsData.allocations[userKey];

        if (!allocation) {
            console.log('[IPFS Bonus] No allocation found for user:', userKey);
            return null;
        }

        if (!allocation.bonusQty || !Array.isArray(allocation.merkleProof)) {
            console.warn('[IPFS Bonus] Invalid allocation structure for user:', userKey);
            return null;
        }

        return {
            bonusQty: allocation.bonusQty,
            merkleProof: allocation.merkleProof,
        };
    } catch (error) {
        console.error('[IPFS Bonus] Error loading allocation from IPFS:', error);
        if (merkleRoot) {
            const cached = getCachedAllocations(auctionAddress, merkleRoot);
            if (cached && cached.allocations[userKey]) {
                console.log('[IPFS Bonus] Using cached allocation as fallback');
                return {
                    bonusQty: cached.allocations[userKey].bonusQty,
                    merkleProof: cached.allocations[userKey].merkleProof || [],
                };
            }
        }
        
        return null;
    }
};

export default {
    loadBonusAllocationFromIPFS,
};

