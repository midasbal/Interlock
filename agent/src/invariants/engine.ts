import { rpcCall } from "../rpc/baseSepolia.js";
import { readWithStateOverride, type StateDiffResult } from "../effectVerifier/stateDiff.js";
import type { InvariantConfig, ProposedAction } from "../../../policy/types.js";

// balanceOf(address) selector, confirmed live with cast sig, standard ERC-20.
const BALANCE_OF_SELECTOR = "0x70a08231";

function encodeBalanceOfCalldata(owner: string): string {
  return `${BALANCE_OF_SELECTOR}${owner.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
}

export interface InvariantCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface InvariantEvaluation {
  verdict: "pass" | "breach";
  checks: InvariantCheckResult[];
}

/**
 * Standing rules evaluated against the aggregated simulated state (the same
 * state diff effect verification already computed, reused here, never
 * re-traced) and a session-level running tally the gate maintains across
 * actions. Distinct from policy (calldata patterns) and effect verification
 * (one action's own declared-versus-actual effect): invariants reason about
 * what is true in aggregate, independent of what any single action claims.
 */
export class InvariantEngine {
  private readonly approvalTallyBySpender = new Map<string, bigint>();
  private cumulativeNetOutflowWei = 0n;

  constructor(
    private readonly config: InvariantConfig,
    private readonly walletAddress: string
  ) {}

  async evaluate(action: ProposedAction, stateDiff: StateDiffResult): Promise<InvariantEvaluation> {
    const checks: InvariantCheckResult[] = [];

    for (const monitored of this.config.monitoredTokenBalances) {
      checks.push(await this.checkTokenBalanceNoDecrease(monitored, stateDiff));
    }

    const approvalCheck = this.checkApprovalCapPerSpender(action);
    if (approvalCheck) {
      checks.push(approvalCheck);
    }

    for (const watched of this.config.watchedSlots) {
      checks.push(await this.checkWatchedSlot(watched, stateDiff));
    }

    const outflowCheck = this.checkCumulativeNetOutflow(action);
    if (outflowCheck) {
      checks.push(outflowCheck);
    }

    return { verdict: checks.every((c) => c.passed) ? "pass" : "breach", checks };
  }

  /** Only call once the action has actually been allowed and lands. Updates the running session tallies. */
  commit(action: ProposedAction): void {
    if (
      action.kind === "contractCall" &&
      action.declaredEffect.kind === "erc20Approve" &&
      action.declaredEffect.token.toLowerCase() === this.config.approvalCapPerSpender.token.toLowerCase()
    ) {
      const spenderKey = action.declaredEffect.spender.toLowerCase();
      const existing = this.approvalTallyBySpender.get(spenderKey) ?? 0n;
      this.approvalTallyBySpender.set(spenderKey, existing + BigInt(action.declaredEffect.allowanceBecomes));
    }
    if (
      action.kind === "transfer" &&
      action.declaredEffect.kind === "nativeTransfer" &&
      action.to.toLowerCase() !== this.walletAddress.toLowerCase()
    ) {
      this.cumulativeNetOutflowWei += BigInt(action.declaredEffect.amountWei);
    }
  }

  private async checkTokenBalanceNoDecrease(
    monitored: InvariantConfig["monitoredTokenBalances"][number],
    stateDiff: StateDiffResult
  ): Promise<InvariantCheckResult> {
    const beforeHex = await rpcCall<string>("eth_call", [
      { to: monitored.token, data: encodeBalanceOfCalldata(monitored.owner) },
      "latest",
    ]);
    const storageDiff = stateDiff.post[monitored.token.toLowerCase()]?.storage ?? {};
    const afterHex =
      Object.keys(storageDiff).length === 0
        ? beforeHex
        : await readWithStateOverride(
            { from: this.walletAddress, to: monitored.token, data: encodeBalanceOfCalldata(monitored.owner) },
            monitored.token,
            storageDiff
          );

    const before = BigInt(beforeHex);
    const after = BigInt(afterHex);
    return {
      name: `token-balance-no-decrease:${monitored.label}`,
      passed: after >= before,
      detail: `${monitored.label} would go from ${before} to ${after}`,
    };
  }

  private checkApprovalCapPerSpender(action: ProposedAction): InvariantCheckResult | null {
    if (action.kind !== "contractCall" || action.declaredEffect.kind !== "erc20Approve") {
      return null;
    }
    if (action.declaredEffect.token.toLowerCase() !== this.config.approvalCapPerSpender.token.toLowerCase()) {
      return null;
    }
    const spenderKey = action.declaredEffect.spender.toLowerCase();
    const existing = this.approvalTallyBySpender.get(spenderKey) ?? 0n;
    const prospective = existing + BigInt(action.declaredEffect.allowanceBecomes);
    const cap = BigInt(this.config.approvalCapPerSpender.capAmount);
    return {
      name: "approval-cap-per-spender",
      passed: prospective <= cap,
      detail: `cumulative approval to ${action.declaredEffect.spender} would become ${prospective}, cap is ${cap}`,
    };
  }

  private async checkWatchedSlot(
    watched: InvariantConfig["watchedSlots"][number],
    stateDiff: StateDiffResult
  ): Promise<InvariantCheckResult> {
    const before = await rpcCall<string>("eth_getStorageAt", [watched.contractAddress, watched.slot, "latest"]);
    const account = stateDiff.post[watched.contractAddress.toLowerCase()];
    const after = account?.storage?.[watched.slot.toLowerCase()] ?? account?.storage?.[watched.slot] ?? before;
    return {
      name: `watched-slot-no-change:${watched.label}`,
      passed: after.toLowerCase() === before.toLowerCase(),
      detail: `${watched.label} would go from ${before} to ${after}`,
    };
  }

  private checkCumulativeNetOutflow(action: ProposedAction): InvariantCheckResult | null {
    if (action.kind !== "transfer" || action.declaredEffect.kind !== "nativeTransfer") {
      return null;
    }
    if (action.to.toLowerCase() === this.walletAddress.toLowerCase()) {
      return null;
    }
    const prospective = this.cumulativeNetOutflowWei + BigInt(action.declaredEffect.amountWei);
    const bound = BigInt(this.config.cumulativeNetOutflowBoundWei);
    return {
      name: "cumulative-net-outflow-bound",
      passed: prospective <= bound,
      detail: `cumulative net outflow this session would become ${prospective} wei, bound is ${bound} wei`,
    };
  }
}
