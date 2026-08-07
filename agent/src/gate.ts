import { randomUUID } from "node:crypto";
import { evaluate, loadPolicy } from "../../policy/engine.js";
import type { Policy, ProposedAction } from "../../policy/types.js";
import type { Executor } from "./executor.js";
import type { ExecutionResult, KeeperHubClient } from "./keeperhub/types.js";
import type { GateDecision } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

/**
 * The reusable safety gate: simulate, check policy, execute only if both pass.
 * No action reaches a signature unless simulate reports it would not revert
 * AND the declarative policy allows it. This is the only implementation of
 * Executor, and the only path in this codebase that holds a KeeperHub client.
 * Handles both native transfers and contract calls through the same checks.
 */
export class Gate implements Executor {
  constructor(
    private readonly client: KeeperHubClient,
    private readonly policy: Policy = loadPolicy()
  ) {}

  async run(action: ProposedAction): Promise<GateDecision> {
    const timestamp = new Date().toISOString();

    const simulate = await this.simulate(action);
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
    const execution = await this.execute(action, idempotencyKey);

    decision.execution = {
      executionId: execution.executionId ?? "",
      status: execution.status ?? "unknown",
      transactionHash: execution.transactionHash,
      transactionLink: execution.transactionLink,
    };

    if (execution.executionId) {
      decision.finalStatus = await this.pollUntilFinal(execution.executionId);

      // The immediate execute_contract_call response only carries
      // executionId and status, unlike execute_transfer's immediate response,
      // which includes the hash right away, see the friction entry in
      // docs/BOUNTY.md. Backfill from the polled, on-chain-reconciled status
      // so decision.execution is never missing a hash the poll actually has.
      decision.execution.transactionHash ??= decision.finalStatus.transactionHash;
      decision.execution.transactionLink ??= decision.finalStatus.transactionLink;
    }

    return decision;
  }

  private async simulate(action: ProposedAction): Promise<ExecutionResult> {
    if (action.kind === "transfer") {
      return this.client.simulateTransfer({
        chainId: action.chainId,
        toAddress: action.to,
        amount: action.valueEth,
      });
    }
    return this.client.simulateContractCall({
      chainId: action.chainId,
      contractAddress: action.contractAddress,
      functionName: action.functionName,
      functionArgs: action.functionArgs,
    });
  }

  private async execute(action: ProposedAction, idempotencyKey: string): Promise<ExecutionResult> {
    if (action.kind === "transfer") {
      return this.client.executeTransfer({
        chainId: action.chainId,
        toAddress: action.to,
        amount: action.valueEth,
        idempotencyKey,
      });
    }
    return this.client.executeContractCall({
      chainId: action.chainId,
      contractAddress: action.contractAddress,
      functionName: action.functionName,
      functionArgs: action.functionArgs,
      idempotencyKey,
    });
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
