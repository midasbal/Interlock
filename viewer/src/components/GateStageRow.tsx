import { formatTimeOnly } from "../lib/format";
import type { EffectVerificationResult, FreezeEvidence, SimulateResult, WorkflowGateStagePayload } from "../lib/types";
import { EffectPanel, FreezePanel, SimulatePanel } from "./EvidencePanels";
import { HexText } from "./HexText";
import "./GateStageRow.css";

const STAGE_LABELS: Record<string, string> = {
  freeze: "Freeze",
  "effect-verify": "Effect verification",
  simulate: "Simulate",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

function isFreezeEvidence(evidence: unknown): evidence is FreezeEvidence {
  return typeof evidence === "object" && evidence !== null && "wallet" in evidence && "state" in evidence;
}

function isEffectEvidence(evidence: unknown): evidence is EffectVerificationResult {
  return typeof evidence === "object" && evidence !== null && "verdict" in evidence && "declared" in evidence;
}

function isSimulateEvidence(evidence: unknown): evidence is SimulateResult {
  return typeof evidence === "object" && evidence !== null && "success" in evidence;
}

export function GateStageRow({ seq, timestamp, payload }: { seq: number; timestamp: string; payload: WorkflowGateStagePayload }) {
  const { stage, pass, reason, evidence } = payload;

  return (
    <article className={`gate-stage-row ${pass ? "gate-stage-row--pass" : "gate-stage-row--block"}`}>
      <div className="gate-stage-row__meta">
        <span className="gate-stage-row__seq mono-num">{String(seq).padStart(3, "0")}</span>
        <span className="gate-stage-row__time mono-num">{formatTimeOnly(timestamp)}</span>
        <span className="gate-stage-row__kind">Workflow gate stage, {stageLabel(stage)}</span>
        <span className={`gate-stage-row__verdict gate-stage-row__verdict--${pass ? "pass" : "block"}`}>
          {pass ? "Pass" : "Block"}
        </span>
      </div>
      <p className="gate-stage-row__reason">
        <HexText text={reason} />
      </p>
      {isFreezeEvidence(evidence) ? <FreezePanel evidence={evidence} pass={pass} /> : null}
      {isEffectEvidence(evidence) ? <EffectPanel effect={evidence} /> : null}
      {isSimulateEvidence(evidence) ? <SimulatePanel simulate={evidence} /> : null}
    </article>
  );
}
