import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ReconciliationItem, ReconciliationReport } from "./reconciler/reconciler.js";
import { appendEntry } from "./auditTrail/chain.js";

const RUNLOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "RUNLOG.md");

function itemLines(item: ReconciliationItem): string[] {
  const lines: string[] = [];
  lines.push(`Action: ${item.action.summary}`);
  lines.push("");
  lines.push(
    `Authorized: executionId ${item.authorized.executionId}, reported hash ${item.authorized.reportedTransactionHash ?? "none"}`
  );
  lines.push("");
  lines.push(`On-chain search window: blocks ${item.window.fromBlock} to ${item.window.toBlock}`);
  lines.push("");
  lines.push(`On-chain exact matches (${item.onChain.exactMatches.length}):`);
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(item.onChain.exactMatches, null, 2));
  lines.push("```");

  if (item.onChain.deviations.length > 0) {
    lines.push("");
    lines.push(`On-chain deviating candidates (${item.onChain.deviations.length}):`);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(item.onChain.deviations, null, 2));
    lines.push("```");
  }

  lines.push("");
  lines.push("KeeperHub reported:");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(item.keeperHubReported, null, 2));
  lines.push("```");

  if (item.divergences.length > 0) {
    lines.push("");
    lines.push("Divergences:");
    for (const divergence of item.divergences) {
      lines.push(`- **${divergence.type}**: ${divergence.detail}`);
    }
  }
  return lines;
}

export function appendReconciliationReport(report: ReconciliationReport): void {
  appendEntry("reconciliation-report", report);

  const lines: string[] = [];
  lines.push("");
  lines.push(`## ${report.generatedAt}: post-execution reconciliation`);
  lines.push("");
  lines.push(
    `Wallet ${report.walletAddress}, ${report.itemCount} authorized-and-executed decisions checked: ${report.reconciledCount} reconciled cleanly, ${report.divergentCount} flagged.`
  );

  for (const item of report.items) {
    lines.push("");
    lines.push(`### seq ${item.seq}, ${item.label}: ${item.verdict}`);
    lines.push("");
    lines.push(...itemLines(item));
  }

  lines.push("");
  appendFileSync(RUNLOG_PATH, lines.join("\n"));
}

/** Appends a single post-execution reconciliation check, for the optional gate-side mode in agent/src/reconciler/postExecutionCheck.ts, hash-chained the same as a full report. */
export function appendReconciliationItem(item: ReconciliationItem): void {
  appendEntry("reconciliation-item", item);

  const lines: string[] = [];
  lines.push("");
  lines.push(`## ${item.timestamp}: post-execution reconciliation, ${item.label}: ${item.verdict}`);
  lines.push("");
  lines.push(...itemLines(item));
  lines.push("");
  appendFileSync(RUNLOG_PATH, lines.join("\n"));
}
