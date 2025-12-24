/**
 * Utility functions for loading and managing bonus allocations (Merkle proofs)
 */

/**
 * Load bonus allocations from a JSON file
 * @param {string} auctionAddress - The auction contract address
 * @param {string} userAddress - The user's wallet address
 * @returns {Promise<{bonusQty: string, merkleProof: string[]} | null>}
 */
export const loadBonusAllocation = async (auctionAddress, userAddress) => {
  if (!auctionAddress || !userAddress) {
    console.log('[Bonus] Missing parameters:', { auctionAddress, userAddress });
    return null;
  }

  // Use process.env.PUBLIC_URL if available (for CRA), otherwise use root path
  const publicUrl = process.env.PUBLIC_URL || '';
  const filePath = `${publicUrl}/bonus-allocations/${auctionAddress.toLowerCase()}.json`;
  const userKey = userAddress.toLowerCase();

  try {
    console.log('[Bonus] Attempting to load bonus allocation:', {
      filePath,
      publicUrl,
      userKey,
      auctionAddress: auctionAddress.toLowerCase(),
      userAddress: userAddress.toLowerCase()
    });

    // Try to load from a standard path: /bonus-allocations/{auctionAddress}.json
    // Add cache-busting query parameter to avoid caching issues
    const response = await fetch(`${filePath}?t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-cache'
    });
    
    console.log('[Bonus] Fetch response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      url: response.url
    });
    
    if (!response.ok) {
      // File not found - user might not have a bonus allocation
      console.log(`[Bonus] File not found (${response.status}): ${filePath}`);
      // Try to read response as text to see what we got
      try {
        const text = await response.text();
        console.log('[Bonus] Response text (first 200 chars):', text.substring(0, 200));
      } catch (e) {
        console.warn('[Bonus] Could not read response text:', e);
      }
      return null;
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      console.warn('[Bonus] Unexpected content type:', contentType);
      const text = await response.text();
      console.log('[Bonus] Response text (first 200 chars):', text.substring(0, 200));
      return null;
    }

    const data = await response.json();
    
    console.log('[Bonus] File loaded successfully:', {
      hasMerkleRoot: !!data.merkleRoot,
      merkleRoot: data.merkleRoot,
      allocationCount: data.allocations ? Object.keys(data.allocations).length : 0,
      userKey,
      hasUserKey: data.allocations ? userKey in data.allocations : false
    });
    
    // Validate structure
    if (!data.allocations || typeof data.allocations !== 'object') {
      console.warn('[Bonus] Invalid bonus allocation file structure:', {
        hasAllocations: !!data.allocations,
        allocationsType: typeof data.allocations
      });
      return null;
    }

    // Log all available keys for debugging
    const availableKeys = Object.keys(data.allocations);
    console.log('[Bonus] Available allocation keys (first 10):', availableKeys.slice(0, 10));
    console.log('[Bonus] Looking for user key:', userKey);
    console.log('[Bonus] Exact match found:', availableKeys.includes(userKey));

    // Look up user's allocation (case-insensitive)
    const allocation = data.allocations[userKey];

    if (!allocation) {
      console.log(`[Bonus] No bonus allocation found for user:`, {
        userAddress,
        userKey,
        availableKeysCount: availableKeys.length,
        sampleKeys: availableKeys.slice(0, 5)
      });
      return null;
    }

    console.log('[Bonus] Allocation found for user:', {
      userAddress,
      bonusQty: allocation.bonusQty,
      hasMerkleProof: !!allocation.merkleProof,
      proofLength: allocation.merkleProof?.length
    });

    // Validate allocation structure
    // Note: merkleProof can be empty array for single-leaf trees
    if (!allocation.bonusQty || !Array.isArray(allocation.merkleProof)) {
      console.warn('[Bonus] Invalid allocation structure for user:', {
        hasBonusQty: !!allocation.bonusQty,
        bonusQty: allocation.bonusQty,
        hasMerkleProof: !!allocation.merkleProof,
        merkleProofType: typeof allocation.merkleProof,
        isArray: Array.isArray(allocation.merkleProof)
      });
      return null;
    }
    
    // Empty merkleProof is valid for single-leaf trees
    if (allocation.merkleProof.length === 0) {
      console.log('[Bonus] Empty merkleProof detected (valid for single-leaf tree)');
    }

    return {
      bonusQty: allocation.bonusQty,
      merkleProof: allocation.merkleProof,
    };
  } catch (error) {
    console.warn('[Bonus] Error loading bonus allocation:', {
      error,
      message: error?.message,
      stack: error?.stack,
      filePath,
      userKey
    });
    return null;
  }
};

/**
 * Get the Merkle root from bonus allocations file
 * @param {string} auctionAddress - The auction contract address
 * @returns {Promise<string | null>}
 */
export const loadBonusMerkleRoot = async (auctionAddress) => {
  if (!auctionAddress) {
    return null;
  }

  try {
    const response = await fetch(`/bonus-allocations/${auctionAddress.toLowerCase()}.json`);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.merkleRoot && typeof data.merkleRoot === 'string') {
      return data.merkleRoot;
    }

    return null;
  } catch (error) {
    console.warn('[Bonus] Error loading Merkle root:', error);
    return null;
  }
};

/**
 * Check if bonus allocations file exists for an auction
 * @param {string} auctionAddress - The auction contract address
 * @returns {Promise<boolean>}
 */
export const bonusAllocationsExist = async (auctionAddress) => {
  if (!auctionAddress) {
    return false;
  }

  try {
    const response = await fetch(`/bonus-allocations/${auctionAddress.toLowerCase()}.json`, {
      method: 'HEAD',
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

