/**
 * Mirrors the real shapes written by agent/src/*.ts and agent/src/reconciler/*.ts.
 * Every field here is optional wherever the source can omit it, so absence
 * in the trail renders as absence in the UI, never a fabricated default.
 */

export interface RawEntry {
  seq: number;
  timestamp: string;
  type: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

export type DeclaredEffect =
  | { kind: "nativeTransfer"; recipient: string; amountWei: string }
  | { kind: "erc20Approve"; token: string; owner: string; spender: string; allowanceBecomes: string }
  | { kind: "auditAnchor"; contract: string; committer: string; digest: string }
  | { kind: "keyedAnchor"; contract: string; committer: string; key: string; digest: string };

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
  abi?: string;
  declaredEffect: DeclaredEffect;
  watchlist: WatchedInvariant[];
}

export type ProposedAction = TransferAction | ContractCallAction;

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

export interface EffectVerificationResult {
  verdict: "match" | "mismatch";
  declared: DeclaredEffect;
  observed: Record<string, string>;
  deviations: string[];
  stateDiff?: unknown;
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

export interface SimulateResult {
  success: boolean;
  wouldRevert?: boolean;
  gasEstimate?: string;
  revertReason?: string;
  error?: string;
  code?: string;
}

export interface ExecutionRef {
  executionId: string;
  status: string;
  transactionHash?: string;
  transactionLink?: string;
}

export interface FinalStatus {
  executionId: string;
  status: string;
  transactionHash?: string;
  transactionLink?: string;
  error?: string | null;
  receipts?: Array<{
    hash: string;
    chainId: number;
    gasUsed?: string;
    verified: boolean;
    blockNumber?: number;
    receiptStatus: string;
  }>;
  createdAt?: string;
  completedAt?: string;
}

export interface GateDecision {
  action: ProposedAction;
  timestamp: string;
  frozen?: boolean;
  policy?: PolicyDecision;
  effectVerification?: EffectVerificationResult;
  invariants?: InvariantEvaluation;
  simulate?: SimulateResult;
  allowed: boolean;
  reason: string;
  execution?: ExecutionRef;
  finalStatus?: FinalStatus;
}

export interface GateDecisionPayload {
  label: string;
  decision: GateDecision;
}

export interface NotePayload {
  heading: string;
  note: string;
}

export interface OnChainMatch {
  hash: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string | null;
  path: "direct" | "wrapped";
  status: "success" | "reverted";
}

export interface OnChainDeviation {
  hash: string;
  blockNumber: number;
  timestamp: string;
  detail: string;
}

export interface ReconciliationDivergence {
  type: string;
  detail: string;
}

export interface ReconciliationItemPayload {
  seq: number;
  label: string;
  timestamp: string;
  action: { kind: string; summary: string };
  authorized: { executionId: string; reportedTransactionHash?: string };
  window: { fromBlock: number; toBlock: number };
  onChain: { exactMatches: OnChainMatch[]; deviations: OnChainDeviation[] };
  keeperHubReported: { status: string; transactionHash?: string; receiptStatus: string; error: string | null };
  verdict: string;
  divergences: ReconciliationDivergence[];
}

export interface ReconciliationReportPayload {
  generatedAt: string;
  walletAddress: string;
  itemCount: number;
  reconciledCount: number;
  divergentCount: number;
  items: ReconciliationItemPayload[];
}

export function isGateDecisionEntry(
  entry: RawEntry
): entry is RawEntry & { payload: GateDecisionPayload } {
  return entry.type === "gate-decision";
}

export function isNoteEntry(entry: RawEntry): entry is RawEntry & { payload: NotePayload } {
  return entry.type === "note";
}

export function isReconciliationReportEntry(
  entry: RawEntry
): entry is RawEntry & { payload: ReconciliationReportPayload } {
  return entry.type === "reconciliation-report";
}

export function isReconciliationItemEntry(
  entry: RawEntry
): entry is RawEntry & { payload: ReconciliationItemPayload } {
  return entry.type === "reconciliation-item";
}
