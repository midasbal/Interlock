import type { GateDecision } from "./types";

export type SignalState = "cleared" | "latched" | "frozen";

export type StageName = "policy" | "effect" | "invariant" | "simulate" | "execute";

export interface StageStatus {
  name: StageName;
  label: string;
  status: "passed" | "latched" | "not-reached";
}

export const STAGE_ORDER: { name: StageName; label: string }[] = [
  { name: "policy", label: "Policy" },
  { name: "effect", label: "Effect verification" },
  { name: "invariant", label: "Invariant" },
  { name: "simulate", label: "Simulate" },
  { name: "execute", label: "Execute" },
];

/**
 * Walks the same cascade the real gate does (agent/src/gate.ts): a stage
 * only runs if every earlier stage passed. A stage present in the decision
 * with a failing verdict is where the route latches, every later stage
 * never ran and is rendered not-reached, never as a second failure.
 *
 * The invariant stage did not exist for the earliest entries in the trail,
 * so its field is absent there, not because the route stopped before it.
 * An absent field on a decision that is not otherwise latched never blocked
 * the route, so it renders passed rather than as a false break in an
 * otherwise-clearing chain.
 */
export function computeStages(decision: GateDecision): StageStatus[] {
  if (decision.frozen) {
    return STAGE_ORDER.map((s) => ({ ...s, status: "not-reached" as const }));
  }

  const stages: StageStatus[] = [];
  let latched = false;

  const addStage = (name: StageName, label: string, present: boolean, passed: boolean) => {
    let status: StageStatus["status"];
    if (latched) {
      status = "not-reached";
    } else if (!present) {
      status = "passed";
    } else {
      status = passed ? "passed" : "latched";
      if (!passed) latched = true;
    }
    stages.push({ name, label, status });
  };

  addStage("policy", "Policy", Boolean(decision.policy), decision.policy?.allowed === true);
  addStage(
    "effect",
    "Effect verification",
    Boolean(decision.effectVerification),
    decision.effectVerification?.verdict === "match"
  );
  addStage("invariant", "Invariant", Boolean(decision.invariants), decision.invariants?.verdict === "pass");
  addStage(
    "simulate",
    "Simulate",
    Boolean(decision.simulate),
    decision.simulate?.success === true && decision.simulate?.wouldRevert === false
  );

  const executed = decision.allowed === true && Boolean(decision.execution);
  stages.push({ name: "execute", label: "Execute", status: latched ? "not-reached" : executed ? "passed" : "latched" });

  return stages;
}

export function signalState(decision: GateDecision): SignalState {
  if (decision.frozen) return "frozen";
  if (decision.allowed && decision.execution) return "cleared";
  return "latched";
}

/** The name of the stage the route latched at, or null if it cleared or is frozen (locked before any stage). */
export function latchedStage(decision: GateDecision): StageStatus | null {
  const stages = computeStages(decision);
  return stages.find((s) => s.status === "latched") ?? null;
}
