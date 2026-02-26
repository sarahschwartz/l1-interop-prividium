import { ETH_ADDRESS } from "@matterlabs/zksync-js/core";
import type { ViemClient, ViemSdk } from "@matterlabs/zksync-js/viem";
import {
  encodeFunctionData,
  type Abi,
  type Address,
} from "viem";

import L2_INTEROP_CENTER_JSON from "./abis/L2InteropCenter.json";
import MOCK_AAVE_JSON from "./abis/MockAave.json";
import type { ShadowAccountOp } from "./types";
import type { PrividiumChain } from "prividium";
import {
  L2_CHAIN_ID,
  L2_INTEROP_CENTER_ADDRESS,
  MOCK_AAVE_CONTRACT_ADDRESS,
} from "./constants";
import { writeContract } from "@wagmi/core";
import { config } from "./wagmi";

const L2_GAS_LIMIT = 300000n;
const L2_GAS_PER_PUBDATA = 800n;
const PRIVIDIUM_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID);
const PRIVIDIUM_CHAIN_ID_HEX = `0x${PRIVIDIUM_CHAIN_ID.toString(16)}`;

type WalletProvider = {
  request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
};

type ContractWriteTx = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value: bigint;
};

async function ensureWalletOnPrividiumChain() {
  const provider = (window as Window & { ethereum?: WalletProvider }).ethereum;
  if (!provider) throw new Error("wallet provider not found");

  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId === PRIVIDIUM_CHAIN_ID_HEX) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: PRIVIDIUM_CHAIN_ID_HEX }],
    });
  } catch (error) {
    const switchError = error as { code?: number };
    if (switchError.code !== 4902) {
      throw new Error("please switch your wallet to the Prividium network");
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: PRIVIDIUM_CHAIN_ID_HEX,
          chainName: import.meta.env.VITE_CHAIN_NAME || `Prividium-${PRIVIDIUM_CHAIN_ID}`,
          nativeCurrency: {
            name: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL || "ETH",
            symbol: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL || "ETH",
            decimals: 18,
          },
          rpcUrls: [import.meta.env.VITE_PRIVIDIUM_RPC_URL],
        },
      ],
    });

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: PRIVIDIUM_CHAIN_ID_HEX }],
    });
  }

  const finalChainId = await provider.request({ method: "eth_chainId" });
  if (finalChainId !== PRIVIDIUM_CHAIN_ID_HEX) {
    throw new Error("please switch your wallet to the Prividium network");
  }
}

export async function sendAuthorizedTx({
  txnType,
  amount,
  prividium,
  sdk,
  sdkClient,
  shadowAccount,
  accountAddress
}: {
  txnType: "depositToAaveBundle" | "withdrawFromAaveBundle" | "withdrawToL1";
  amount: bigint;
  prividium: PrividiumChain;
  sdk: ViemSdk;
  sdkClient: ViemClient;
  shadowAccount: Address;
  accountAddress: Address;
}) {
  await ensureWalletOnPrividiumChain();

  let tx: ContractWriteTx | undefined;

  if (txnType === "depositToAaveBundle") {
    tx = await getDepositBundle(shadowAccount, amount);
  } else if (txnType === "withdrawFromAaveBundle") {
    tx = await getWithdrawBundle(
      amount,
      shadowAccount,
      accountAddress,
      sdk,
      sdkClient,
    );
  } else {
    const prepare = await prepareWithdraw(amount, sdk, shadowAccount);
    if (!prepare) throw new Error("unable to prepare");
    tx = prepare;
  }

  if (!tx) throw new Error("failed to prepare transaction");

  const calldata = encodeFunctionData({
    abi: tx.abi,
    functionName: tx.functionName,
    args: tx.args,
  });

  const rawTx = {
    to: tx.address,
    value: tx.value,
    data: calldata,
  };

  console.log("getting nonce...");
  const nonce = await sdkClient.l2.getTransactionCount({ address: accountAddress });
  console.log("nonce:", nonce);
  const gas = await sdkClient.l2.estimateGas({
    account: accountAddress,
    ...rawTx,
    nonce,
  });
  console.log("gas:", gas);
  const gasPrice = await sdkClient.l2.getGasPrice();
  console.log("gas price:", gasPrice);

  const finalContractTx = {
    ...tx,
    account: accountAddress,
    nonce,
    gas,
    gasPrice,
  };

  console.log("tx:", finalContractTx);

  console.log("going to authorize");
  await prividium.authorizeTransaction({
    walletAddress: accountAddress,
    toAddress: tx.address,
    nonce,
    calldata,
    value: tx.value,
  });

  console.log("authorized");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = await writeContract(config, finalContractTx as any);
  console.log("HASH:", hash);
  await sdkClient.l2.waitForTransactionReceipt({ hash });

  return hash;
}

