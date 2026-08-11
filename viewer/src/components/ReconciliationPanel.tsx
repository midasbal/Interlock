import type { ReconciliationItemPayload } from "../lib/types";
import { HashValue } from "./HashValue";
import { HexText } from "./HexText";
import { AnomalyMarkIcon } from "./icons";
import "./ReconciliationPanel.css";

const DIVERGENCE_TITLE: Record<string, string> = {
  "duplicate-broadcast": "Duplicate broadcast",
  "status-divergence": "False status reported",
  "amount-or-recipient-mismatch": "Amount or recipient mismatch",
  "unmatched-authorization": "No on-chain match found",
};

function divergenceTitle(type: string): string {
  return DIVERGENCE_TITLE[type] ?? type;
}

/**
 * keeperHubReported.receiptStatus (reconciler.ts) is not something KeeperHub
 * reported at all: it is the reconciler's own eth_getTransactionReceipt call
 * against the hash KeeperHub reported, an independent chain read carried
 * under the same object for convenience. Rendered separately here so the
 * two sources are never presented as if they were the same claim.
 */
function receiptStatusLabel(status: string): string {
  if (status === "success") return "succeeded";
  if (status === "reverted") return "reverted";
  return "found no matching receipt at all";
}

const NET_OUTFLOW_CAPTION_SEQ = 96;
const NET_OUTFLOW_CAPTION =
  "This cap bounds authorized outflow, not real outflow, and it correctly refused transfer 3. The extra ETH here is a duplicate broadcast by the execution layer, caught by the reconciler, not a cap that failed.";

export function ReconciliationPanel({ item }: { item: ReconciliationItemPayload }) {
  const verifiedMatch = item.authorized.reportedTransactionHash
    ? item.onChain.exactMatches.find(
        (match) => match.hash.toLowerCase() === item.authorized.reportedTransactionHash!.toLowerCase()
      )
    : undefined;
  // KeeperHub's own status vocabulary ("completed"/"failed") is not the same
  // vocabulary as a receipt's ("success"/"reverted"), so comparing the two
  // strings directly is never a valid disagreement check, "completed" and
  // "success" are the same real outcome in different words. The reconciler
  // already did this comparison correctly (reconciler.ts, keeperSaysFinal
  // against reportedReceipt.status) and recorded a real status-divergence
  // divergence only when they truly conflict. Read that, do not re-derive it.
  const statusDisagreesWithChain = item.divergences.some((d) => d.type === "status-divergence");

  return (
    <section className="reconciliation-panel" aria-label="Reconciliation occupancy anomaly">
      <div className="reconciliation-panel__head">
        <span className="reconciliation-panel__badge">
          <AnomalyMarkIcon />
          Occupancy anomaly, the headline finding
        </span>
        <p className="reconciliation-panel__intro">
          Independently rebuilt from real Base Sepolia reads and a live KeeperHub status check, blocks{" "}
          <span className="mono-num">
            {item.window.fromBlock} to {item.window.toBlock}
          </span>
          .
        </p>
      </div>

      {item.seq === NET_OUTFLOW_CAPTION_SEQ ? (
        <p className="reconciliation-panel__caption">{NET_OUTFLOW_CAPTION}</p>
      ) : null}

      <div className="reconciliation-panel__findings">
        {item.divergences.map((d, i) => (
          <div className="reconciliation-finding" key={i}>
            <span className="reconciliation-finding__title">{divergenceTitle(d.type)}</span>
            <p className="reconciliation-finding__detail">
              <HexText text={d.detail} />
            </p>
          </div>
        ))}
      </div>

      <div className="reconciliation-panel__columns">
        <div className="reconciliation-column">
          <h4 className="reconciliation-column__title">Authorized</h4>
          <div className="reconciliation-column__body">
            <div className="reconciliation-field">
              <span className="reconciliation-field__label">Execution id</span>
              <span className="reconciliation-field__value mono-num">{item.authorized.executionId || "none"}</span>
            </div>
            <div className="reconciliation-field">
              <span className="reconciliation-field__label">Reported hash</span>
              <span className="reconciliation-field__value">
                {item.authorized.reportedTransactionHash ? (
                  <HashValue value={item.authorized.reportedTransactionHash} kind="tx" linkToExplorer />
                ) : (
                  "none"
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="reconciliation-column">
          <h4 className="reconciliation-column__title">Actual on chain</h4>
          <ul className="reconciliation-matches">
            {item.onChain.exactMatches.map((match) => (
              <li key={match.hash} className={`reconciliation-match reconciliation-match--${match.status}`}>
                <span className="reconciliation-match__hash">
                  <HashValue value={match.hash} kind="tx" linkToExplorer />
                </span>
                <span className="reconciliation-match__meta">
                  block <span className="mono-num">{match.blockNumber}</span> · {match.path} · {match.status}
                </span>
              </li>
            ))}
            {item.onChain.exactMatches.length === 0 ? (
              <li className="reconciliation-match reconciliation-match--none">No matching transaction found on chain</li>
            ) : null}
          </ul>
          {item.onChain.exactMatches.length > 1 ? (
            <p className="reconciliation-column__note">
              {item.onChain.exactMatches.length} transactions independently satisfy one authorization.
            </p>
          ) : null}
        </div>

        <div className="reconciliation-column">
          <h4 className="reconciliation-column__title">KeeperHub reported</h4>
          <div className="reconciliation-column__body">
            <div className="reconciliation-field">
              <span className="reconciliation-field__label">Status</span>
              <span
                className={`reconciliation-field__value ${
                  item.keeperHubReported.status === "failed" ? "reconciliation-value--danger" : ""
                }`}
              >
                {item.keeperHubReported.status}
              </span>
            </div>
            {item.keeperHubReported.error ? (
              <div className="reconciliation-field">
                <span className="reconciliation-field__label">Error</span>
                <span className="reconciliation-field__value reconciliation-value--danger">
                  <HexText text={item.keeperHubReported.error} />
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="reconciliation-column">
          <h4 className="reconciliation-column__title">Independently verified on chain</h4>
          <div className="reconciliation-column__body">
            <div className="reconciliation-field">
              <span className="reconciliation-field__label">Receipt</span>
              <span
                className={`reconciliation-field__value ${
                  item.keeperHubReported.receiptStatus === "success" ? "reconciliation-value--clear" : ""
                }`}
              >
                {item.keeperHubReported.receiptStatus}
              </span>
            </div>
            {verifiedMatch ? (
              <div className="reconciliation-field">
                <span className="reconciliation-field__label">Block</span>
                <span className="reconciliation-field__value mono-num">{verifiedMatch.blockNumber}</span>
              </div>
            ) : null}
            {item.authorized.reportedTransactionHash ? (
              <div className="reconciliation-field">
                <span className="reconciliation-field__label">Transaction</span>
                <span className="reconciliation-field__value">
                  <HashValue value={item.authorized.reportedTransactionHash} kind="tx" linkToExplorer />
                </span>
              </div>
            ) : null}
            {statusDisagreesWithChain ? (
              <p className="reconciliation-column__note reconciliation-column__note--strong">
                KeeperHub reported this execution as "{item.keeperHubReported.status}"
                {item.keeperHubReported.error ? (
                  <>
                    {" "}
                    (<HexText text={item.keeperHubReported.error} />)
                  </>
                ) : null}
                . Independent on-chain verification proves the transaction{" "}
                {receiptStatusLabel(item.keeperHubReported.receiptStatus)}
                {verifiedMatch ? (
                  <>
                    {" "}
                    in block <span className="mono-num">{verifiedMatch.blockNumber}</span>
                  </>
                ) : null}
                .
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
