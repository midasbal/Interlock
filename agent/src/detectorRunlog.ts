import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DetectorEvent } from "./detector/proxyImplementationDetector.js";

const RUNLOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "RUNLOG.md"
);

export function appendDetectorEvent(label: string, event: DetectorEvent): void {
  const lines: string[] = [];
  lines.push("");
  lines.push(`### ${event.timestamp}: detector, ${label}, ${event.kind}`);
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(event, null, 2));
  lines.push("```");
  lines.push("");
  appendFileSync(RUNLOG_PATH, lines.join("\n"));
}

export function appendNote(heading: string, note: string): void {
  appendFileSync(RUNLOG_PATH, `\n## ${heading}\n\n${note}\n`);
}
