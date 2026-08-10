import { declaredEffectFields, declaredEffectKindLabel, humanizeFieldLabel } from "../lib/describe";
import { weiToEth } from "../lib/format";
import type {
  EffectVerificationResult,
  ExecutionRef,
  FinalStatus,
  InvariantEvaluation,
  PolicyDecision,
  SimulateResult,
} from "../lib/types";
import { DataField, DataFieldGrid } from "./DataField";
import { HashValue } from "./HashValue";
import { HexText } from "./HexText";
import "./EvidencePanels.css";

function isAddressLike(key: string, value: string): boolean {
  return /address|owner|spender|recipient|committer|token|contract/i.test(key) && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isWeiLike(key: string): boolean {
  return /wei/i.test(key);
}

function isLongHex(value: string): boolean {
  return /^0x[0-9a-fA-F]{8,}$/.test(value) && value.length > 18;
}

function renderFieldValue(key: string, value: string) {
  if (isAddressLike(key, value)) return <HashValue value={value} kind="address" />;
  if (isWeiLike(key)) return <span className="mono-num">{weiToEth(value)}</span>;
  if (isLongHex(value)) return <HashValue value={value} kind="address" />;
  return <span className="mono-num">{value}</span>;
}

export function EvidenceSection({ title, tone, children }: { title: string; tone?: "danger" | "clear"; children: React.ReactNode }) {
  return (
    <section className={`evidence-section ${tone ? `evidence-section--${tone}` : ""}`}>
      <h3 className="evidence-section__title">{title}</h3>
      <div className="evidence-section__body">{children}</div>
    </section>
  );
}

export function PolicyPanel({ policy }: { policy: PolicyDecision }) {
  return (
    <EvidenceSection title="Policy" tone={policy.allowed ? "clear" : "danger"}>
      <p className="evidence-reason">
        <HexText text={policy.reason} />
      </p>
    </EvidenceSection>
  );
}

export function EffectPanel({ effect }: { effect: EffectVerificationResult }) {
  return (
    <EvidenceSection title="Effect verification" tone={effect.verdict === "match" ? "clear" : "danger"}>
      <p className="evidence-kicker">
        Declared effect: <strong>{declaredEffectKindLabel(effect.declared.kind)}</strong>
      </p>
      <DataFieldGrid>
        {declaredEffectFields(effect.declared).map(([key, value]) => (
          <div className="data-field" key={key}>
            <span className="data-field__label">{humanizeFieldLabel(key)}</span>
            <span className="data-field__value">{renderFieldValue(key, value)}</span>
          </div>
        ))}
      </DataFieldGrid>
      {Object.keys(effect.observed).length > 0 ? (
        <>
          <p className="evidence-kicker evidence-kicker--spaced">Observed on trace</p>
          <DataFieldGrid>
            {Object.entries(effect.observed).map(([key, value]) => (
              <div className="data-field" key={key}>
                <span className="data-field__label">{humanizeFieldLabel(key)}</span>
                <span className="data-field__value">{renderFieldValue(key, value)}</span>
              </div>
            ))}
          </DataFieldGrid>
        </>
      ) : null}
      {effect.deviations.length > 0 ? (
        <ul className="evidence-list evidence-list--danger">
          {effect.deviations.map((d, i) => (
            <li key={i}>
              <HexText text={d} />
            </li>
          ))}
        </ul>
      ) : null}
    </EvidenceSection>
  );
}

export function InvariantPanel({ invariants }: { invariants: InvariantEvaluation }) {
  return (
    <EvidenceSection title="Invariants" tone={invariants.verdict === "pass" ? "clear" : "danger"}>
      <table className="evidence-table">
        <thead>
          <tr>
            <th>Check</th>
            <th>Result</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {invariants.checks.map((check) => (
            <tr key={check.name} className={check.passed ? "" : "evidence-table__row--danger"}>
              <td>{check.name}</td>
              <td>{check.passed ? "held" : "breached"}</td>
              <td>
                <HexText text={check.detail} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EvidenceSection>
  );
}

export function SimulatePanel({ simulate }: { simulate: SimulateResult }) {
  const ok = simulate.success === true && simulate.wouldRevert === false;
  return (
    <EvidenceSection title="Simulate" tone={ok ? "clear" : "danger"}>
      {ok ? (
        <DataFieldGrid>
          {simulate.gasEstimate ? <DataField label="Gas estimate" value={simulate.gasEstimate} /> : null}
        </DataFieldGrid>
      ) : (
        <p className="evidence-reason evidence-reason--danger">
          <HexText text={simulate.revertReason ?? simulate.error ?? "Simulate reported it would revert."} />
        </p>
      )}
    </EvidenceSection>
  );
}

export function ExecutionPanel({
  execution,
  finalStatus,
  statusDivergenceNote,
}: {
  execution: ExecutionRef;
  finalStatus?: FinalStatus;
  statusDivergenceNote?: string;
}) {
  const status = finalStatus?.status ?? execution.status;
  const hash = finalStatus?.transactionHash ?? execution.transactionHash;
  return (
    <EvidenceSection title="Execution" tone="clear">
      <DataFieldGrid>
        <DataField label="Execution id" value={execution.executionId} />
        <div className="data-field">
          <span className="data-field__label">Status (KeeperHub reported)</span>
          <span className="data-field__value">{status}</span>
        </div>
        {hash ? (
          <div className="data-field">
            <span className="data-field__label">Transaction</span>
            <span className="data-field__value">
              <HashValue value={hash} kind="tx" linkToExplorer />
            </span>
          </div>
        ) : null}
      </DataFieldGrid>
      {statusDivergenceNote ? (
        <p className="evidence-reason evidence-reason--note">
          <HexText text={statusDivergenceNote} />. The chain is the source of truth: this landed successfully.
        </p>
      ) : null}
    </EvidenceSection>
  );
}
