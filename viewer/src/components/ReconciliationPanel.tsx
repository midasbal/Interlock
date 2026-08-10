import { explorerTxUrl } from "../lib/format";
import type { ReconciliationItemPayload } from "../lib/types";
import { HashValue } from "./HashValue";
import { HexText } from "./HexText";
import { AnomalyMarkIcon, ExternalLinkIcon } from "./icons";
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

export function ReconciliationPanel({ item }: { item: ReconciliationItemPayload }) {
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
                <a
                  className="reconciliation-match__hash"
                  href={explorerTxUrl(match.hash)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="mono-num">
                    {match.hash.slice(0, 10)}…{match.hash.slice(-6)}
                  </span>
                  <ExternalLinkIcon />
                </a>
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
            <div className="reconciliation-field">
              <span className="reconciliation-field__label">Receipt status</span>
              <span className="reconciliation-field__value">{item.keeperHubReported.receiptStatus}</span>
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
      </div>
    </section>
  );
}
