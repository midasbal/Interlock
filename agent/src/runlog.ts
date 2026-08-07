import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GateDecision } from "./types.js";
import { describeAction } from "./describeAction.js";

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
  lines.push(`Action: ${describeAction(decision.action)}`);
  lines.push("");
  lines.push(`Declared effect: ${JSON.stringify(decision.action.declaredEffect)}`);
  lines.push("");
  lines.push(`Verdict: **${decision.allowed ? "ALLOWED" : "BLOCKED"}**, ${decision.reason}`);
  lines.push("");
  lines.push(`Policy result: ${JSON.stringify(decision.policy)}`);

  if (decision.effectVerification) {
    lines.push("");
    lines.push(`Effect verification (declared vs. observed, verdict ${decision.effectVerification.verdict}):`);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(decision.effectVerification, null, 2));
    lines.push("```");
  } else {
    lines.push("");
    lines.push("Effect verification: skipped, blocked at policy before reaching this stage.");
  }

  if (decision.simulate) {
    lines.push("");
    lines.push("Simulate result:");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(decision.simulate, null, 2));
    lines.push("```");
  } else {
    lines.push("");
    lines.push("Simulate: skipped, blocked at an earlier stage before reaching this stage.");
  }

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
