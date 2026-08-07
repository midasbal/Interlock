import { readDelegationState, type DelegationState } from "./delegationCode.js";

export type BaselinePinnedEvent = { kind: "baseline-pinned"; timestamp: string; wallet: string; state: DelegationState };
export type PollCleanEvent = { kind: "poll-clean"; timestamp: string; wallet: string; state: DelegationState };
export type IntegrityViolationEvent = {
  kind: "integrity-violation";
  timestamp: string;
  wallet: string;
  baseline: DelegationState;
  observed: DelegationState;
};

export type DelegationMonitorEvent = BaselinePinnedEvent | PollCleanEvent | IntegrityViolationEvent;
export type PollEvent = PollCleanEvent | IntegrityViolationEvent;

/**
 * A wallet's delegation can be re-pointed at any time by a fresh EIP-7702
 * authorization, that is effectively an account takeover if it happens
 * without the owner's knowledge. This monitor pins the expected delegation
 * as a baseline and polls eth_getCode on a bounded interval; any deviation,
 * re-pointed to a different implementation, or added or removed
 * unexpectedly, is a critical integrity violation. It also implements
 * FreezeGuard: once violated, it reports frozen until explicitly
 * re-affirmed, and the gate consults this before authorizing anything.
 */
export class DelegationMonitor {
  private baseline: DelegationState | null = null;
  private frozen = false;
  private violation: DelegationMonitorEvent | null = null;

  constructor(private readonly wallet: string) {}

  isFrozen(): boolean {
    return this.frozen;
  }

  reason(): string {
    if (!this.violation || this.violation.kind !== "integrity-violation") {
      return "not frozen";
    }
    return `wallet ${this.wallet} delegation changed from ${describeState(this.violation.baseline)} to ${describeState(this.violation.observed)}, re-affirm before any further action is authorized`;
  }

  async pinBaseline(): Promise<BaselinePinnedEvent> {
    const state = await readDelegationState(this.wallet);
    this.baseline = state;
    return { kind: "baseline-pinned", timestamp: new Date().toISOString(), wallet: this.wallet, state };
  }

  async poll(): Promise<PollEvent> {
    if (!this.baseline) {
      throw new Error("cannot poll before a baseline is pinned");
    }
    const state = await readDelegationState(this.wallet);
    const timestamp = new Date().toISOString();

    const deviated =
      state.delegated !== this.baseline.delegated ||
      (state.implementation ?? "").toLowerCase() !== (this.baseline.implementation ?? "").toLowerCase();

    if (deviated) {
      this.frozen = true;
      const event: IntegrityViolationEvent = {
        kind: "integrity-violation",
        timestamp,
        wallet: this.wallet,
        baseline: this.baseline,
        observed: state,
      };
      this.violation = event;
      return event;
    }
    return { kind: "poll-clean", timestamp, wallet: this.wallet, state };
  }

  /** Explicitly re-affirms the currently observed delegation as the new baseline, clearing the freeze. */
  async reaffirm(): Promise<BaselinePinnedEvent> {
    const event = await this.pinBaseline();
    this.frozen = false;
    this.violation = null;
    return event;
  }
}

function describeState(state: DelegationState): string {
  return state.delegated ? `delegated to ${state.implementation}` : "not delegated";
}
