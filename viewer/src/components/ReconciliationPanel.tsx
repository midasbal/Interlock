import { explorerTxUrl } from "../lib/format";
import type { ReconciliationItemPayload } from "../lib/types";
import { HashValue } from "./HashValue";
import { ExternalLinkIcon } from "./icons";
import "./ReconciliationPanel.css";

export function ReconciliationPanel({ item }: { item: ReconciliationItemPayload }) {
  return (
    <section className="reconciliation-panel" aria-label="Reconciliation occupancy anomaly">
      <div className="reconciliation-panel__head">
        <span className="reconciliation-panel__badge">Occupancy anomaly</span>
        <p className="reconciliation-panel__intro">
          Independently rebuilt from real Base Sepolia reads and a live KeeperHub status check, blocks{" "}
          <span className="mono-num">
            {item.window.fromBlock} to {item.window.toBlock}
          </span>
          .
        </p>
      </div>

      <div className="reconciliation-panel__columns">
        <div className="reconciliation-column">
          <h4 className="reconciliation-column__title">Authorized</h4>
          <dl className="reconciliation-column__body">
            <dt>Execution id</dt>
            <dd className="mono-num">{item.authorized.executionId || "none"}</dd>
            <dt>Reported hash</dt>
            <dd>
              {item.authorized.reportedTransactionHash ? (
                <HashValue value={item.authorized.reportedTransactionHash} kind="tx" linkToExplorer />
              ) : (
                "none"
              )}
            </dd>
          </dl>
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
          <dl className="reconciliation-column__body">
            <dt>Status</dt>
            <dd className={item.keeperHubReported.status === "failed" ? "reconciliation-value--danger" : ""}>
              {item.keeperHubReported.status}
            </dd>
            <dt>Receipt status</dt>
            <dd>{item.keeperHubReported.receiptStatus}</dd>
            {item.keeperHubReported.error ? (
              <>
                <dt>Error</dt>
                <dd className="reconciliation-value--danger">{item.keeperHubReported.error}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="reconciliation-panel__divergences">
        {item.divergences.map((d, i) => (
          <div className="reconciliation-divergence" key={i}>
            <span className="reconciliation-divergence__type">{d.type}</span>
            <span className="reconciliation-divergence__detail">{d.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
