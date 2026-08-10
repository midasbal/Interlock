import type { ChainVerificationResult } from "../lib/hashChain";
import { truncateForDisplay } from "../lib/format";
import { LampDot } from "./icons";
import "./IntegrityLamp.css";

interface Props {
  phase: "loading" | "verifying" | "ready" | "error";
  integrity: ChainVerificationResult | null;
  errorMessage: string | null;
}

export function IntegrityLamp({ phase, integrity, errorMessage }: Props) {
  if (phase === "error") {
    return (
      <div className="lamp lamp--danger" role="status">
        <span className="lamp__dot lamp__dot--danger">
          <LampDot />
        </span>
        <div className="lamp__text">
          <span className="lamp__label">Trail unavailable</span>
          <span className="lamp__detail">{errorMessage}</span>
        </div>
      </div>
    );
  }

  if (phase === "loading" || phase === "verifying") {
    return (
      <div className="lamp lamp--arming" role="status">
        <span className="lamp__dot lamp__dot--arming">
          <LampDot />
        </span>
        <div className="lamp__text">
          <span className="lamp__label">Verifying hash chain</span>
          <span className="lamp__detail">Recomputing every entry against docs/audit-trail.jsonl</span>
        </div>
      </div>
    );
  }

  if (!integrity) {
    return null;
  }

  if (integrity.valid) {
    return (
      <div className="lamp lamp--clear" role="status">
        <span className="lamp__dot lamp__dot--clear">
          <LampDot />
        </span>
        <div className="lamp__text">
          <span className="lamp__label">Chain verified live</span>
          <span className="lamp__detail mono-num" title={integrity.chainHead}>
            {integrity.entryCount} entries · head {truncateForDisplay(integrity.chainHead)}
          </span>
          <span className="lamp__hint">
            Recomputed just now, in your browser, from this page's own copy of docs/audit-trail.jsonl. Same
            algorithm as <code>npm run audit:verify</code>, run it yourself against the real file.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="lamp lamp--danger" role="status">
      <span className="lamp__dot lamp__dot--danger">
        <LampDot />
      </span>
      <div className="lamp__text">
        <span className="lamp__label">Chain broken at entry {integrity.brokenAt}</span>
        <span className="lamp__detail">{integrity.reason}</span>
      </div>
    </div>
  );
}
