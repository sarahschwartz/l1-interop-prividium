import { createViemClient, createViemSdk } from "@matterlabs/zksync-js/viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const l1ChainId = 31337;
const l1RpcUrl = "http://localhost:5010";
const l2RpcUrl = "http://127.0.0.1:24101/rpc";

const l1Chain = defineChain({
  id: l1ChainId,
  name: "Local L1",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [l1RpcUrl] },
  },
});

const localPrividium = defineChain({
  id: 6565,
  name: "Local Prividium",
  network: "localPrividium",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [l2RpcUrl] } },
});

const l1 = createPublicClient({ transport: http(l1RpcUrl) });
const l2 = createPublicClient({ transport: http(l2RpcUrl) });
const l1Wallet = createWalletClient({
  chain: l1Chain,
  account,
  transport: http(l1RpcUrl),
});
const l2Wallet = createWalletClient({
  chain: localPrividium,
  account,
  transport: http(l2RpcUrl),
});

const client = createViemClient({ l1, l2, l1Wallet, l2Wallet });
const sdk = createViemSdk(client);

const { bridgehub } = await sdk.contracts.addresses();
console.log("bridgehub address: ", bridgehub);
