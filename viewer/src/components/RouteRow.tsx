import { useState } from "react";
import { computeStages, signalState } from "../lib/classify";
import { describeAction } from "../lib/describe";
import { formatTimeOnly } from "../lib/format";
import type { GateDecision, ReconciliationItemPayload } from "../lib/types";
import { AnomalyMarkIcon, ChevronIcon, LampDot } from "./icons";
import { StageTrack } from "./StageTrack";
import { EffectPanel, ExecutionPanel, InvariantPanel, PolicyPanel, SimulatePanel } from "./EvidencePanels";
import { ReconciliationPanel } from "./ReconciliationPanel";
import { HexText } from "./HexText";
import "./RouteRow.css";

interface Props {
  seq: number;
  label: string;
  decision: GateDecision;
  reconciliationItem?: ReconciliationItemPayload;
  reducedMotion: boolean;
  style?: React.CSSProperties;
}

export function RouteRow({ seq, label, decision, reconciliationItem, reducedMotion, style }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hasTraveled, setHasTraveled] = useState(false);
  const state = signalState(decision);
  const stages = computeStages(decision);
  const hasAnomaly = Boolean(reconciliationItem);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) setHasTraveled(true);
  };

  return (
    <article
      className={`route-row route-row--${state} ${hasAnomaly ? "route-row--anomaly" : ""} ${expanded ? "route-row--expanded" : ""}`}
      style={style}
    >
      <button
        type="button"
        className="route-row__summary"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`route-detail-${seq}`}
      >
        <span className={`route-row__lamp route-row__lamp--${state}`}>
          <LampDot />
        </span>
        <span className="route-row__seq mono-num">{String(seq).padStart(3, "0")}</span>
        <span className="route-row__time mono-num">{formatTimeOnly(decision.timestamp)}</span>
        <span className="route-row__label">{label}</span>
        <span className="route-row__track">
          <StageTrack stages={stages} frozen={decision.frozen} variant="compact" />
        </span>
        {hasAnomaly ? (
          <span className="route-row__anomaly-badge">
            <AnomalyMarkIcon size={11} />
            Divergence
          </span>
        ) : null}
        <span className={`route-row__state route-row__state--${state}`}>{stateLabel(state)}</span>
        <span className="route-row__chevron">
          <ChevronIcon open={expanded} />
        </span>
      </button>

      {expanded ? (
        <div className="route-row__detail" id={`route-detail-${seq}`}>
          <p className="route-row__action">
            <HexText text={describeAction(decision.action)} />
          </p>

          <StageTrack
            stages={stages}
            frozen={decision.frozen}
            variant="full"
            traveling={hasTraveled && !reducedMotion}
            clearedToChain={state === "cleared"}
          />

          {decision.frozen ? (
            <div className="route-row__reason route-row__reason--anomaly">
              <HexText text={decision.reason} />
            </div>
          ) : null}

          {reconciliationItem ? <ReconciliationPanel item={reconciliationItem} /> : null}

          <div className="route-row__evidence">
            {decision.policy ? <PolicyPanel policy={decision.policy} /> : null}
            {decision.effectVerification ? <EffectPanel effect={decision.effectVerification} /> : null}
            {decision.invariants ? <InvariantPanel invariants={decision.invariants} /> : null}
            {decision.simulate ? <SimulatePanel simulate={decision.simulate} /> : null}
            {decision.execution ? (
              <ExecutionPanel execution={decision.execution} finalStatus={decision.finalStatus} />
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function stateLabel(state: ReturnType<typeof signalState>): string {
  if (state === "cleared") return "Cleared";
  if (state === "frozen") return "Frozen";
  return "Latched";
}
