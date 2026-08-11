import type { RawEntry, ReconciliationItemPayload } from "../lib/types";
import {
  isGateDecisionEntry,
  isNoteEntry,
  isReconciliationItemEntry,
  isReconciliationReportEntry,
  isWorkflowGateStageEntry,
} from "../lib/types";
import { GateStageRow } from "./GateStageRow";
import { NoteRow } from "./NoteRow";
import { RouteRow } from "./RouteRow";
import { SweepItemRow, SweepReportRow } from "./SweepRow";
import "./RouteLog.css";

interface Props {
  entries: RawEntry[];
  reconciliationIndex: Map<number, ReconciliationItemPayload>;
  revealed: boolean;
  reducedMotion: boolean;
}

const MAX_STAGGER_MS = 420;

export function RouteLog({ entries, reconciliationIndex, revealed, reducedMotion }: Props) {
  if (entries.length === 0) {
    return (
      <div className="route-log__empty">
        <p>The trail is empty. Nothing has been authorized yet.</p>
      </div>
    );
  }

  return (
    <div className="route-log" role="list" aria-label="Audit trail route log">
      {entries.map((entry, index) => {
        const delay = reducedMotion ? 0 : Math.min(index * 14, MAX_STAGGER_MS);
        const style: React.CSSProperties = {
          transitionDelay: revealed ? `${delay}ms` : "0ms",
        };

        if (isGateDecisionEntry(entry)) {
          return (
            <RouteLogItem key={entry.seq} revealed={revealed} style={style}>
              <RouteRow
                seq={entry.seq}
                label={entry.payload.label}
                decision={entry.payload.decision}
                reconciliationItem={reconciliationIndex.get(entry.seq)}
                reducedMotion={reducedMotion}
              />
            </RouteLogItem>
          );
        }

        if (isNoteEntry(entry)) {
          return (
            <RouteLogItem key={entry.seq} revealed={revealed} style={style}>
              <NoteRow seq={entry.seq} heading={entry.payload.heading} note={entry.payload.note} timestamp={entry.timestamp} />
            </RouteLogItem>
          );
        }

        if (isWorkflowGateStageEntry(entry)) {
          return (
            <RouteLogItem key={entry.seq} revealed={revealed} style={style}>
              <GateStageRow seq={entry.seq} timestamp={entry.timestamp} payload={entry.payload} />
            </RouteLogItem>
          );
        }

        if (isReconciliationReportEntry(entry)) {
          return (
            <RouteLogItem key={entry.seq} revealed={revealed} style={style}>
              <SweepReportRow seq={entry.seq} timestamp={entry.timestamp} report={entry.payload} />
            </RouteLogItem>
          );
        }

        if (isReconciliationItemEntry(entry)) {
          return (
            <RouteLogItem key={entry.seq} revealed={revealed} style={style}>
              <SweepItemRow seq={entry.seq} item={entry.payload} />
            </RouteLogItem>
          );
        }

        return (
          <RouteLogItem key={entry.seq} revealed={revealed} style={style}>
            <div className="route-log__unknown">
              Entry {entry.seq}: unrecognized type "{entry.type}", rendered as raw data below.
              <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
            </div>
          </RouteLogItem>
        );
      })}
    </div>
  );
}

function RouteLogItem({ children, revealed, style }: { children: React.ReactNode; revealed: boolean; style: React.CSSProperties }) {
  return (
    <div className={`route-log__item ${revealed ? "route-log__item--revealed" : ""}`} style={style} role="listitem">
      {children}
    </div>
  );
}
