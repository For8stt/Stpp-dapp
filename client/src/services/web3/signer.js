import { BrowserProvider } from "ethers";
import { DEFAULT_CHAIN_ID_HEX, rpcGuard, setTargetChainIdHex, getActiveEip1193Provider } from "./provider";

let signer;
let signerAddress;
let chainId;
let chainIdHex = DEFAULT_CHAIN_ID_HEX;

export const clearSignerCache = () => {
  signer = null;
  signerAddress = undefined;
  chainId = undefined;
  chainIdHex = DEFAULT_CHAIN_ID_HEX;
};

export const getSignerAddress = () => signerAddress;
export const getChainId = () => chainId;
export const getChainIdHex = () => chainIdHex;

export const ensureSigner = async () =>
  rpcGuard(async () => {
    const eipProvider = getActiveEip1193Provider();
    if (!eipProvider) {
      throw new Error("Wallet not connected. Please connect your wallet to perform this action.");
    }

    const browserProvider = new BrowserProvider(eipProvider);
    
    try {
      await browserProvider.send("eth_requestAccounts", []);
    } catch (error) {
      throw new Error("Wallet not connected. Please connect your wallet to perform this action.");
    }

    const nextSigner = await browserProvider.getSigner();
    const nextAddress = (await nextSigner.getAddress()).toLowerCase();
    const network = await browserProvider.getNetwork();
    const networkChainIdBigInt = network.chainId;
    const networkChainId = Number(networkChainIdBigInt);
    const networkChainIdHex = `0x${networkChainIdBigInt.toString(16)}`;

    const needsRefresh =
      !signer || signerAddress !== nextAddress || chainId !== networkChainId || !chainIdHex;

    if (needsRefresh) {
      signer = nextSigner;
      signerAddress = nextAddress;
      chainId = networkChainId;
      chainIdHex = networkChainIdHex;
    }

    setTargetChainIdHex(chainIdHex);
    return signer;
  });
