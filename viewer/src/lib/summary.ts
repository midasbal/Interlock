import { computeStages, signalState, type StageName } from "./classify";
import { buildReconciliationIndex } from "./reconciliation";
import { isGateDecisionEntry, type RawEntry } from "./types";

export interface TrailSummary {
  totalRoutes: number;
  cleared: number;
  latched: number;
  latchedByStage: Record<StageName, number>;
  frozen: number;
  divergencesFlagged: number;
}

export function summarize(entries: RawEntry[]): TrailSummary {
  const latchedByStage: Record<StageName, number> = {
    policy: 0,
    effect: 0,
    invariant: 0,
    simulate: 0,
    execute: 0,
  };

  let totalRoutes = 0;
  let cleared = 0;
  let latched = 0;
  let frozen = 0;

  for (const entry of entries) {
    if (!isGateDecisionEntry(entry)) continue;
    totalRoutes += 1;
    const decision = entry.payload.decision;
    const state = signalState(decision);
    if (state === "cleared") {
      cleared += 1;
    } else if (state === "frozen") {
      frozen += 1;
    } else {
      latched += 1;
      const stages = computeStages(decision);
      const stoppedAt = stages.find((s) => s.status === "latched");
      if (stoppedAt) latchedByStage[stoppedAt.name] += 1;
    }
  }

  const divergencesFlagged = buildReconciliationIndex(entries).size;

  return { totalRoutes, cleared, latched, latchedByStage, frozen, divergencesFlagged };
}
