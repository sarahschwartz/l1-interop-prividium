import { useEffect, useState } from "react";
import { type Address, formatEther } from "viem";
import {
  type Connector,
} from "wagmi";
import "../earn.css";
import { STATUS_ENDPOINT } from "../utils/constants";
import type { FinalizedTxnState, PendingTxnState } from "../utils/types";

// import { ActivityTab } from "./Activity";
import { Deposit } from "./Deposit";
import { Withdraw } from "./Withdraw";
import { useBridgeSdk } from "../hooks/useBridgeSdk";
import type { ViemClient, ViemSdk } from "@matterlabs/zksync-js/viem";
import { getAaveBalance, getShadowAccount } from "../utils/txns";

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
  
  const { getZKsyncSDK } = useBridgeSdk(rpcClient, connector, accountAddress);

  async function fetchAaveBalance(){
    if(!sdkClient || !shadowAccount) return;
    const bal = await getAaveBalance(sdkClient, shadowAccount);
    setAaveBalance(bal);
  }

   useEffect(() => {
    async function updateAaveBal(){
      await fetchAaveBalance();
    }

    updateAaveBal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadowAccount])

   useEffect(() => {
    async function updateShadowAccount(){
      if(!sdkClient) return;
      const shadow = await getShadowAccount(sdkClient, accountAddress)
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

  // useEffect(() => {
  //   if (!accountAddress) return;

  //   const controller = new AbortController();

  //   const getActivity = async () => {
  //     try {
  //       const response = await fetch(STATUS_ENDPOINT, {
  //         method: "POST",
  //         headers: { "Content-Type": "application/json" },
  //         body: JSON.stringify({ accountAddress }),
  //         signal: controller.signal,
  //       });
  //       if (!response.ok) return;

  //       const status = await response.json();
  //       if (controller.signal.aborted) return;

  //       setPendingTxns(status.responseObject.pending);
  //       setFinalizedTxns(status.responseObject.finalized);
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     } catch (err: any) {
  //       if (err?.name !== "AbortError")
  //         console.error("Error updating status:", err);
  //     }
  //   };

  //   getActivity();
  //   const intervalId = setInterval(getActivity, 60_000);

  //   return () => {
  //     controller.abort();
  //     clearInterval(intervalId);
  //   };
  // }, [accountAddress]);

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
          />
        ) : (
          <div>Error loading info.</div>
        )}
        </>
      )}

      {/* <ActivityTab pendingTxns={pendingTxns} finalizedTxns={finalizedTxns} /> */}
    </div>
  );
}
