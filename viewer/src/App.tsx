import { useEffect, useMemo, useState } from "react";
import { InstrumentHeader } from "./components/InstrumentHeader";
import { RouteLog } from "./components/RouteLog";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { useTrail } from "./hooks/useTrail";
import { buildReconciliationIndex } from "./lib/reconciliation";
import { summarize } from "./lib/summary";
import type { ReconciliationItemPayload } from "./lib/types";
import "./App.css";

export default function App() {
  const trail = useTrail();
  const reducedMotion = useReducedMotion();
  const [headerRevealed, setHeaderRevealed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setHeaderRevealed(true);
      return;
    }
    const timer = window.setTimeout(() => setHeaderRevealed(true), 40);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (trail.phase !== "ready") return;
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const timer = window.setTimeout(() => setRevealed(true), 220);
    return () => window.clearTimeout(timer);
  }, [trail.phase, reducedMotion]);

  const summary = useMemo(() => (trail.phase === "ready" ? summarize(trail.entries) : null), [trail.phase, trail.entries]);

  const reconciliationIndex = useMemo<Map<number, ReconciliationItemPayload>>(
    () => (trail.phase === "ready" ? buildReconciliationIndex(trail.entries) : new Map()),
    [trail.phase, trail.entries]
  );

  return (
    <div className="app">
      <InstrumentHeader
        phase={trail.phase}
        integrity={trail.integrity}
        errorMessage={trail.error}
        summary={summary}
        revealed={headerRevealed}
      />
      <main className="app__body">
        {trail.phase === "error" ? (
          <div className="app__error">
            <p>{trail.error}</p>
          </div>
        ) : (
          <RouteLog
            entries={trail.entries}
            reconciliationIndex={reconciliationIndex}
            revealed={revealed}
            reducedMotion={reducedMotion}
          />
        )}
      </main>
      <footer className="app__footer">
        <span>Interlock audit-trail viewer. Renders docs/audit-trail.jsonl only, no fabricated data.</span>
      </footer>
    </div>
  );
}
