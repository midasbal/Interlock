import { rpcCall } from "../rpc/baseSepolia.js";
import { readWithStateOverride, type StateDiffResult } from "../effectVerifier/stateDiff.js";
import { decodeUint256, encodeAllowanceCalldata } from "../effectVerifier/abiEncoding.js";
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
 * re-traced) and, for net outflow only, a session-level running tally.
 * Distinct from policy (calldata patterns) and effect verification (one
 * action's own declared-versus-actual effect): invariants reason about what
 * is true in aggregate, independent of what any single action claims.
 *
 * Allowance exposure is measured as real outstanding allowance, never a
 * session sum of approve amounts. A real ERC-20 approve overwrites the
 * on-chain allowance, it does not add to it, so summing approve calls
 * would overcount real exposure, that flaw was fixed here: the per-spender
 * check reads the resulting allowance from the action's own state diff, and
 * the aggregate check sums the resulting allowance for the spender being
 * approved plus live allowance reads for every other monitored spender.
 */
export class InvariantEngine {
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

    checks.push(...(await this.checkAllowanceExposure(action, stateDiff)));

    for (const watched of this.config.watchedSlots) {
      checks.push(await this.checkWatchedSlot(watched, stateDiff));
    }

    const outflowCheck = this.checkCumulativeNetOutflow(action);
    if (outflowCheck) {
      checks.push(outflowCheck);
    }

    return { verdict: checks.every((c) => c.passed) ? "pass" : "breach", checks };
  }

  /**
   * Only call once the action has actually been allowed and lands. Updates
   * the net-outflow running tally, the only invariant here that still needs
   * one, since real outstanding allowance is read fresh from chain state
   * every time and needs no session bookkeeping at all.
   */
  commit(action: ProposedAction): void {
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

  /**
   * Two checks against real outstanding allowance for the configured token,
   * only when this action is an approve on that token, otherwise neither
   * applies since no monitored spender's real allowance would change.
   */
  private async checkAllowanceExposure(
    action: ProposedAction,
    stateDiff: StateDiffResult
  ): Promise<InvariantCheckResult[]> {
    const cfg = this.config.allowanceExposure;
    if (
      !(
        action.kind === "contractCall" &&
        action.declaredEffect.kind === "erc20Approve" &&
        action.declaredEffect.token.toLowerCase() === cfg.token.toLowerCase()
      )
    ) {
      return [];
    }

    const spender = action.declaredEffect.spender;
    const resultingAllowance = await this.readResultingAllowance(cfg.token, spender, stateDiff);
    const perSpenderCap = BigInt(cfg.perSpenderCap);

    const perSpenderCheck: InvariantCheckResult = {
      name: "allowance-per-spender-cap",
      passed: resultingAllowance <= perSpenderCap,
      detail: `resulting real allowance to ${spender} would be ${resultingAllowance}, per-spender cap is ${perSpenderCap}`,
    };

    let aggregate = 0n;
    for (const monitoredSpender of cfg.monitoredSpenders) {
      aggregate +=
        monitoredSpender.toLowerCase() === spender.toLowerCase()
          ? resultingAllowance
          : await this.readLiveAllowance(cfg.token, monitoredSpender);
    }
    const aggregateCap = BigInt(cfg.aggregateCap);
    const aggregateCheck: InvariantCheckResult = {
      name: "allowance-aggregate-exposure-cap",
      passed: aggregate <= aggregateCap,
      detail: `aggregate real outstanding allowance across monitored spenders would be ${aggregate}, aggregate cap is ${aggregateCap}`,
    };

    return [perSpenderCheck, aggregateCheck];
  }

  private async readResultingAllowance(token: string, spender: string, stateDiff: StateDiffResult): Promise<bigint> {
    const storageDiff = stateDiff.post[token.toLowerCase()]?.storage ?? {};
    const hex =
      Object.keys(storageDiff).length === 0
        ? await this.readLiveAllowanceHex(token, spender)
        : await readWithStateOverride(
            { from: this.walletAddress, to: token, data: encodeAllowanceCalldata(this.walletAddress, spender) },
            token,
            storageDiff
          );
    return decodeUint256(hex);
  }

  private async readLiveAllowance(token: string, spender: string): Promise<bigint> {
    return decodeUint256(await this.readLiveAllowanceHex(token, spender));
  }

  private async readLiveAllowanceHex(token: string, spender: string): Promise<string> {
    return rpcCall<string>("eth_call", [
      { to: token, data: encodeAllowanceCalldata(this.walletAddress, spender) },
      "latest",
    ]);
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
