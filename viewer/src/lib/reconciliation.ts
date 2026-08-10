import {
  isReconciliationItemEntry,
  isReconciliationReportEntry,
  type RawEntry,
  type ReconciliationItemPayload,
} from "./types";

/**
 * Every reconciliation-report entry carries its own items, each recording
 * the gate-decision seq it checked. This builds a real, sourced link from a
 * gate-decision row back to the reconciliation item that examined it, so a
 * divergence found by reconciliation can be shown directly against the
 * route it concerns, not just in a separate report. A standalone
 * reconciliation-item entry (the live post-execution mode) links the same
 * way when it carries a real seq, seq -1 marks an ad hoc check with nothing
 * in the trail to link to, and is left unlinked rather than guessed.
 */
export function buildReconciliationIndex(entries: RawEntry[]): Map<number, ReconciliationItemPayload> {
  const index = new Map<number, ReconciliationItemPayload>();

  for (const entry of entries) {
    if (isReconciliationReportEntry(entry)) {
      for (const item of entry.payload.items) {
        if (item.divergences.length > 0 && item.seq >= 0) {
          index.set(item.seq, item);
        }
      }
    }
    if (isReconciliationItemEntry(entry)) {
      const item = entry.payload;
      if (item.divergences.length > 0 && item.seq >= 0) {
        index.set(item.seq, item);
      }
    }
  }

  return index;
}
