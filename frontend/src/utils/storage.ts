import type { Address, Hex } from "viem";
import type { FinalizedTxnState, HashItem } from "./types";

const depositsKeyBase = "latestAaveZKsyncDeposits-";
const borrowsKeyBase = "latestAaveZKsyncBorrows-";
const finalizedKeyBase = "latestAaveInteropFinalized-";

export function getHashes(address: `0x${string}`): {
  deposits: HashItem[] | undefined;
  borrows: HashItem[] | undefined;
} {
  const depositsKey = `${depositsKeyBase}${address}`;
  const borrowsKey = `${borrowsKeyBase}${address}`;
  const rawDepositsValue = localStorage.getItem(depositsKey);
  const rawBorrowsValue = localStorage.getItem(borrowsKey);

  let deposits;
  let borrows;

  if (rawDepositsValue) {
    deposits = getParsedData(rawDepositsValue);
  }

  if (rawBorrowsValue) {
    borrows = getParsedData(rawBorrowsValue);
  }

  return { deposits, borrows };
}

function getParsedData(rawValue: string) {
  const parsed = JSON.parse(rawValue) as string[];

  const items = parsed.map((item) => {
    const [bundleHash, bundleAmount, withdrawHash] = item.split(":");
    if (!withdrawHash) {
      return {
        bundleHash: bundleHash as Hex,
        bundleAmount: bundleAmount,
      };
    }
    return {
      bundleHash: bundleHash as Hex,
      bundleAmount: bundleAmount,
      withdrawHash: withdrawHash as Hex,
    };
  });
  return items;
}

export function storeDepositETHHashes(
  withdrawHash: Hex,
  bundleHash: Hex,
  address: Address,
  depositAmount: bigint,
): void {
  const key = `${depositsKeyBase}${address}`;
  storeHashes(key, bundleHash, depositAmount, withdrawHash);
}

export function storeWithdrawETHHash(
  bundleHash: Hex,
  address: Address,
  withdrawAmount: bigint,
): void {
  const key = `${borrowsKeyBase}${address}`;
  storeHashes(key, bundleHash, withdrawAmount);
}

function storeHashes(
  key: string,
  bundleHash: Hex,
  bundleAmount: bigint,
  withdrawHash?: Hex,
): void {
  const stored = localStorage.getItem(key);
  let hashes: string[] = [];

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        hashes = parsed;
      }
    } catch {
      hashes = [];
    }
  }

  const baseHashInfo = `${bundleHash}:${bundleAmount.toString()}`;

  if (!withdrawHash) {
    hashes.push(baseHashInfo);
  } else {
    hashes.push(`${baseHashInfo}:${withdrawHash}`);
  }

  localStorage.setItem(key, JSON.stringify(hashes));
}

export function getFinalizedTxs(address: Address): FinalizedTxnState[] {
  const key = `${finalizedKeyBase}${address}`;
  const stored = localStorage.getItem(key);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as FinalizedTxnState[]) : [];
  } catch {
    return [];
  }
}

export function addFinalizedTx(address: Address, tx: FinalizedTxnState): void {
  const key = `${finalizedKeyBase}${address}`;
  const existing = getFinalizedTxs(address);
  const withoutDup = existing.filter((item) => item.l2TxHash !== tx.l2TxHash);
  withoutDup.unshift(tx);
  localStorage.setItem(key, JSON.stringify(withoutDup.slice(0, 100)));
}
