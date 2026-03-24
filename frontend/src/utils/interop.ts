import type { ViemSdk, ViemClient } from "@matterlabs/zksync-js/viem";
import { type Hex, type Address, keccak256 } from "viem";
import { L2_INTEROP_CENTER_ADDRESS } from "./constants";
import { getFinalizedTxs, addFinalizedTx, getHashes } from "./storage";
import type { PendingTxnState, FinalizedTxnState } from "./types";

function getNumericLike(
  source: Record<string, unknown> | undefined,
  keys: string[],
): bigint | number | string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value as bigint | number | string;
  }
  return undefined;
}

function toBigIntStrict(
  value: bigint | number | string | undefined,
  label: string,
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} is not an integer: ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (value.trim() === "") {
      throw new Error(`${label} is empty`);
    }
    return BigInt(value);
  }
  throw new Error(`${label} is missing`);
}

function toNumberStrict(
  value: bigint | number | string | undefined,
  label: string,
): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} is not an integer: ${value}`);
    }
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new Error(`${label} is not an integer: ${value}`);
    }
    return parsed;
  }
  throw new Error(`${label} is missing`);
}

export async function updateTxStatuses(
  accountAddress: Address,
  sdk: ViemSdk,
  sdkClient: ViemClient,
) {
  const { deposits, borrows } = getHashes(accountAddress);
  const localFinalized = getFinalizedTxs(accountAddress);
  const finalizedByHash = new Map(
    localFinalized.map((tx) => [tx.l2TxHash, tx]),
  );

  const nextPending: PendingTxnState[] = [];
  const nextFinalized: FinalizedTxnState[] = [];
  const now = new Date().toISOString();
  const seen = new Set<Hex>();

  async function resolveOrStoreFinalized(
    hash: Hex,
    action: "Deposit" | "Withdraw",
    amount: string,
  ) {
    const knownFinalized = finalizedByHash.get(hash);
    if (knownFinalized) return { finalizedEntry: knownFinalized };

    const status = await resolvePendingStatus(hash, sdk, sdkClient);
    if ("finalized" in status && status.finalized) {
      const finalizedEntry: FinalizedTxnState = {
        l2TxHash: hash,
        l1FinalizeTxHash: (status.l1FinalizeTxHash ?? "0x000") as Hex,
        finalizedAt: new Date().toISOString(),
        action,
        amount,
        accountAddress,
      };
      addFinalizedTx(accountAddress, finalizedEntry);
      finalizedByHash.set(hash, finalizedEntry);
      return { finalizedEntry };
    }

    return { status };
  }

  for (const item of deposits ?? []) {
    const bundleResult = await resolveOrStoreFinalized(
      item.bundleHash,
      "Deposit",
      item.bundleAmount,
    );
    const withdrawResult = item.withdrawHash
      ? await resolveOrStoreFinalized(item.withdrawHash, "Deposit", item.bundleAmount)
      : undefined;

    const bundleFinalized = bundleResult.finalizedEntry;
    const withdrawFinalized = withdrawResult?.finalizedEntry;

    if (item.withdrawHash && !withdrawFinalized) {
      const status = withdrawResult?.status;
      if (!status) continue;
      nextPending.push({
        hash: item.withdrawHash,
        displayHash: item.withdrawHash,
        addedAt: now,
        status: status.status,
        action: "Deposit",
        amount: item.bundleAmount,
        accountAddress,
        readyToFinalize: status.readyToFinalize,
        finalizeKind: status.finalizeKind,
        finalizeLabel: "Finalize withdraw",
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    if (!bundleFinalized) {
      const status = bundleResult.status;
      if (!status) continue;
      nextPending.push({
        hash: item.bundleHash,
        displayHash: item.bundleHash,
        addedAt: now,
        status: status.status,
        action: "Deposit",
        amount: item.bundleAmount,
        accountAddress,
        readyToFinalize: status.readyToFinalize,
        finalizeKind: status.finalizeKind,
        finalizeLabel: "Finalize bundle",
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    nextFinalized.unshift({
      l2TxHash: item.bundleHash,
      l1FinalizeTxHash: bundleFinalized.l1FinalizeTxHash,
      finalizedAt:
        withdrawFinalized && withdrawFinalized.finalizedAt > bundleFinalized.finalizedAt
          ? withdrawFinalized.finalizedAt
          : bundleFinalized.finalizedAt,
      action: "Deposit",
      amount: item.bundleAmount,
      accountAddress,
    });
    seen.add(item.bundleHash);
    if (item.withdrawHash) seen.add(item.withdrawHash);
  }

  for (const item of borrows ?? []) {
    if (seen.has(item.bundleHash)) continue;
    const result = await resolveOrStoreFinalized(item.bundleHash, "Withdraw", item.bundleAmount);
    if (result.finalizedEntry) {
      nextFinalized.unshift(result.finalizedEntry);
      continue;
    }

    const status = result.status;
    if (!status) continue;
    nextPending.push({
      hash: item.bundleHash,
      displayHash: item.bundleHash,
      addedAt: now,
      status: status.status,
      action: "Withdraw",
      amount: item.bundleAmount,
      accountAddress,
      readyToFinalize: status.readyToFinalize,
      finalizeKind: status.finalizeKind,
      updatedAt: new Date().toISOString(),
    });
  }

  return { nextPending, nextFinalized };
}

const resolvePendingStatus = async (
  hash: Hex,
  sdk: ViemSdk,
  sdkClient: ViemClient,
) => {
  try {
    const receipt = await sdkClient.zks.getReceiptWithL2ToL1(hash);
    if (!receipt || receipt.status !== "0x1") {
      return { status: "L2_PENDING", readyToFinalize: false as const };
    }

    // Check interop readiness first so bundle txs do not get stuck as generic pending.
    const logIndex = findInteropLogIndex(receipt);
    if (logIndex >= 0) {
      try {
        await sdkClient.zks.getL2ToL1LogProof(hash, logIndex);
        return {
          status: "READY_TO_FINALIZE",
          readyToFinalize: true as const,
          finalizeKind: "interop" as const,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const msg = String(error?.message ?? "").toLowerCase();
        if (
          msg.includes("not been executed yet") ||
          msg.includes("proof not available")
        ) {
          return {
            status: "PENDING_PROOF",
            readyToFinalize: false as const,
            finalizeKind: "interop" as const,
          };
        }
        return {
          status: "PENDING",
          readyToFinalize: false as const,
          finalizeKind: "interop" as const,
        };
      }
    }

    const status = await sdk.withdrawals.status(hash);
    if (status.phase === "FINALIZED") {
      return {
        status: "FINALIZED",
        readyToFinalize: false as const,
        finalized: true as const,
        l1FinalizeTxHash: status.l1FinalizeTxHash,
      };
    }

    if (status.phase === "READY_TO_FINALIZE") {
      return {
        status: status.phase,
        readyToFinalize: true as const,
        finalizeKind: "withdrawal" as const,
      };
    }

    if (status.phase === "UNKNOWN") {
      return { status: "PENDING", readyToFinalize: false as const };
    }

    return {
      status: status.phase,
      readyToFinalize: false as const,
      finalizeKind: "withdrawal" as const,
    };
  } catch {
    return { status: "PENDING", readyToFinalize: false as const };
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const findInteropLogIndex = (receipt: any) => {
  const l2InteropCenter = L2_INTEROP_CENTER_ADDRESS.toLowerCase().replace(
    "0x",
    "",
  );
  const logs = receipt?.l2ToL1Logs ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return logs.findIndex((entry: any) => {
    const key = String(entry?.key ?? "")
      .toLowerCase()
      .replace("0x", "");
    return key.endsWith(l2InteropCenter);
  });
};

export const getInteropFinalizeParams = async (
  txHash: Hex,
  sdkClient: ViemClient,
) => {
  const receipt = await sdkClient.zks.getReceiptWithL2ToL1(txHash);
  if (!receipt || receipt.status !== "0x1") {
    throw new Error("L2 transaction not successful");
  }

  const logIndex = findInteropLogIndex(receipt);
  if (logIndex < 0) {
    throw new Error("No interop log found");
  }

  const proof = await sdkClient.zks.getL2ToL1LogProof(txHash, logIndex);
  const log = receipt.l2ToL1Logs?.[logIndex];
  if (!proof || !log) {
    throw new Error("Interop proof is not available");
  }

  const systemMessenger = "0x0000000000000000000000000000000000008008";
  let sender = log.sender as Address;
  if (
    sender?.toLowerCase() === systemMessenger &&
    String(log.key).length >= 66
  ) {
    sender = `0x${String(log.key).slice(-40)}` as Address;
  }

  const candidateLogs =
    receipt.logs?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entry: any) => entry.data && entry.data.length > 130,
    ) ?? [];
  let message: Hex | null = null;

  if (log.value && candidateLogs.length > 0) {
    const expectedHash = String(log.value).toLowerCase();
    for (const entry of candidateLogs) {
      const candidate = `0x${String(entry.data).slice(130)}` as Hex;
      if (keccak256(candidate).toLowerCase() === expectedHash) {
        message = candidate;
        break;
      }
    }
  }

  if (!message) {
    const messageLog =
      candidateLogs.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entry: any) =>
          String(entry.address).toLowerCase() ===
          L2_INTEROP_CENTER_ADDRESS.toLowerCase(),
      ) || candidateLogs[0];
    if (messageLog) {
      message = `0x${String(messageLog.data).slice(130)}` as Hex;
    }
  }

  if (!message || message === "0x") {
    throw new Error("Could not extract interop message");
  }

  const proofRecord = proof as Record<string, unknown>;
  const logRecord = log as Record<string, unknown>;

  const l2BatchNumber = toBigIntStrict(
    getNumericLike(proofRecord, ["batchNumber", "l2BatchNumber", "batch_number"]),
    "proof.batchNumber",
  );
  const l2MessageIndex = toBigIntStrict(
    getNumericLike(proofRecord, ["id", "l2MessageIndex", "messageIndex", "index"]),
    "proof.id",
  );
  const l2TxNumberInBatch = toNumberStrict(
    getNumericLike(logRecord, [
      "transactionIndex",
      "txNumberInBlock",
      "tx_number_in_block",
      "l2TxNumberInBatch",
    ]),
    "log.transactionIndex",
  );

  return {
    chainId: BigInt(import.meta.env.VITE_CHAIN_ID),
    l2BatchNumber,
    l2MessageIndex,
    l2Sender: sender,
    l2TxNumberInBatch,
    message,
    merkleProof: proof.proof as Hex[],
  };
};
