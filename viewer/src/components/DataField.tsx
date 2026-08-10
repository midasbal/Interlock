import "./DataField.css";

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

export function DataField({ label, value, mono = true }: FieldProps) {
  return (
    <div className="data-field">
      <span className="data-field__label">{label}</span>
      <span className={mono ? "data-field__value mono-num" : "data-field__value"}>{value}</span>
    </div>
  );
}

export function DataFieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="data-field-grid">{children}</div>;
}
