import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CHAIN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "docs",
  "audit-trail.jsonl"
);

export const GENESIS_HASH = "0".repeat(64);

export interface AuditEntry {
  seq: number;
  timestamp: string;
  type: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

function computeHash(seq: number, timestamp: string, type: string, payload: unknown, prevHash: string): string {
  const canonical = JSON.stringify({ seq, timestamp, type, payload, prevHash });
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

function readEntries(path: string = CHAIN_PATH): AuditEntry[] {
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AuditEntry);
}

function lastHash(entries: AuditEntry[]): string {
  return entries.length > 0 ? entries[entries.length - 1].hash : GENESIS_HASH;
}

/**
 * Appends one tamper-evident entry to the hash chain. Each entry's hash
 * covers its own content plus the previous entry's hash, so editing any
 * past entry, or reordering, or deleting one, breaks the chain from that
 * point forward, detectable by verifyChain.
 */
export function appendEntry(type: string, payload: unknown, path: string = CHAIN_PATH): AuditEntry {
  const entries = readEntries(path);
  const seq = entries.length;
  const prevHash = lastHash(entries);
  const timestamp = new Date().toISOString();
  const hash = computeHash(seq, timestamp, type, payload, prevHash);
  const entry: AuditEntry = { seq, timestamp, type, payload, prevHash, hash };
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function currentChainHead(path: string = CHAIN_PATH): string {
  return lastHash(readEntries(path));
}

export interface ChainVerificationResult {
  valid: boolean;
  entryCount: number;
  chainHead: string;
  brokenAt?: number;
  reason?: string;
}

/**
 * Recomputes the chain from the first entry and reports the first broken
 * link, if any: a hash that does not match its recomputed content, or a
 * prevHash that does not match the prior entry's actual hash.
 */
export function verifyChain(path: string = CHAIN_PATH): ChainVerificationResult {
  const entries = readEntries(path);

  let expectedPrevHash = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        entryCount: entries.length,
        chainHead: lastHash(entries),
        brokenAt: entry.seq,
        reason: `entry ${entry.seq} has prevHash "${entry.prevHash}", expected "${expectedPrevHash}" (the previous entry's actual hash)`,
      };
    }
    const recomputed = computeHash(entry.seq, entry.timestamp, entry.type, entry.payload, entry.prevHash);
    if (recomputed !== entry.hash) {
      return {
        valid: false,
        entryCount: entries.length,
        chainHead: lastHash(entries),
        brokenAt: entry.seq,
        reason: `entry ${entry.seq} has hash "${entry.hash}", recomputed "${recomputed}" from its own content, content was altered`,
      };
    }
    expectedPrevHash = entry.hash;
  }

  return { valid: true, entryCount: entries.length, chainHead: lastHash(entries) };
}
