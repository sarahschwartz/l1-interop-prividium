import { BLOCK_EXPLORER_URL } from "../utils/constants";
import type { FinalizedTxnState, PendingTxnState } from "../utils/types";
import type { Hex } from "viem";
import { formatEther } from "viem";

interface Props {
  pendingTxns: PendingTxnState[];
  finalizedTxns: FinalizedTxnState[];
  onFinalize: (tx: PendingTxnState) => Promise<void>;
  finalizingHash?: Hex;
}

export function ActivityTab({
  pendingTxns,
  finalizedTxns,
  onFinalize,
  finalizingHash,
}: Props) {
  if (pendingTxns.length > 0 || finalizedTxns.length > 0) {
    return (
      <div
        id="activity-tab"
      >
        <div
          id="activity-title"
          className="tab-title"
          style={{ marginBottom: "16px" }}
        >
          Recent Activity
        </div>
        <div
          className="card"
          style={{ paddingTop: "16px" }}
        >
          <table
            className="tx-table"
            id="pending-txns-list"
          >
            <thead>
              <tr>
                <th>Action</th>
                <th>Amount (ETH)</th>
                <th>Status</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {pendingTxns.map((tx) => (
                <tr key={tx.hash}>
                  <td>{tx.action}</td>
                  <td className="tx-amount">{formatEther(BigInt(tx.amount))}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span>{tx.status}</span>
                      {tx.readyToFinalize ? (
                        <button
                          className="enterprise-button-primary"
                          style={{ padding: "6px 10px" }}
                          onClick={() => void onFinalize(tx)}
                          disabled={finalizingHash === tx.hash}
                        >
                          {finalizingHash === tx.hash ? "Finalizing..." : (tx.finalizeLabel ?? "Finalize")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <a
                      className="tx-link"
                      href={`${BLOCK_EXPLORER_URL}/tx/${tx.displayHash ?? tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {(tx.displayHash ?? tx.hash).slice(0, 6)}...{(tx.displayHash ?? tx.hash).slice(-4)}
                    </a>
                  </td>
                </tr>
              ))}
              {finalizedTxns.map((tx) => (
                <tr key={tx.l1FinalizeTxHash}>
                  <td>{tx.action === "Deposit" ? "Deposit" : "Withdraw"}</td>
                  <td className="tx-amount">{formatEther(BigInt(tx.amount))}</td>
                  <td>
                    <span className="tx-status tx-status--success">
                      Finalized At{" "}{new Date(tx.finalizedAt).toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <a
                      className="tx-link"
                      href={`${BLOCK_EXPLORER_URL}/tx/${tx.l2TxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tx.l2TxHash.slice(0, 6)}...{tx.l2TxHash.slice(-4)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}
