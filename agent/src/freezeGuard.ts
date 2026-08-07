/**
 * A circuit breaker the gate consults before authorizing anything. If any
 * guard reports frozen, the gate refuses the action immediately, before
 * policy, effect verification, or simulate ever run.
 */
export interface FreezeGuard {
  isFrozen(): boolean;
  reason(): string;
}
