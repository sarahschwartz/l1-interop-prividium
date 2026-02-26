import { metaMask } from "@wagmi/connectors";
import { createConfig, http } from "@wagmi/core";
import { defineChain } from "viem";

const l1ChainId = Number(import.meta.env.VITE_L1_CHAIN_ID || 31337);
const l1RpcUrl = import.meta.env.VITE_L1_RPC_URL || "http://localhost:5010";

export const l1Chain = defineChain({
  id: l1ChainId,
  name: (import.meta.env.VITE_L1_CHAIN_NAME as string) || `L1-${l1ChainId}`,
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [l1RpcUrl] },
  },
});

export const prividiumChain = defineChain({
  id: parseInt(import.meta.env.VITE_CHAIN_ID),
  name: import.meta.env.VITE_CHAIN_NAME,
  nativeCurrency: {
    name: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL,
    symbol: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL,
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL],
    },
    public: {
      http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL],
    },
  },
  testnet: true,
});

export function createWagmiConfig(walletRpcUrl?: string) {
  const rpcUrl = walletRpcUrl || import.meta.env.VITE_PRIVIDIUM_RPC_URL;

  return createConfig({
    chains: [prividiumChain, l1Chain],
    connectors: [metaMask()],
    transports: {
      [prividiumChain.id]: http(rpcUrl),
      [l1Chain.id]: http(import.meta.env.VITE_L1_RPC_URL),
    },
  });
}

export const config = createWagmiConfig();
