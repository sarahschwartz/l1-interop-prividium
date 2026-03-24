import { useCallback, useEffect, useState } from "react";
import { type Address, formatEther, type Hex } from "viem";
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
import {
  estimateWithdrawBridgeBuffer,
  getAaveBalance,
  getL1EthBalance,
  getShadowAccount,
} from "../utils/txns";
import {
  addFinalizedTx,
} from "../utils/storage";
import {
  getInteropFinalizeParams,
  updateTxStatuses,
} from "../utils/interop";
import L1_INTEROP_HANDLER_JSON from "../utils/abis/L1InteropHandler.json";
import { L1_INTEROP_HANDLER_ADDRESS } from "../utils/constants";

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
  const [shadowEthBalance, setShadowEthBalance] = useState<bigint>(0n);
  const [withdrawBridgeBuffer, setWithdrawBridgeBuffer] = useState<bigint>(0n);
  const [finalizingHash, setFinalizingHash] = useState<Hex>();
  
  const { getZKsyncSDK } = useBridgeSdk(rpcClient, connector, accountAddress);

  async function fetchAaveBalance() {
    if(!sdkClient || !shadowAccount) return;
    const bal = await getAaveBalance(sdkClient, shadowAccount);
    setAaveBalance(bal);
  }

  async function fetchShadowEthBalance() {
    if (!sdkClient || !shadowAccount) return;
    const balance = await getL1EthBalance(sdkClient, shadowAccount);
    setShadowEthBalance(balance);
  }

   useEffect(() => {
    async function updateAaveBal() {
      await fetchAaveBalance();
    }

    updateAaveBal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadowAccount])

  useEffect(() => {
    async function updateShadowEthBalance() {
      await fetchShadowEthBalance();
    }

    updateShadowEthBalance();
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

  useEffect(() => {
    async function updateWithdrawBridgeFee() {
      if (!sdk || !sdkClient) return;
      const requiredBuffer = await estimateWithdrawBridgeBuffer(sdk, sdkClient);
      setWithdrawBridgeBuffer(requiredBuffer);
    }

    updateWithdrawBridgeFee();
  }, [sdk, sdkClient]);


  const syncTxStatuses = useCallback(async () => {
    if (!sdk || !sdkClient || !accountAddress) return;
    const { nextPending, nextFinalized } = await updateTxStatuses(accountAddress, sdk, sdkClient)
    setPendingTxns(nextPending);
    setFinalizedTxns(nextFinalized);
  }, [accountAddress, sdk, sdkClient]);

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
            blockExplorerUrls: [],
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
        const params = await getInteropFinalizeParams(tx.hash, sdkClient);
        const baseGasPrice = await sdkClient.l1.getGasPrice();
        const bumpedGasPrice = (baseGasPrice * 12n) / 10n;
        const finalizeGas = await sdkClient.l1.estimateContractGas({
          address: L1_INTEROP_HANDLER_ADDRESS,
          abi: L1_INTEROP_HANDLER_JSON.abi,
          functionName: "receiveInteropFromL2",
          args: [params],
          account: accountAddress,
        });
        l1FinalizeTxHash = await sdkClient.l1Wallet.writeContract({
          address: L1_INTEROP_HANDLER_ADDRESS,
          abi: L1_INTEROP_HANDLER_JSON.abi,
          functionName: "receiveInteropFromL2",
          args: [params],
          gas: finalizeGas,
          gasPrice: bumpedGasPrice,
        });

        const receipt = await sdkClient.l1.waitForTransactionReceipt({
          hash: l1FinalizeTxHash,
          timeout: 300_000,
        });
        if(receipt.status !== "success"){
          alert("Finalization txn reverted. Try again.");
          throw new Error("finalization reverted");
        } 
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
  }, [accountAddress, sdk, sdkClient, switchToL1, syncTxStatuses]);

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
          <div className="aave-info-row">
            <span className="info-label">Shadow ETH Buffer</span>
            <span className="info-value">{formatEther(shadowEthBalance)} ETH</span>
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
            shadowEthBalance={shadowEthBalance}
            requiredEthBuffer={withdrawBridgeBuffer}
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
