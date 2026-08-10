import { Fragment } from "react";
import { truncateForDisplay } from "../lib/format";
import "./HexText.css";

const HEX_RUN = /0x[0-9a-fA-F]{8,}/g;

/**
 * Renders prose that may contain embedded hex values (addresses, storage
 * slots, transaction hashes) so a long run never forces the container wider
 * than it is: each hex run is truncated in the middle with the full value
 * available on hover, via the native title attribute. Everything else in
 * the string renders untouched.
 */
export function HexText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  HEX_RUN.lastIndex = 0;
  while ((match = HEX_RUN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const value = match[0];
    if (value.length > 18) {
      parts.push(
        <span className="hex-inline mono-num" title={value} key={key++}>
          {truncateForDisplay(value)}
        </span>
      );
    } else {
      parts.push(<Fragment key={key++}>{value}</Fragment>);
    }
    lastIndex = match.index + value.length;
  }
  if (lastIndex < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return <>{parts}</>;
}
