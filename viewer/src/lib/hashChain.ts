import type { RawEntry } from "./types";

export const GENESIS_HASH = "0".repeat(64);

export interface ChainVerificationResult {
  valid: boolean;
  entryCount: number;
  chainHead: string;
  brokenAt?: number;
  reason?: string;
}

/**
 * Byte-for-byte the same hash agent/src/auditTrail/chain.ts computes:
 * sha256 over the canonical JSON of { seq, timestamp, type, payload, prevHash },
 * this exact key order. JSON.parse then JSON.stringify preserves the source
 * file's own key insertion order in both Node and the browser, so this
 * recomputes the identical digest Node produced when the entry was written.
 */
async function computeHash(entry: Pick<RawEntry, "seq" | "timestamp" | "type" | "payload" | "prevHash">): Promise<string> {
  const canonical = JSON.stringify({
    seq: entry.seq,
    timestamp: entry.timestamp,
    type: entry.type,
    payload: entry.payload,
    prevHash: entry.prevHash,
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Recomputes the whole chain from entry zero and reports the first entry
 * whose stored hash does not match its recomputed content, or whose
 * prevHash does not match the entry before it. Same algorithm as
 * agent/src/audit-verify.ts, run here client-side against the real file.
 */
export async function verifyChain(entries: RawEntry[]): Promise<ChainVerificationResult> {
  let expectedPrevHash = GENESIS_HASH;

  for (const entry of entries) {
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        entryCount: entries.length,
        chainHead: entries[entries.length - 1]?.hash ?? GENESIS_HASH,
        brokenAt: entry.seq,
        reason: `entry ${entry.seq} has prevHash "${entry.prevHash}", expected "${expectedPrevHash}" (the previous entry's actual hash)`,
      };
    }
    const recomputed = await computeHash(entry);
    if (recomputed !== entry.hash) {
      return {
        valid: false,
        entryCount: entries.length,
        chainHead: entries[entries.length - 1]?.hash ?? GENESIS_HASH,
        brokenAt: entry.seq,
        reason: `entry ${entry.seq} has hash "${entry.hash}", recomputed "${recomputed}" from its own content, content was altered`,
      };
    }
    expectedPrevHash = entry.hash;
  }

  return {
    valid: true,
    entryCount: entries.length,
    chainHead: entries[entries.length - 1]?.hash ?? GENESIS_HASH,
  };
}
