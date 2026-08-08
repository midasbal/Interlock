import { readChain } from "../auditTrail/chain.js";
import { describeAction } from "../describeAction.js";
import {
  encodeAddress,
  encodeAnchorCalldata,
  encodeAnchorKeyedCalldata,
  encodeApproveCalldata,
  encodeUint256,
} from "../effectVerifier/abiEncoding.js";
import type { KeeperHubClient, ExecutionStatus } from "../keeperhub/types.js";
import type { GateDecision } from "../types.js";
import type { DeclaredEffect, ProposedAction } from "../../../policy/types.js";
import {
  blockAtOrAfter,
  getReceiptStatus,
  getTransactionsInRange,
  latestBlockNumber,
  type OnChainTx,
} from "./onChainSearch.js";

// How far outside a decision's own recorded timestamps to search on-chain,
// wide enough to catch a duplicate or late-confirming broadcast that lands
// slightly before the decision started or after KeeperHub reported it done
// (both observed for real, see docs/RUNLOG.md), narrow enough to keep the
// scan bounded and not spill into an unrelated neighboring action.
const WINDOW_BUFFER_BEFORE_SEC = 15;
const WINDOW_BUFFER_AFTER_SEC = 45;

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

export interface ReconciliationItem {
  seq: number;
  label: string;
  timestamp: string;
  action: { kind: string; summary: string };
  authorized: { executionId: string; reportedTransactionHash?: string };
  window: { fromBlock: number; toBlock: number };
  onChain: { exactMatches: OnChainMatch[]; deviations: OnChainDeviation[] };
  keeperHubReported: {
    status: string;
    transactionHash?: string;
    receiptStatus: string;
    error: string | null;
  };
  verdict: string;
  divergences: ReconciliationDivergence[];
}

export interface ReconciliationReport {
  generatedAt: string;
  walletAddress: string;
  itemCount: number;
  reconciledCount: number;
  divergentCount: number;
  items: ReconciliationItem[];
}

function stripHexPrefix(hex: string): string {
  return hex.replace(/^0x/i, "").toLowerCase();
}

type ClassifyResult = { kind: "match"; path: "direct" | "wrapped" } | { kind: "deviation"; detail: string } | null;

/**
 * Classifies one on-chain transaction against one declared nativeTransfer
 * effect. Handles both a plain direct transfer from the wallet and a
 * sponsored, wrapped call: KeeperHub's sponsored wrapper consistently embeds
 * the wallet address, then the target address, then the value, as three
 * consecutive 32-byte words, confirmed across every sponsored transfer,
 * approve, and anchor call inspected during the 2026-08-08 investigation.
 * This locates those words by searching for the wallet's own address rather
 * than assuming any particular function selector, so it does not depend on
 * KeeperHub's router implementation staying the same.
 */
function classifyNativeTransferTx(
  tx: OnChainTx,
  wallet: string,
  declared: Extract<DeclaredEffect, { kind: "nativeTransfer" }>
): ClassifyResult {
  const inputNo0x = stripHexPrefix(tx.input);
  const walletLower = wallet.toLowerCase();

  if (inputNo0x.length === 0) {
    if (tx.from.toLowerCase() !== walletLower) {
      return null;
    }
    const recipientMatches = (tx.to ?? "").toLowerCase() === declared.recipient.toLowerCase();
    const amountMatches = BigInt(tx.value || "0x0") === BigInt(declared.amountWei);
    if (recipientMatches && amountMatches) {
      return { kind: "match", path: "direct" };
    }
    if (recipientMatches || amountMatches) {
      return {
        kind: "deviation",
        detail: `direct transfer from the wallet to ${tx.to}, value ${BigInt(tx.value || "0x0")} wei, declared effect said recipient ${declared.recipient}, amount ${declared.amountWei} wei`,
      };
    }
    return null;
  }

  const walletWord = encodeAddress(wallet);
  const walletIdx = inputNo0x.indexOf(walletWord);
  if (walletIdx === -1) {
    return null;
  }
  const targetWord = inputNo0x.slice(walletIdx + 64, walletIdx + 128);
  const valueWord = inputNo0x.slice(walletIdx + 128, walletIdx + 192);
  const recipientWord = encodeAddress(declared.recipient);
  const amountWord = encodeUint256(declared.amountWei);

  const recipientMatches = targetWord === recipientWord;
  const amountMatches = valueWord === amountWord;
  if (recipientMatches && amountMatches) {
    return { kind: "match", path: "wrapped" };
  }
  if (recipientMatches || amountMatches) {
    return {
      kind: "deviation",
      detail: `wrapped call referencing this wallet with target word ${targetWord} and value word ${valueWord}, declared effect said recipient ${declared.recipient}, amount ${declared.amountWei} wei`,
    };
  }
  return null;
}

