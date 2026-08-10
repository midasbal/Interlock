import { explorerTxUrl, truncateForDisplay } from "../lib/format";
import { ExternalLinkIcon } from "./icons";
import "./HashValue.css";

interface Props {
  value: string;
  kind: "tx" | "address";
  linkToExplorer?: boolean;
}

export function HashValue({ value, kind, linkToExplorer }: Props) {
  const truncated = truncateForDisplay(value);

  if (linkToExplorer && kind === "tx") {
    return (
      <a
        className="hash-value hash-value--link"
        href={explorerTxUrl(value)}
        target="_blank"
        rel="noreferrer noopener"
        title={value}
      >
        <span className="mono-num">{truncated}</span>
        <ExternalLinkIcon />
      </a>
    );
  }

  return (
    <span className="hash-value mono-num" title={value}>
      {truncated}
    </span>
  );
}
