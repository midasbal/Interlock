export interface ContractCallPolicy {
  targetAllowlist: string[];
  functionAllowlist: string[];
}

export interface Policy {
  chainAllowlist: string[];
  recipientAllowlist: string[];
  maxValueEth: string;
  contractCall: ContractCallPolicy;
}

/**
 * A structured statement of the exact effects a proposed action is expected
 * to have. The gate verifies the real, observed effect against this before
 * it will sign, see agent/src/effectVerifier and docs/ARCHITECTURE.md.
 */
export type DeclaredEffect =
  | { kind: "nativeTransfer"; recipient: string; amountWei: string }
  | { kind: "erc20Approve"; token: string; owner: string; spender: string; allowanceBecomes: string }
  | { kind: "auditAnchor"; contract: string; committer: string; digest: string }
  | { kind: "keyedAnchor"; contract: string; committer: string; key: string; digest: string };

/**
 * A sensitive invariant that must not change as a side effect of the
 * proposed action, identified by contract address and raw storage slot
 * (e.g. a proxy admin slot, or another spender's allowance).
 */
export interface WatchedInvariant {
  label: string;
  contractAddress: string;
  slot: string;
}

export interface TransferAction {
  kind: "transfer";
  chainId: string;
  to: string;
  valueEth: string;
  declaredEffect: DeclaredEffect;
  watchlist: WatchedInvariant[];
}

export interface ContractCallAction {
  kind: "contractCall";
  chainId: string;
  contractAddress: string;
  functionName: string;
  functionArgs: unknown[];
  /** Explicit ABI, required for contracts KeeperHub cannot auto-fetch (unverified on the block explorer). */
  abi?: string;
  declaredEffect: DeclaredEffect;
  watchlist: WatchedInvariant[];
}

export type ProposedAction = TransferAction | ContractCallAction;

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Standing rules enforced against the aggregated simulated state and a
 * session-level running tally, independent of what any single action
 * declares. See agent/src/invariants and docs/ARCHITECTURE.md.
 */
export interface MonitoredTokenBalance {
  label: string;
  token: string;
  owner: string;
}

export interface ApprovalCapPerSpender {
  token: string;
  capAmount: string;
}

export interface WatchedSlotInvariant {
  label: string;
  contractAddress: string;
  slot: string;
}

export interface InvariantConfig {
  monitoredTokenBalances: MonitoredTokenBalance[];
  approvalCapPerSpender: ApprovalCapPerSpender;
  watchedSlots: WatchedSlotInvariant[];
  cumulativeNetOutflowBoundWei: string;
}
