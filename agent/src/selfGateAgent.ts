import type { ProposedAction } from "../../policy/types.js";
import type { Executor } from "./executor.js";
import type { GateDecision } from "./types.js";

/**
 * Deterministic, no LLM, no paid runtime API calls. This module never imports
 * anything from ./keeperhub/*, it only depends on the Executor interface, so
 * its sole route to the chain is submitting a proposed action to the gate.
 * There is no direct client, no key, no signing path reachable from here.
 */

const MAX_ATTEMPTS = 3;
const BALANCE_REVERT_PATTERN = /Have:\s*([\d.]+).*Need:\s*([\d.]+)/i;
const BALANCE_SAFETY_MARGIN_ETH = 0.00002;

export type AgentOutcome =
  | "landed"
  | "blocked-policy"
  | "blocked-unadaptable"
  | "exhausted-retries";

export interface AgentStep {
  attempt: number;
  action: ProposedAction;
  decision: GateDecision;
  adaptation: string;
}

export interface AgentRunResult {
  steps: AgentStep[];
  outcome: AgentOutcome;
}

export class SelfGateAgent {
  constructor(private readonly executor: Executor) {}

  /**
   * Adaptation rules, explicit and bounded:
   * 1. Transfer action, would-revert with a parseable "insufficient balance"
   *    reason: reduce the amount to within the confirmed balance stated in
   *    the revert reason, minus a small safety margin, and retry.
   * 2. Would-revert for any other, unrecognized reason: no honest adaptation
   *    is possible, stop and log rather than guess.
   * 3. Policy block, any reason: never adapt around it, stop and log
   *    immediately. Policy blocks are never retried.
   * 4. MAX_ATTEMPTS is a hard ceiling regardless of outcome.
   */
  async proposeAndRun(initialAction: ProposedAction): Promise<AgentRunResult> {
    const steps: AgentStep[] = [];
    let action = initialAction;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const decision = await this.executor.run(action);

      if (decision.allowed) {
        steps.push({ attempt, action, decision, adaptation: "none, action was allowed and landed" });
        return { steps, outcome: "landed" };
      }

      if (!decision.policy.allowed) {
        steps.push({
          attempt,
          action,
          decision,
          adaptation:
            "policy block: stopping without retry, adaptation must never attempt to bypass policy",
        });
        return { steps, outcome: "blocked-policy" };
      }

      const revertReason = decision.simulate.revertReason ?? "";
      const match = revertReason.match(BALANCE_REVERT_PATTERN);

      if (decision.simulate.wouldRevert && action.kind === "transfer" && match) {
        const confirmedBalanceEth = Number(match[1]);
        const adaptedAmount = confirmedBalanceEth - BALANCE_SAFETY_MARGIN_ETH;

        if (!(adaptedAmount > 0)) {
          steps.push({
            attempt,
            action,
            decision,
            adaptation:
              "insufficient-balance would-revert, but the confirmed balance leaves no safe amount to retry with, stopping",
          });
          return { steps, outcome: "blocked-unadaptable" };
        }

        const adaptedAction: ProposedAction = {
          ...action,
          valueEth: adaptedAmount.toFixed(6),
        };
        steps.push({
          attempt,
          action,
          decision,
          adaptation: `insufficient-balance would-revert: confirmed balance is ${confirmedBalanceEth} ETH, reducing amount from ${action.valueEth} ETH to ${adaptedAction.valueEth} ETH and retrying`,
        });
        action = adaptedAction;
        continue;
      }

      steps.push({
        attempt,
        action,
        decision,
        adaptation:
          "would-revert for a reason with no documented adaptation rule, stopping rather than guessing",
      });
      return { steps, outcome: "blocked-unadaptable" };
    }

    return { steps, outcome: "exhausted-retries" };
  }
}
