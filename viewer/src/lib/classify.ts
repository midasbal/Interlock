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
 */
export function computeStages(decision: GateDecision): StageStatus[] {
  const stages: StageStatus[] = [];
  let latched = false;

  const push = (name: StageName, label: string, passed: boolean) => {
    stages.push({ name, label, status: latched ? "not-reached" : passed ? "passed" : "latched" });
    if (!passed) latched = true;
  };

  if (decision.frozen) {
    return STAGE_ORDER.map((s) => ({ ...s, status: "not-reached" as const }));
  }

  if (decision.policy) {
    push("policy", "Policy", decision.policy.allowed);
  } else {
    stages.push({ name: "policy", label: "Policy", status: "not-reached" });
    latched = true;
  }

  if (decision.effectVerification) {
    push("effect", "Effect verification", decision.effectVerification.verdict === "match");
  } else {
    stages.push({ name: "effect", label: "Effect verification", status: "not-reached" });
  }

  if (decision.invariants) {
    push("invariant", "Invariant", decision.invariants.verdict === "pass");
  } else {
    stages.push({ name: "invariant", label: "Invariant", status: "not-reached" });
  }

  if (decision.simulate) {
    push("simulate", "Simulate", decision.simulate.success === true && decision.simulate.wouldRevert === false);
  } else {
    stages.push({ name: "simulate", label: "Simulate", status: "not-reached" });
  }

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