interface InnerCallInfo {
  contractAddress: string;
  calldata: string;
  /**
   * Index, among the arguments after the selector, of this function's
   * address-typed identity argument (e.g. approve's spender), the same role
   * recipient plays for a native transfer. Only an address-typed argument is
   * treated as identity: it is effectively unique per real-world action in
   * this project's data, where round-number amounts and reused digests are
   * common across otherwise-unrelated actions. Null for functions with no
   * address-typed argument (the anchor calls), where a same-contract,
   * non-identical call is simply a different, unrelated commit, not a
   * deviation of this one, see the honest limits in the write-up.
   */
  identityArgIndex: number | null;
}

function buildInnerCalldata(declared: DeclaredEffect): InnerCallInfo | null {
  if (declared.kind === "erc20Approve") {
    return {
      contractAddress: declared.token,
      calldata: encodeApproveCalldata(declared.spender, declared.allowanceBecomes),
      identityArgIndex: 0,
    };
  }
  if (declared.kind === "auditAnchor") {
    return { contractAddress: declared.contract, calldata: encodeAnchorCalldata(declared.digest), identityArgIndex: null };
  }
  if (declared.kind === "keyedAnchor") {
    return {
      contractAddress: declared.contract,
      calldata: encodeAnchorKeyedCalldata(declared.key, declared.digest),
      identityArgIndex: null,
    };
  }
  return null;
}

/** Splits ABI-encoded calldata after its 4-byte selector into 32-byte argument words. Only valid for functions whose arguments are all fixed-size (address, uint256, bytes32), true for every function this project's gate calls. */
function argWordsOf(calldataNo0x: string): string[] {
  const body = calldataNo0x.slice(8);
  const words: string[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) {
    words.push(body.slice(i, i + 64));
  }
  return words;
}

/**
 * Classifies one on-chain transaction against one declared contract-call
 * effect (approve, anchor, or keyed anchor). The inner calldata is built
 * with the same standard ABI encoders the effect verifier itself uses
 * (agent/src/effectVerifier/abiEncoding.ts), so this never re-derives or
 * hardcodes a function selector of its own. A direct call is matched
 * exactly; a wrapped call is matched by finding the wallet's address in the
 * calldata (the same structural convention as the transfer case), checking
 * the following word is the declared target contract, and then checking
 * whether the full inner calldata appears verbatim afterward.
 *
 * A same-contract, same-function call that is not an exact match is only
 * reported as a deviation of this specific action if it shares the
 * function's address-typed identity argument (e.g. the same spender): this
 * project's own data has many independent, legitimate actions on the same
 * token contract with reused round-number amounts, so amount overlap alone
 * is not a reliable signal, only address overlap is.
 */
function classifyContractCallTx(tx: OnChainTx, wallet: string, declared: DeclaredEffect): ClassifyResult {
  const inner = buildInnerCalldata(declared);
  if (!inner) {
    return null;
  }
  const innerNo0x = stripHexPrefix(inner.calldata);
  const selectorNo0x = innerNo0x.slice(0, 8);
  const declaredArgWords = argWordsOf(innerNo0x);
  const inputNo0x = stripHexPrefix(tx.input);
  const walletLower = wallet.toLowerCase();

  const isDirectTarget = (tx.to ?? "").toLowerCase() === inner.contractAddress.toLowerCase();
  if (isDirectTarget && tx.from.toLowerCase() === walletLower) {
    if (inputNo0x === innerNo0x) {
      return { kind: "match", path: "direct" };
    }
    if (inner.identityArgIndex === null || !inputNo0x.startsWith(selectorNo0x)) {
      return null;
    }
    const actualArgWords = argWordsOf(inputNo0x);
    if (actualArgWords[inner.identityArgIndex] !== declaredArgWords[inner.identityArgIndex]) {
      return null;
    }
    return {
      kind: "deviation",
      detail: `direct call to ${inner.contractAddress}, same function and same identity argument, but the full arguments differ: actual ${tx.input}, declared 0x${innerNo0x}`,
    };
  }

  const walletWord = encodeAddress(wallet);
  const walletIdx = inputNo0x.indexOf(walletWord);
  if (walletIdx === -1) {
    return null;
  }
  const targetWord = inputNo0x.slice(walletIdx + 64, walletIdx + 128);
  const contractWord = encodeAddress(inner.contractAddress);
  if (targetWord !== contractWord) {
    return null;
  }
  if (inputNo0x.includes(innerNo0x)) {
    return { kind: "match", path: "wrapped" };
  }
  if (inner.identityArgIndex === null) {
    return null;
  }
  const identityWord = declaredArgWords[inner.identityArgIndex];
  if (!inputNo0x.includes(selectorNo0x) || !inputNo0x.includes(identityWord)) {
    return null;
  }
  return {
    kind: "deviation",
    detail: `wrapped call to the declared contract from this wallet with the declared function selector and identity argument both present, but the full encoded call is not found verbatim in the calldata`,
  };
}

