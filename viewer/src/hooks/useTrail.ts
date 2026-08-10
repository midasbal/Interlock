import { useEffect, useState } from "react";
import type { RawEntry } from "../lib/types";
import { verifyChain, type ChainVerificationResult } from "../lib/hashChain";

export type TrailPhase = "loading" | "verifying" | "ready" | "error";

export interface TrailState {
  phase: TrailPhase;
  entries: RawEntry[];
  integrity: ChainVerificationResult | null;
  error: string | null;
}

/**
 * Loads the real trail file copied into public/ by scripts/copy-trail.mjs
 * and independently recomputes the hash chain in the browser, the same
 * algorithm agent/src/auditTrail/chain.ts uses. Nothing here is a
 * placeholder result: a fetch failure or an empty trail is reported as
 * such, never silently replaced with sample data.
 */
export function useTrail(): TrailState {
  const [state, setState] = useState<TrailState>({
    phase: "loading",
    entries: [],
    integrity: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audit-trail.jsonl`);
        if (!response.ok) {
          throw new Error(
            `audit-trail.jsonl not found (${response.status}). Run "npm run build" or "npm run dev" from viewer/ so the prebuild step can copy it from docs/.`
          );
        }
        const text = await response.text();
        const entries: RawEntry[] = text
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as RawEntry);

        if (cancelled) return;
        setState({ phase: "verifying", entries, integrity: null, error: null });

        const reducedMotion =
          typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // The real verification of 145+ entries can finish in well under a
        // second. This floor only makes the self-test visible, it never
        // changes or delays the actual result.
        const minDisplayMs = reducedMotion ? 0 : 550;
        const started = performance.now();

        const integrity = await verifyChain(entries);
        const elapsed = performance.now() - started;
        if (elapsed < minDisplayMs) {
          await new Promise((resolve) => window.setTimeout(resolve, minDisplayMs - elapsed));
        }
        if (cancelled) return;
        setState({ phase: "ready", entries, integrity, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          entries: [],
          integrity: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
