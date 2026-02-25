import type { Address, Hex } from "viem";

export type HashItem = {
  bundleHash: Hex;
  bundleAmount: string;
  withdrawHash?: Hex;
};

export interface UserProfileWallet {
  createdAt: string;
  updatedAt: string;
  userId: string;
  walletAddress: Address;
}

type AuthorizeTransactionParams =
  | {
      walletAddress: Address;
      toAddress: Address;
      nonce: number;
      calldata: Hex;
      value: bigint;
    }
  | {
      walletAddress: Address;
      toAddress: Address;
      nonce: number;
      calldata: Hex;
      value?: never;
    }
  | {
      walletAddress: Address;
      toAddress: Address;
      nonce: number;
      calldata?: never;
      value: bigint;
    };

export type AuthorizeTxFn = (
  params: AuthorizeTransactionParams,
) => Promise<{ message: string; activeUntil: string }>;

export type ShadowAccountOp = {
  target: Address;
  value: bigint;
  data: Hex;
};

export interface Metadata {
  action: string;
  amount: string;
}

export interface FinalizedTxnState extends Metadata {
  l2TxHash: Hex;
  l1FinalizeTxHash: Hex;
  finalizedAt: string;
  accountAddress: Address;
}

export interface PendingTxnState extends Metadata {
  hash: Hex;
  addedAt: string;
  status: string;
  lastFinalizeHash?: Hex;
  updatedAt?: string;
  accountAddress: Address;
}