function windowBoundsSeconds(decision: GateDecision): { startSec: number; endSec: number } {
  const decisionMs = Date.parse(decision.timestamp);
  const createdMs = decision.finalStatus?.createdAt ? Date.parse(decision.finalStatus.createdAt) : decisionMs;
  const completedMs = decision.finalStatus?.completedAt
    ? Date.parse(decision.finalStatus.completedAt)
    : decisionMs + 60_000;
  const startMs = Math.min(decisionMs, createdMs) - WINDOW_BUFFER_BEFORE_SEC * 1000;
  const endMs = completedMs + WINDOW_BUFFER_AFTER_SEC * 1000;
  return { startSec: Math.floor(startMs / 1000), endSec: Math.ceil(endMs / 1000) };
}

async function safeGetExecutionStatus(
  client: KeeperHubClient,
  executionId: string | undefined
): Promise<ExecutionStatus | null> {
  if (!executionId) {
    return null;
  }
  try {
    return await client.getExecutionStatus(executionId);
  } catch {
    return null;
  }
}

/**
 * Reconciles one authorized-and-executed gate decision against two
 * independent sources: a live on-chain search for transactions matching its
 * declared effect, and a live call to KeeperHub's own execution status for
 * the execution it ran. Neither source is trusted on its own, this is what
 * lets the reconciler catch KeeperHub itself misreporting an execution it
 * ran, not only a mismatch between our own record and the chain.
 */
export async function reconcileEntry(
  seq: number,
  label: string,
  decision: GateDecision,
  client: KeeperHubClient,
  walletAddress: string,
  latest: number,
  reportedHashOwner: Map<string, number> = new Map()
): Promise<ReconciliationItem> {
  const action: ProposedAction = decision.action;
  const declared = action.declaredEffect;
  const { startSec, endSec } = windowBoundsSeconds(decision);
  const fromBlock = await blockAtOrAfter(startSec, latest);
  const toBlockRaw = await blockAtOrAfter(endSec, latest);
  const toBlock = Math.min(toBlockRaw + 2, latest);

  const txs = await getTransactionsInRange(fromBlock, toBlock);
  const reportedHash = decision.execution?.transactionHash;

  const rawMatches: Array<{ tx: OnChainTx; path: "direct" | "wrapped" }> = [];
  const deviations: OnChainDeviation[] = [];

  for (const tx of txs) {
    const owner = reportedHashOwner.get(tx.hash.toLowerCase());
    if (owner !== undefined && owner !== seq && tx.hash.toLowerCase() !== (reportedHash ?? "").toLowerCase()) {
      // This transaction is the hash KeeperHub itself reported for a
      // different authorization. Two authorizations can share an identical
      // declared effect (this project's data does, deliberately), which
      // would otherwise make this decision look like it has an extra
      // broadcast when the extra one is really the sibling's own landed
      // transaction. Only an on-chain transaction nobody claims counts as
      // evidence of a real duplicate broadcast on this decision.
      continue;
    }
    const result =
      declared.kind === "nativeTransfer" && action.kind === "transfer"
        ? classifyNativeTransferTx(tx, walletAddress, declared)
        : classifyContractCallTx(tx, walletAddress, declared);
    if (!result) {
      continue;
    }
    if (result.kind === "match") {
      rawMatches.push({ tx, path: result.path });
    } else {
      deviations.push({
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        timestamp: new Date(tx.timestamp * 1000).toISOString(),
        detail: result.detail,
      });
    }
  }

  const exactMatches: OnChainMatch[] = [];
  for (const { tx, path } of rawMatches) {
    const receipt = await getReceiptStatus(tx.hash);
    exactMatches.push({
      hash: tx.hash,
      blockNumber: tx.blockNumber,
      timestamp: new Date(tx.timestamp * 1000).toISOString(),
      from: tx.from,
      to: tx.to,
      path,
      status: receipt.status ?? "reverted",
    });
  }

  const keeperHubLive = await safeGetExecutionStatus(client, decision.execution?.executionId);
  const reportedReceipt = reportedHash ? await getReceiptStatus(reportedHash) : { found: false as const };

  const divergences: ReconciliationDivergence[] = [];

  if (exactMatches.length === 0) {
    divergences.push({
      type: "unmatched-authorization",
      detail: `no on-chain transaction in blocks ${fromBlock}-${toBlock} independently satisfies the declared effect`,
    });
  } else if (exactMatches.length > 1) {
    divergences.push({
      type: "duplicate-broadcast",
      detail: `${exactMatches.length} distinct on-chain transactions independently satisfy this single authorization: ${exactMatches
        .map((m) => `${m.hash} (block ${m.blockNumber})`)
        .join(", ")}`,
    });
  }

  for (const deviation of deviations) {
    divergences.push({
      type: "amount-or-recipient-mismatch",
      detail: `${deviation.hash} (block ${deviation.blockNumber}): ${deviation.detail}`,
    });
  }

  const keeperSaysFinal = keeperHubLive?.status ?? decision.finalStatus?.status ?? "unknown";
  if (reportedHash) {
    if (reportedReceipt.found) {
      const keeperSaysSuccess = keeperSaysFinal === "completed";
      const keeperSaysFailed = keeperSaysFinal === "failed";
      if (keeperSaysFailed && reportedReceipt.status === "success") {
        divergences.push({
          type: "status-divergence",
          detail: `KeeperHub reports execution ${decision.execution?.executionId} as "failed" for ${reportedHash}, but the chain shows it succeeded in block ${reportedReceipt.blockNumber}`,
        });
      } else if (keeperSaysSuccess && reportedReceipt.status === "reverted") {
        divergences.push({
          type: "status-divergence",
          detail: `KeeperHub reports execution ${decision.execution?.executionId} as "completed" for ${reportedHash}, but the chain shows it reverted in block ${reportedReceipt.blockNumber}`,
        });
      }
    } else if (keeperSaysFinal === "completed") {
      divergences.push({
        type: "status-divergence",
        detail: `KeeperHub reports execution ${decision.execution?.executionId} as "completed" with transaction hash ${reportedHash}, but that hash has no receipt on chain`,
      });
    }
  }

  const verdict = divergences.length === 0 ? "reconciled" : divergences.map((d) => d.type).join(", ");

  return {
    seq,
    label,
    timestamp: decision.timestamp,
    action: { kind: action.kind, summary: describeAction(action) },
    authorized: { executionId: decision.execution?.executionId ?? "", reportedTransactionHash: reportedHash },
    window: { fromBlock, toBlock },
    onChain: { exactMatches, deviations },
    keeperHubReported: {
      status: keeperSaysFinal,
      transactionHash: keeperHubLive?.transactionHash ?? reportedHash,
      receiptStatus: reportedReceipt.found ? (reportedReceipt.status ?? "reverted") : "not_found",
      error: keeperHubLive?.error ?? null,
    },
    verdict,
    divergences,
  };
}

