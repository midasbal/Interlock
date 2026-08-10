import type { ChainVerificationResult } from "../lib/hashChain";
import type { TrailSummary } from "../lib/summary";
import { IntegrityLamp } from "./IntegrityLamp";
import { ReadoutTile } from "./ReadoutTile";
import "./InstrumentHeader.css";

interface Props {
  phase: "loading" | "verifying" | "ready" | "error";
  integrity: ChainVerificationResult | null;
  errorMessage: string | null;
  summary: TrailSummary | null;
  revealed: boolean;
}

export function InstrumentHeader({ phase, integrity, errorMessage, summary, revealed }: Props) {
  const latchedBreakdown = summary
    ? (["policy", "effect", "invariant", "simulate", "execute"] as const)
        .map((stage) => `${summary.latchedByStage[stage]} ${stage}`)
        .join(" · ")
    : undefined;

  return (
    <header className={`panel-header ${revealed ? "panel-header--revealed" : ""}`}>
      <div className="panel-header__inner">
        <div className="panel-header__top">
          <div className="panel-header__title">
            <span className="panel-header__kicker">
              <span className="armed-indicator" aria-hidden="true" />
              Interlock, armed
            </span>
            <h1 className="panel-header__name">Signal panel</h1>
          </div>
          <IntegrityLamp phase={phase} integrity={integrity} errorMessage={errorMessage} />
        </div>

        {summary ? (
          <div className="panel-header__readouts" role="group" aria-label="Trail summary">
            <ReadoutTile label="Total routes" value={summary.totalRoutes} />
            <ReadoutTile label="Cleared" value={summary.cleared} tone="clear" />
            <ReadoutTile label="Latched" value={summary.latched} tone="danger" sub={latchedBreakdown} />
            <ReadoutTile label="Frozen" value={summary.frozen} tone="anomaly" />
            <ReadoutTile label="Divergences flagged" value={summary.divergencesFlagged} tone="anomaly" />
          </div>
        ) : null}
      </div>
    </header>
  );
}
