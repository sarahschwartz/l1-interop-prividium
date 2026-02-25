import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
  type EIP1193Provider,
  type PublicClient,
} from "viem";
import { createViemClient, createViemSdk } from "@matterlabs/zksync-js/viem";
import { prividiumChain } from "../utils/wagmi";
import type { Connector } from "wagmi";

export function useBridgeSdk(
  rpcClient: PublicClient,
  connector: Connector,
  address: Address
) {
  const l1ChainId = import.meta.env.VITE_L1_CHAIN_ID || 31337;
  const l1RpcUrl = import.meta.env.VITE_L1_RPC_URL || " http://localhost:5010";

  const l1Chain = defineChain({
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

  const l1PublicClient = l1Chain
    ? createPublicClient({
        chain: l1Chain,
        transport: http(),
      })
    : null;

  async function getZKsyncSDK() {

    const provider = (await connector.getProvider()) as EIP1193Provider;
    const transport = custom(provider);

    const l1Wallet = createWalletClient({
      account: address,
      chain: l1Chain,
      transport,
    });

    const DEFAULT_L1_RPC = import.meta.env.VITE_L1_RPC_URL;

    const l1Client = createPublicClient({
      chain: l1Chain,
      transport: http(DEFAULT_L1_RPC),
    });

    const l2Wallet = createWalletClient({
      account: address,
      chain: prividiumChain,
      transport,
    });

    const client = createViemClient({
      l1: l1Client,
      l2: rpcClient,
      l1Wallet: l1Wallet,
      l2Wallet: l2Wallet,
    });
    const sdk = createViemSdk(client);
    return { sdk, sdkClient: client };
  }

  return {
    getZKsyncSDK,
    l1PublicClient,
  };
}
