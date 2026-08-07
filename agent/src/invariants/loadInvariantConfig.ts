import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { InvariantConfig } from "../../../policy/types.js";

const DEFAULT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "policy",
  "invariants.json"
);

export function loadInvariantConfig(path: string = DEFAULT_PATH): InvariantConfig {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as InvariantConfig;
}
