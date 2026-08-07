import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const POLICY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "policy");

/**
 * A deterministic digest over the exact governing configuration: the raw
 * bytes of policy.json and invariants.json as they exist on disk right now.
 * Any edit to either file changes this digest.
 */
export function computePolicyConfigDigest(): string {
  const policyRaw = readFileSync(join(POLICY_DIR, "policy.json"), "utf-8");
  const invariantsRaw = readFileSync(join(POLICY_DIR, "invariants.json"), "utf-8");
  return createHash("sha256").update(`${policyRaw}\n---\n${invariantsRaw}`, "utf-8").digest("hex");
}
