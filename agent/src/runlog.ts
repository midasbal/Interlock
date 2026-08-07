import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GateDecision } from "./types.js";

const RUNLOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "RUNLOG.md"
);

export function appendDecision(label: string, decision: GateDecision): void {
  const lines: string[] = [];
  lines.push("");
  lines.push(`## ${decision.timestamp}: gate decision, ${label}`);
  lines.push("");
  lines.push(
    `Action: transfer ${decision.action.valueEth} ETH on chain ${decision.action.chainId} to ${decision.action.to}`
  );
  lines.push("");
  lines.push(`Verdict: **${decision.allowed ? "ALLOWED" : "BLOCKED"}**, ${decision.reason}`);
  lines.push("");
  lines.push("Simulate result:");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(decision.simulate, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`Policy result: ${JSON.stringify(decision.policy)}`);

  if (decision.execution) {
    lines.push("");
    lines.push("Execution:");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(decision.execution, null, 2));
    lines.push("```");
    if (decision.execution.transactionLink) {
      lines.push("");
      lines.push(`Explorer link: ${decision.execution.transactionLink}`);
    }
  }

  if (decision.finalStatus) {
    lines.push("");
    lines.push("Final on-chain status:");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(decision.finalStatus, null, 2));
    lines.push("```");
  }

  lines.push("");
  appendFileSync(RUNLOG_PATH, lines.join("\n"));
}
