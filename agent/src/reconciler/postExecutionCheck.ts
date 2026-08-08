import type { Gate } from "../gate.js";
import type { KeeperHubClient } from "../keeperhub/types.js";
import type { GateDecision } from "../types.js";
import type { ProposedAction } from "../../../policy/types.js";
import { appendReconciliationItem } from "../reconcilerRunlog.js";
import { reconcileDecision, type ReconciliationItem } from "./reconciler.js";

export interface DecisionWithReconciliation {
  decision: GateDecision;
  reconciliation?: ReconciliationItem;
}

/**
 * Runs the gate as usual, then, only for an action that actually landed,
 * independently reconciles it: what was authorized, what landed on chain,
 * and what KeeperHub itself reports. This is detection and reporting after
 * the fact, a separate step composed around the gate, not a new gate stage:
 * it never blocks or reverses anything, it only surfaces a divergence, the
 * same one Part 1 and Part 2 of this capability found for real, see
 * docs/RUNLOG.md. A blocked or unexecuted decision is returned unchanged,
 * there is nothing on chain yet to reconcile against.
 */
export async function runWithReconciliation(
  gate: Gate,
  action: ProposedAction,
  label: string,
  client: KeeperHubClient,
  walletAddress: string
): Promise<DecisionWithReconciliation> {
  const decision = await gate.run(action);
  if (!decision.allowed || !decision.execution) {
    return { decision };
  }

  const reconciliation = await reconcileDecision(label, decision, client, walletAddress);

  if (reconciliation.divergences.length > 0) {
    console.warn(`reconciliation flagged "${label}": ${reconciliation.verdict}`);
    for (const divergence of reconciliation.divergences) {
      console.warn(`  - ${divergence.type}: ${divergence.detail}`);
    }
  }

  appendReconciliationItem(reconciliation);
  return { decision, reconciliation };
}
