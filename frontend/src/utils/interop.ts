import type { ViemSdk, ViemClient } from "@matterlabs/zksync-js/viem";
import { type Hex, type Address, keccak256 } from "viem";
import { L2_INTEROP_CENTER_ADDRESS } from "./constants";
import { getFinalizedTxs, addFinalizedTx, getHashes } from "./storage";
import type { PendingTxnState, FinalizedTxnState } from "./types";

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

  const candidates: PendingTxnState[] = [];
  const seen = new Set<Hex>();
  const now = new Date().toISOString();

  for (const item of deposits ?? []) {
    if (item.withdrawHash && !seen.has(item.withdrawHash)) {
      seen.add(item.withdrawHash);
      candidates.push({
        hash: item.withdrawHash,
        addedAt: now,
        status: "PENDING",
        action: "Deposit",
        amount: item.bundleAmount,
        accountAddress,
      });
    }
    if (!seen.has(item.bundleHash)) {
      seen.add(item.bundleHash);
      candidates.push({
        hash: item.bundleHash,
        addedAt: now,
        status: "PENDING",
        action: "Deposit",
        amount: item.bundleAmount,
        accountAddress,
      });
    }
  }

  for (const item of borrows ?? []) {
    if (!seen.has(item.bundleHash)) {
      seen.add(item.bundleHash);
      candidates.push({
        hash: item.bundleHash,
        addedAt: now,
        status: "PENDING",
        action: "Withdraw",
        amount: item.bundleAmount,
        accountAddress,
      });
    }
  }

  const nextPending: PendingTxnState[] = [];
  const nextFinalized: FinalizedTxnState[] = [...localFinalized];

  for (const tx of candidates) {
    const knownFinalized = finalizedByHash.get(tx.hash);
    if (knownFinalized) {
      continue;
    }

    const status = await resolvePendingStatus(tx.hash, sdk, sdkClient);
    if ("finalized" in status && status.finalized) {
      const finalizedEntry: FinalizedTxnState = {
        l2TxHash: tx.hash,
        l1FinalizeTxHash: (status.l1FinalizeTxHash ?? "0x000") as Hex,
        finalizedAt: new Date().toISOString(),
        action: tx.action,
        amount: tx.amount,
        accountAddress,
      };
      addFinalizedTx(accountAddress, finalizedEntry);
      nextFinalized.unshift(finalizedEntry);
    } else {
      nextPending.push({
        ...tx,
        status: status.status,
        readyToFinalize: status.readyToFinalize,
        finalizeKind: status.finalizeKind,
        updatedAt: new Date().toISOString(),
      });
    }
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

  return {
    chainId: BigInt(import.meta.env.VITE_CHAIN_ID),
    l2BatchNumber: BigInt(proof.batchNumber),
    l2MessageIndex: BigInt(proof.id),
    l2Sender: sender,
    l2TxNumberInBatch: Number(log.tx_number_in_block),
    message,
    merkleProof: proof.proof as Hex[],
  };
};
