import { useCallback, useEffect, useState } from "react";
import { type Address, formatEther, keccak256, type Hex } from "viem";
import {
  type Connector,
} from "wagmi";
import "../earn.css";
import type { FinalizedTxnState, PendingTxnState } from "../utils/types";
import type { EIP1193Provider } from "viem";

import { ActivityTab } from "./Activity";
import { Deposit } from "./Deposit";
import { Withdraw } from "./Withdraw";
import { useBridgeSdk } from "../hooks/useBridgeSdk";
import type { ViemClient, ViemSdk } from "@matterlabs/zksync-js/viem";
import { getAaveBalance, getShadowAccount } from "../utils/txns";
import {
  addFinalizedTx,
  getFinalizedTxs,
  getHashes,
} from "../utils/storage";
import L1_INTEROP_HANDLER_JSON from "../utils/abis/L1InteropHandler.json";
import { L1_INTEROP_HANDLER_ADDRESS, L2_INTEROP_CENTER_ADDRESS } from "../utils/constants";

type EarnSubTab = "deposit" | "withdraw";

interface Props {
  balance: bigint;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any;
  connector: Connector;
  accountAddress: Address;
}

export function EarnTab({
  balance,
  rpcClient,
  connector,
  accountAddress,
}: Props) {
  const [pendingTxns, setPendingTxns] = useState<PendingTxnState[]>([]);
  const [finalizedTxns, setFinalizedTxns] = useState<FinalizedTxnState[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<EarnSubTab>("deposit");
  const [sdk, setSDK] = useState<ViemSdk>();
  const [sdkClient, setSdkClient] = useState<ViemClient>();
  const [shadowAccount, setShadowAccount] = useState<Address>();
  const [aaveBalance, setAaveBalance] = useState<bigint>(0n);
  const [finalizingHash, setFinalizingHash] = useState<Hex>();
  
  const { getZKsyncSDK } = useBridgeSdk(rpcClient, connector, accountAddress);

  async function fetchAaveBalance() {
    if(!sdkClient || !shadowAccount) return;
    const bal = await getAaveBalance(sdkClient, shadowAccount);
    setAaveBalance(bal);
  }

   useEffect(() => {
    async function updateAaveBal() {
      await fetchAaveBalance();
    }

    updateAaveBal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadowAccount])

   useEffect(() => {
    async function updateShadowAccount() {
      if(!sdkClient) return;
      const shadow = await getShadowAccount(sdkClient, accountAddress);
      setShadowAccount(shadow);
    }

    updateShadowAccount();
  }, [sdkClient, accountAddress])

  useEffect(() => {
    async function setupSdk() {
      const { sdk: viemSDK, sdkClient: viemClient } = await getZKsyncSDK();
      setSDK(viemSDK);
      setSdkClient(viemClient);
    }

    setupSdk();
  }, [accountAddress]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findInteropLogIndex = useCallback((receipt: any) => {
    const l2InteropCenter = L2_INTEROP_CENTER_ADDRESS.toLowerCase().replace("0x", "");
    const logs = receipt?.l2ToL1Logs ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logs.findIndex((entry: any) => {
      const key = String(entry?.key ?? "").toLowerCase().replace("0x", "");
      return key.endsWith(l2InteropCenter);
    });
  }, []);

  const getInteropFinalizeParams = useCallback(async (txHash: Hex) => {
    if (!sdkClient) throw new Error("SDK client is not ready");
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
    if (sender?.toLowerCase() === systemMessenger && String(log.key).length >= 66) {
      sender = `0x${String(log.key).slice(-40)}` as Address;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidateLogs = receipt.logs?.filter((entry: any) => entry.data && entry.data.length > 130) ?? [];
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candidateLogs.find((entry: any) => String(entry.address).toLowerCase() === L2_INTEROP_CENTER_ADDRESS.toLowerCase()) ||
        candidateLogs[0];
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
  }, [findInteropLogIndex, sdkClient]);

  const resolvePendingStatus = useCallback(async (hash: Hex) => {
    if (!sdk || !sdkClient) return { status: "UNKNOWN", readyToFinalize: false as const };

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
          return { status: "READY_TO_FINALIZE", readyToFinalize: true as const, finalizeKind: "interop" as const };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          const msg = String(error?.message ?? "").toLowerCase();
          if (msg.includes("not been executed yet") || msg.includes("proof not available")) {
            return { status: "PENDING_PROOF", readyToFinalize: false as const, finalizeKind: "interop" as const };
          }
          return { status: "PENDING", readyToFinalize: false as const, finalizeKind: "interop" as const };
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

      return { status: status.phase, readyToFinalize: false as const, finalizeKind: "withdrawal" as const };
    } catch {
      return { status: "PENDING", readyToFinalize: false as const };
    }
  }, [findInteropLogIndex, sdk, sdkClient]);

  const syncTxStatuses = useCallback(async () => {
    if (!sdk || !sdkClient || !accountAddress) return;

    const { deposits, borrows } = getHashes(accountAddress);
    const localFinalized = getFinalizedTxs(accountAddress);
    const finalizedByHash = new Map(localFinalized.map((tx) => [tx.l2TxHash, tx]));

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

      const status = await resolvePendingStatus(tx.hash);
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

    setPendingTxns(nextPending);
    setFinalizedTxns(nextFinalized);
  }, [accountAddress, resolvePendingStatus, sdk, sdkClient]);

  useEffect(() => {
    if (!sdk || !sdkClient || !accountAddress) return;

    void syncTxStatuses();
    const intervalId = window.setInterval(() => {
      void syncTxStatuses();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [accountAddress, sdk, sdkClient, syncTxStatuses]);

  const switchToL1 = useCallback(async () => {
    const provider = (await connector.getProvider()) as EIP1193Provider;
    const l1ChainId = Number(import.meta.env.VITE_L1_CHAIN_ID || 31337);
    const l1ChainIdHex = `0x${l1ChainId.toString(16)}`;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: l1ChainIdHex }],
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error?.code !== 4902) throw error;

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: l1ChainIdHex,
            chainName: import.meta.env.VITE_L1_CHAIN_NAME || `L1-${l1ChainId}`,
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [import.meta.env.VITE_L1_RPC_URL],
            blockExplorerUrls: import.meta.env.VITE_BLOCK_EXPLORER_URL
              ? [import.meta.env.VITE_BLOCK_EXPLORER_URL]
              : [],
          },
        ],
      });
    }
  }, [connector]);

  const finalizePendingTx = useCallback(async (tx: PendingTxnState) => {
    if (!sdk || !sdkClient) return;

    setFinalizingHash(tx.hash);
    try {
      await switchToL1();

      let l1FinalizeTxHash: Hex = "0x000";
      if (tx.finalizeKind === "withdrawal") {
        const result = await sdk.withdrawals.finalize(tx.hash);
        l1FinalizeTxHash = (result.receipt?.transactionHash ??
          result.status.l1FinalizeTxHash ??
          "0x000") as Hex;
      } else if (tx.finalizeKind === "interop") {
        const params = await getInteropFinalizeParams(tx.hash);
        const baseGasPrice = await sdkClient.l1.getGasPrice();
        const bumpedGasPrice = (baseGasPrice * 12n) / 10n;
        l1FinalizeTxHash = await sdkClient.l1Wallet.writeContract({
          address: L1_INTEROP_HANDLER_ADDRESS,
          abi: L1_INTEROP_HANDLER_JSON.abi,
          functionName: "receiveInteropFromL2",
          args: [params],
          gasPrice: bumpedGasPrice,
        });

        await sdkClient.l1.waitForTransactionReceipt({
          hash: l1FinalizeTxHash,
          timeout: 300_000,
        });
      } else {
        throw new Error("Transaction is not ready to finalize");
      }

      addFinalizedTx(accountAddress, {
        l2TxHash: tx.hash,
        l1FinalizeTxHash,
        finalizedAt: new Date().toISOString(),
        action: tx.action,
        amount: tx.amount,
        accountAddress,
      });

      await syncTxStatuses();
    } catch (error) {
      console.error("Error finalizing transaction:", error);
    } finally {
      setFinalizingHash(undefined);
    }
  }, [accountAddress, getInteropFinalizeParams, sdk, sdkClient, switchToL1, syncTxStatuses]);

  return (
    <div id="earn-tab">
      <div className="tab-header">
        <div id="earn-title" className="tab-title">
          Earn Interest with Aave
        </div>
      </div>
      <p id="earn-subtitle" className="tab-description">
        Deposit your ETH to earn interest through Aave lending protocol on Ethereum Layer 1.
      </p>

      {shadowAccount && (
        <div id="aave-balance-section" className="aave-info">
          <div className="aave-info-row">
            <span id="earn-shadow" className="info-label">
              Shadow Account:
            </span>
            <span className="info-value">
                <code id="shadowAccountDisplay">{shadowAccount}</code>
            </span>
          </div>
          <div className="aave-info-row">
            <span id="earn-deposits" className="info-label">
              Aave Deposits
              <button
                id="refreshAaveBalanceBtn"
                className="refresh-btn-inline"
                onClick={fetchAaveBalance}
              >
                Refresh
              </button>
            </span>
            <span className="info-value">
              <span id="aaveBalanceDisplay">
                {aaveBalance ? formatEther(aaveBalance) : "0"}
              </span>{" "}
              ETH
            </span>
          </div>
        </div>
      )}

      <div className="earn-tabs">
        <button
          className={`earn-tab-btn ${activeSubTab === "deposit" ? "active" : ""}`}
          onClick={() => setActiveSubTab("deposit")}
        >
          Deposit
        </button>
        <button
          className={`earn-tab-btn ${activeSubTab === "withdraw" ? "active" : ""}`}
          onClick={() => setActiveSubTab("withdraw")}
        >
          Withdraw
        </button>
      </div>

      {activeSubTab === "deposit" && (
        <>
        {sdk && sdkClient && shadowAccount ? (
          <Deposit
            shadowAccount={shadowAccount}
            accountAddress={accountAddress}
            sdk={sdk}
            sdkClient={sdkClient}
            balance={balance}
            onComplete={() => void syncTxStatuses()}
          />
        ) : (
          <div>Error loading info.</div>
        )}
        </>
      )}

      {activeSubTab === "withdraw" && (
        <>
         {sdk && sdkClient && shadowAccount ? (
          <Withdraw
            shadowAccount={shadowAccount}
            accountAddress={accountAddress}
            sdk={sdk}
            sdkClient={sdkClient}
            aaveBalance={aaveBalance}
            onComplete={() => void syncTxStatuses()}
          />
        ) : (
          <div>Error loading info.</div>
        )}
        </>
      )}

      <ActivityTab
        pendingTxns={pendingTxns}
        finalizedTxns={finalizedTxns}
        onFinalize={finalizePendingTx}
        finalizingHash={finalizingHash}
      />
    </div>
  );
}
