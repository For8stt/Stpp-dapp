import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, mainnet, base, baseSepolia } from 'wagmi/chains';
import { defineChain } from 'viem';

const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: 'STPP DApp',
  projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || '00000000000000000000000000000000',
  chains: [hardhatLocal, sepolia, mainnet, base, baseSepolia],
  ssr: false,
});