/**
 * Reconciles every authorized-and-executed decision currently in the audit
 * trail. Runs sequentially, not in parallel, so nearby windows share the
 * on-chain block cache in agent/src/reconciler/onChainSearch.ts instead of
 * re-fetching the same blocks for adjacent decisions.
 */
export async function reconcileHistory(client: KeeperHubClient, walletAddress: string): Promise<ReconciliationReport> {
  const entries = readChain();
  const latest = await latestBlockNumber();

  const targets: Array<{ seq: number; label: string; decision: GateDecision }> = [];
  for (const entry of entries) {
    if (entry.type !== "gate-decision") {
      continue;
    }
    const payload = entry.payload as { label: string; decision: GateDecision };
    if (!payload.decision.allowed || !payload.decision.execution) {
      continue;
    }
    targets.push({ seq: entry.seq, label: payload.label, decision: payload.decision });
  }

  const reportedHashOwner = new Map<string, number>();
  for (const target of targets) {
    const hash = target.decision.execution?.transactionHash;
    if (hash) {
      reportedHashOwner.set(hash.toLowerCase(), target.seq);
    }
  }

  const items: ReconciliationItem[] = [];
  for (const target of targets) {
    items.push(
      await reconcileEntry(target.seq, target.label, target.decision, client, walletAddress, latest, reportedHashOwner)
    );
  }

  const divergentCount = items.filter((item) => item.divergences.length > 0).length;
  return {
    generatedAt: new Date().toISOString(),
    walletAddress,
    itemCount: items.length,
    reconciledCount: items.length - divergentCount,
    divergentCount,
    items,
  };
}

/** Reconciles a single decision, not read from the chain, for use right after gate.run() returns. */
export async function reconcileDecision(
  label: string,
  decision: GateDecision,
  client: KeeperHubClient,
  walletAddress: string
): Promise<ReconciliationItem> {
  const latest = await latestBlockNumber();
  return reconcileEntry(-1, label, decision, client, walletAddress, latest);
}
