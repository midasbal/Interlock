import { randomUUID } from "node:crypto";
import { evaluate, loadPolicy } from "../../policy/engine.js";
import type { Policy, ProposedAction } from "../../policy/types.js";
import type { EffectVerifier } from "./effectVerifier/verifier.js";
import type { Executor } from "./executor.js";
import type { FreezeGuard } from "./freezeGuard.js";
import type { ExecutionResult, KeeperHubClient } from "./keeperhub/types.js";
import type { GateDecision } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

/**
 * The reusable safety gate. Order, and the reason it is this order (cheapest
 * and least ambiguous checks first, so a block happens as early as possible
 * with a clear reason, see docs/ARCHITECTURE.md):
 *   0. Freeze guards: is there a standing delegation-integrity freeze on this
 *      wallet. Purely local, instant, checked before anything else, since it
 *      is a circuit breaker on the wallet itself, not on any one action.
 *   1. Policy (allowlist checks): purely local, instant, no network call.
 *   2. Effect verification: does the real, observed effect of the exact call
 *      match what its author declared, and does nothing watchlisted change.
 *   3. Simulate: would the call revert on KeeperHub's own pre-flight check.
 *   4. Execute, only if all four passed, with an idempotency key, polled to
 *      on-chain confirmation.
 * No action reaches a signature unless every stage passes. This is the only
 * implementation of Executor, and the only path in this codebase that holds
 * a KeeperHub client.
 */
export class Gate implements Executor {
  constructor(
    private readonly client: KeeperHubClient,
    private readonly effectVerifier: EffectVerifier,
    private readonly policy: Policy = loadPolicy(),
    private readonly freezeGuards: FreezeGuard[] = []
  ) {}

  async run(action: ProposedAction): Promise<GateDecision> {
    const timestamp = new Date().toISOString();

    for (const guard of this.freezeGuards) {
      if (guard.isFrozen()) {
        return {
          action,
          timestamp,
          frozen: true,
          allowed: false,
          reason: `delegation integrity freeze: ${guard.reason()}`,
        };
      }
    }

    const policy = evaluate(action, this.policy);
    if (!policy.allowed) {
      return {
        action,
        timestamp,
        policy,
        allowed: false,
        reason: `policy blocked it: ${policy.reason}`,
      };
    }

    const effectVerification = await this.effectVerifier.verify(action);
    if (effectVerification.verdict !== "match") {
      return {
        action,
        timestamp,
        policy,
        effectVerification,
        allowed: false,
        reason: `effect verification blocked it: ${effectVerification.deviations.join("; ")}`,
      };
    }

    const simulate = await this.simulate(action);
    const simulateOk = simulate.success === true && simulate.wouldRevert === false;
    if (!simulateOk) {
      return {
        action,
        timestamp,
        policy,
        effectVerification,
        simulate,
        allowed: false,
        reason: `simulate blocked it: ${simulate.revertReason ?? "success was false or wouldRevert was true"}`,
      };
    }

    const decision: GateDecision = {
      action,
      timestamp,
      policy,
      effectVerification,
      simulate,
      allowed: true,
      reason: "policy passed, effect verification matched, simulate passed",
    };

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
