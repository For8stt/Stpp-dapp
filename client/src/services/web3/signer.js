import { DEFAULT_CHAIN_ID_HEX, ensureProvider, rpcGuard, setTargetChainIdHex } from "./provider";

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
    const provider = ensureProvider();
    await provider.send("eth_requestAccounts", []);

    const nextSigner = await provider.getSigner();
    const nextAddress = (await nextSigner.getAddress()).toLowerCase();
    const network = await provider.getNetwork();
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
