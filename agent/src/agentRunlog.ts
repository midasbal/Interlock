import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AgentRunResult } from "./selfGateAgent.js";

const RUNLOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "RUNLOG.md"
);

export function appendAgentRun(label: string, run: AgentRunResult): void {
  const lines: string[] = [];
  lines.push("");
  lines.push(`## ${new Date().toISOString()}: self-gate agent run, ${label}`);
  lines.push("");
  lines.push(`Outcome: **${run.outcome}**`);
  lines.push("");

  for (const step of run.steps) {
    lines.push(`### Attempt ${step.attempt}`);
    lines.push("");
    lines.push(
      `Proposed: transfer ${step.action.valueEth} ETH on chain ${step.action.chainId} to ${step.action.to}`
    );
    lines.push("");
    lines.push(`Gate verdict: **${step.decision.allowed ? "ALLOWED" : "BLOCKED"}**, ${step.decision.reason}`);
    lines.push("");
    lines.push("Simulate result:");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(step.decision.simulate, null, 2));
    lines.push("```");
    lines.push("");
    lines.push(`Policy result: ${JSON.stringify(step.decision.policy)}`);
    lines.push("");
    lines.push(`Adaptation: ${step.adaptation}`);

    if (step.decision.execution) {
      lines.push("");
      lines.push("Execution:");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(step.decision.execution, null, 2));
      lines.push("```");
      if (step.decision.execution.transactionLink) {
        lines.push("");
        lines.push(`Explorer link: ${step.decision.execution.transactionLink}`);
      }
    }

    if (step.decision.finalStatus) {
      lines.push("");
      lines.push("Final on-chain status:");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(step.decision.finalStatus, null, 2));
      lines.push("```");
    }
    lines.push("");
  }

  appendFileSync(RUNLOG_PATH, lines.join("\n"));
}
