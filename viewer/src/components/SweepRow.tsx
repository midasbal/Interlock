import { useState } from "react";
import { formatTimeOnly } from "../lib/format";
import type { ReconciliationItemPayload, ReconciliationReportPayload } from "../lib/types";
import { ChevronIcon } from "./icons";
import { ReconciliationPanel } from "./ReconciliationPanel";
import "./SweepRow.css";

interface ReportProps {
  seq: number;
  timestamp: string;
  report: ReconciliationReportPayload;
}

export function SweepReportRow({ seq, timestamp, report }: ReportProps) {
  const [expanded, setExpanded] = useState(false);
  const flagged = report.items.filter((item) => item.divergences.length > 0);

  return (
    <article className="sweep-row">
      <button type="button" className="sweep-row__summary" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className="sweep-row__seq mono-num">{String(seq).padStart(3, "0")}</span>
        <span className="sweep-row__time mono-num">{formatTimeOnly(timestamp)}</span>
        <span className="sweep-row__label">Reconciliation sweep, wallet {report.walletAddress.slice(0, 10)}…</span>
        <span className="sweep-row__stat mono-num">
          {report.reconciledCount}/{report.itemCount} reconciled
        </span>
        {report.divergentCount > 0 ? (
          <span className="sweep-row__badge">{report.divergentCount} flagged</span>
        ) : (
          <span className="sweep-row__badge sweep-row__badge--clear">all clear</span>
        )}
        <ChevronIcon open={expanded} />
      </button>
      {expanded ? (
        <div className="sweep-row__detail">
          {flagged.length > 0 ? (
            flagged.map((item) => <ReconciliationPanel item={item} key={`${item.seq}-${item.label}`} />)
          ) : (
            <p className="sweep-row__clear-text">Every authorized-and-executed decision reconciled cleanly against the chain and KeeperHub's reported status.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function SweepItemRow({ seq, item }: { seq: number; item: ReconciliationItemPayload }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="sweep-row">
      <button type="button" className="sweep-row__summary" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className="sweep-row__seq mono-num">{String(seq).padStart(3, "0")}</span>
        <span className="sweep-row__time mono-num">{formatTimeOnly(item.timestamp)}</span>
        <span className="sweep-row__label">Reconciliation check, {item.label}</span>
        {item.divergences.length > 0 ? (
          <span className="sweep-row__badge">{item.verdict}</span>
        ) : (
          <span className="sweep-row__badge sweep-row__badge--clear">reconciled</span>
        )}
        <ChevronIcon open={expanded} />
      </button>
      {expanded ? (
        <div className="sweep-row__detail">
          {item.divergences.length > 0 ? (
            <ReconciliationPanel item={item} />
          ) : (
            <p className="sweep-row__clear-text">
              Reconciled: the authorized action, what landed on chain, and what KeeperHub reports all agree.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
