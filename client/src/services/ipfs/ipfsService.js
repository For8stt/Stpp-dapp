/**
 * IPFS Service Abstraction
 * 
 * Provides a unified interface for fetching content from IPFS.
 * Supports multiple IPFS gateways and can be easily extended
 * to support different providers (web3.storage, storacha.network, etc.)
 * 
 * Architecture: Future-proof design allows switching providers
 * without changing frontend claim logic.
 */

/**
 * IPFS Gateway Configuration
 * Can be extended to support multiple gateways with fallback
 */
const IPFS_GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://gateway.ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    // For local development with local IPFS daemon
    ...(process.env.NODE_ENV === 'development' ? ['http://127.0.0.1:8080/ipfs/'] : [])
];

/**
 * Fetches content from IPFS using a CID
 * @param {string} cid - IPFS Content Identifier
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Parsed JSON content
 */
export const fetchFromIPFS = async (cid, options = {}) => {
    if (!cid || typeof cid !== 'string') {
        throw new Error('Invalid CID provided');
    }

    // Remove any existing /ipfs/ prefix
    const cleanCID = cid.replace(/^\/ipfs\//, '').trim();
    
    if (!cleanCID) {
        throw new Error('Empty CID provided');
    }

    const { timeout = 30000, gatewayIndex = 0 } = options;
    const gateway = IPFS_GATEWAYS[gatewayIndex] || IPFS_GATEWAYS[0];
    const url = `${gateway}${cleanCID}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            // Try next gateway if available
            if (gatewayIndex < IPFS_GATEWAYS.length - 1) {
                console.warn(`[IPFS] Gateway ${gatewayIndex} failed (${response.status}), trying next...`);
                return fetchFromIPFS(cid, { ...options, gatewayIndex: gatewayIndex + 1 });
            }
            throw new Error(`IPFS fetch failed: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
            throw new Error(`Unexpected content type: ${contentType}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`IPFS fetch timeout after ${timeout}ms`);
        }
        
        // Try next gateway if available
        if (gatewayIndex < IPFS_GATEWAYS.length - 1) {
            console.warn(`[IPFS] Gateway ${gatewayIndex} error: ${error.message}, trying next...`);
            return fetchFromIPFS(cid, { ...options, gatewayIndex: gatewayIndex + 1 });
        }
        
        throw error;
    }
};

/**
 * Validates IPFS CID format
 * @param {string} cid - IPFS Content Identifier
 * @returns {boolean} - True if CID format is valid
 */
export const isValidCID = (cid) => {
    if (!cid || typeof cid !== 'string') return false;
    
    // Basic CID validation (supports both v0 and v1)
    const cleanCID = cid.replace(/^\/ipfs\//, '').trim();
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{56,})$/.test(cleanCID);
};

/**
 * Gets IPFS URL for a CID (for display purposes)
 * @param {string} cid - IPFS Content Identifier
 * @returns {string} - IPFS gateway URL
 */
export const getIPFSURL = (cid) => {
    if (!cid) return null;
    const cleanCID = cid.replace(/^\/ipfs\//, '').trim();
    return `${IPFS_GATEWAYS[0]}${cleanCID}`;
};

export default {
    fetchFromIPFS,
    isValidCID,
    getIPFSURL,
};

