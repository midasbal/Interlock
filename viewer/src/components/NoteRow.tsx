import { formatTimeOnly } from "../lib/format";
import { HexText } from "./HexText";
import "./NoteRow.css";

export function NoteRow({ seq, heading, note, timestamp }: { seq: number; heading: string; note: string; timestamp: string }) {
  return (
    <article className="note-row">
      <div className="note-row__meta">
        <span className="note-row__seq mono-num">{String(seq).padStart(3, "0")}</span>
        <span className="note-row__time mono-num">{formatTimeOnly(timestamp)}</span>
        <span className="note-row__kind">Operator note</span>
      </div>
      <h4 className="note-row__heading">{heading}</h4>
      <pre className="note-row__body">
        <HexText text={note} />
      </pre>
    </article>
  );
}
