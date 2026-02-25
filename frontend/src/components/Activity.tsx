import { BLOCK_EXPLORER_URL } from "../utils/constants";
import type { FinalizedTxnState, PendingTxnState } from "../utils/types";

import { PendingProgressBar } from "./ProgressBar";

interface Props {
  pendingTxns: PendingTxnState[];
  finalizedTxns: FinalizedTxnState[];
}

export function ActivityTab({ pendingTxns, finalizedTxns }: Props) {
  if (pendingTxns.length > 0 || finalizedTxns.length > 0) {
    return (
      <div
        className="tab-content"
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
                  <td className="tx-amount">{tx.amount}</td>
                  <td>
                    <PendingProgressBar addedAt={tx.addedAt} />
                  </td>
                  <td>
                    <a
                      className="tx-link"
                      href={`https://zksync-os-testnet-alpha.staging-scan-v2.zksync.dev/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                    </a>
                  </td>
                </tr>
              ))}
              {finalizedTxns.map((tx) => (
                <tr key={tx.l1FinalizeTxHash}>
                  <td>{tx.action === "Deposit" ? "Deposit" : "Withdraw"}</td>
                  <td className="tx-amount">{parseFloat(tx.amount).toFixed(4)}</td>
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