export async function getShadowAccount(
  client: ViemClient,
  address: `0x${string}`,
) {
  const shadowAccount = await client.l2.readContract({
    address: L2_INTEROP_CENTER_ADDRESS,
    abi: L2_INTEROP_CENTER_JSON.abi as Abi,
    functionName: "l1ShadowAccount",
    args: [address],
  });
  return shadowAccount as `0x${string}`;
}
export async function getAaveBalance(
  client: ViemClient,
  shadowAccountAddress: Address,
) {
  const balance = await client.l1.readContract({
    address: MOCK_AAVE_CONTRACT_ADDRESS,
    abi: MOCK_AAVE_JSON.abi as Abi,
    functionName: "balances",
    args: [shadowAccountAddress],
  });
  return balance as bigint;
}

export async function getDepositBundle(
  shadowAccount: `0x${string}`,
  amount: bigint,
) : Promise<ContractWriteTx> {
  const depositETHData = encodeFunctionData({
    abi: MOCK_AAVE_JSON.abi as Abi,
    functionName: "depositETH",
    args: [shadowAccount],
  });

  const ops: ShadowAccountOp[] = [
    {
      target: MOCK_AAVE_CONTRACT_ADDRESS,
      value: amount,
      data: depositETHData,
    },
  ];

  return {
    address: L2_INTEROP_CENTER_ADDRESS as Address,
    abi: L2_INTEROP_CENTER_JSON.abi as Abi,
    functionName: "sendBundleToL1",
    args: [ops],
    value: 0n,
  };
}
export async function getWithdrawBundle(
  amount: bigint,
  shadowAccount: Address,
  l2Receiver: Address,
  sdk: ViemSdk,
  client: ViemClient,
) : Promise<ContractWriteTx> {
  // Calculate mintValue for L2 gas
  const gasPrice = await client.l1.getGasPrice();
  const bridgehub = await sdk.contracts.bridgehub();
  const baseCost = (await client.l1.readContract({
    address: bridgehub.address,
    abi: bridgehub.abi,
    functionName: "l2TransactionBaseCost",
    args: [L2_CHAIN_ID, gasPrice, L2_GAS_LIMIT, L2_GAS_PER_PUBDATA],
  })) as bigint;
  const mintValue = baseCost + (baseCost * 20n) / 100n; // 20% buffer

  // Step 1: Withdraw from Aave
  const withdrawData = encodeFunctionData({
    abi: MOCK_AAVE_JSON.abi as Abi,
    functionName: "withdraw",
    args: [
      shadowAccount, // Recipient (gets WETH)
      amount, // Amount to withdraw
    ],
  });

  // Step 3: Bridge ETH back to L2
  // mintValue = base fee; total value sent = l2Value + mintValue
  const totalBridgeValue = mintValue + amount;

  const bridgeData = encodeFunctionData({
    abi: bridgehub.abi,
    functionName: "requestL2TransactionDirect",
    args: [
      {
        chainId: L2_CHAIN_ID,
        mintValue: totalBridgeValue, // Exact fee + l2Value
        l2Contract: l2Receiver,
        l2Value: amount, // Amount to send to L2 contract as msg.value
        l2Calldata: "0x",
        l2GasLimit: L2_GAS_LIMIT,
        l2GasPerPubdataByteLimit: L2_GAS_PER_PUBDATA,
        factoryDeps: [],
        refundRecipient: l2Receiver,
      },
    ],
  });

  // Create the operation bundle
  const ops = [
    {
      target: MOCK_AAVE_CONTRACT_ADDRESS,
      value: 0n,
      data: withdrawData, // Withdraw ETH from pool
    },
    {
      target: bridgehub.address,
      value: totalBridgeValue, // Total ETH for bridge (gas + amount)
      data: bridgeData,
    },
  ];

  return {
    address: L2_INTEROP_CENTER_ADDRESS as Address,
    abi: L2_INTEROP_CENTER_JSON.abi as Abi,
    functionName: "sendBundleToL1",
    args: [ops],
    value: 0n,
  };
}

export async function prepareWithdraw(
  amount: bigint,
  sdk: ViemSdk,
  shadowAccount: Address,
) : Promise<ContractWriteTx | undefined> {
  try {
    const params = {
      token: ETH_ADDRESS,
      amount,
      to: shadowAccount,
    } as const;

    console.log("preparing withdraw txn...");
    const prepared = await sdk.withdrawals.prepare(params);
    console.log("prepared:", prepared);
    const tx = prepared.steps[0].tx;

    return {
      address: tx.address as Address,
      abi: tx.abi as Abi,
      functionName: tx.functionName as string,
      args: tx.args as readonly unknown[],
      value: tx.value || 0n,
    };
  } catch (e) {
    alert("something went wrong");
    console.log("ERROR:", e);
    return;
  }
}
