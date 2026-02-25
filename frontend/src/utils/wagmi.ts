import { metaMask } from '@wagmi/connectors';
import { createConfig, http } from '@wagmi/core';
import { defineChain } from 'viem';

export const prividiumChain = defineChain({
  id: parseInt(import.meta.env.VITE_CHAIN_ID),
  name: import.meta.env.VITE_CHAIN_NAME,
  nativeCurrency: {
    name: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL,
    symbol: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL,
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL]
    },
    public: {
      http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL]
    }
  },
  testnet: true
});

export function createWagmiConfig(walletRpcUrl?: string) {
  const rpcUrl = walletRpcUrl || import.meta.env.VITE_PRIVIDIUM_RPC_URL;

  return createConfig({
    chains: [prividiumChain],
    connectors: [metaMask()],
    transports: {
      [prividiumChain.id]: http(rpcUrl)
    }
  });
}

export const config = createWagmiConfig();
