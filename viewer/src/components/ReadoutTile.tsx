import "./ReadoutTile.css";

interface Props {
  label: string;
  value: number;
  tone?: "ivory" | "clear" | "danger" | "anomaly";
  sub?: string;
}

export function ReadoutTile({ label, value, tone = "ivory", sub }: Props) {
  return (
    <div className={`readout readout--${tone}`}>
      <span className="readout__value mono-num">{value}</span>
      <span className="readout__label">{label}</span>
      {sub ? <span className="readout__sub">{sub}</span> : null}
    </div>
  );
}
