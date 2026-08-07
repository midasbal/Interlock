import { randomUUID } from "node:crypto";
import { evaluate, loadPolicy } from "../../policy/engine.js";
import type { Policy, ProposedAction } from "../../policy/types.js";
import type { Executor } from "./executor.js";
import type { KeeperHubClient } from "./keeperhub/types.js";
import type { GateDecision } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

/**
 * The reusable safety gate: simulate, check policy, execute only if both pass.
 * No action reaches a signature unless simulate reports it would not revert
 * AND the declarative policy allows it. This is the only implementation of
 * Executor, and the only path in this codebase that holds a KeeperHub client.
 */
export class Gate implements Executor {
  constructor(
    private readonly client: KeeperHubClient,
    private readonly policy: Policy = loadPolicy()
  ) {}

  async run(action: ProposedAction): Promise<GateDecision> {
    const timestamp = new Date().toISOString();

    const simulate = await this.client.simulateTransfer({
      chainId: action.chainId,
      toAddress: action.to,
      amount: action.valueEth,
    });
    const simulateOk = simulate.success === true && simulate.wouldRevert === false;

    const policy = evaluate(action, this.policy);

    const allowed = simulateOk && policy.allowed;
    const reasonParts: string[] = [];
    if (!simulateOk) {
      reasonParts.push(
        `simulate blocked it: ${simulate.revertReason ?? "success was false or wouldRevert was true"}`
      );
    }
    if (!policy.allowed) {
      reasonParts.push(`policy blocked it: ${policy.reason}`);
    }
    if (allowed) {
      reasonParts.push("simulate passed and policy passed");
    }
    const reason = reasonParts.join("; ");

    const decision: GateDecision = { action, timestamp, simulate, policy, allowed, reason };

    if (!allowed) {
      return decision;
    }

    const idempotencyKey = `interlock-gate-${randomUUID()}`;
    const execution = await this.client.executeTransfer({
      chainId: action.chainId,
      toAddress: action.to,
      amount: action.valueEth,
      idempotencyKey,
    });

    decision.execution = {
      executionId: execution.executionId ?? "",
      status: execution.status ?? "unknown",
      transactionHash: execution.transactionHash,
      transactionLink: execution.transactionLink,
    };

    if (execution.executionId) {
      decision.finalStatus = await this.pollUntilFinal(execution.executionId);
    }

    return decision;
  }

  private async pollUntilFinal(executionId: string) {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const status = await this.client.getExecutionStatus(executionId);
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`execution ${executionId} did not reach a final status in time`);
  }
}
