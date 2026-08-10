import { STAGE_ORDER, type StageStatus } from "../lib/classify";
import "./StageTrack.css";

interface Props {
  stages: StageStatus[];
  frozen?: boolean;
  /** Compact mode for the collapsed row, full mode for the expanded route. */
  variant: "compact" | "full";
  /** When true (expanded, motion allowed), each stage lights in sequence instead of all at once. */
  traveling?: boolean;
  clearedToChain?: boolean;
}

export function StageTrack({ stages, frozen, variant, traveling, clearedToChain }: Props) {
  if (frozen) {
    return (
      <div className={`stage-track stage-track--${variant} stage-track--locked`}>
        <span className="stage-track__locked-label">Panel locked</span>
      </div>
    );
  }

  return (
    <div className={`stage-track stage-track--${variant}`} role="list" aria-label="Route stages">
      {stages.map((stage, index) => (
        <div
          className="stage-track__segment"
          key={stage.name}
          style={{ "--stage-index": index } as React.CSSProperties}
        >
          {index > 0 ? (
            <span
              className={`stage-track__line stage-track__line--${lineState(stages[index - 1].status)} ${
                traveling ? "stage-track__line--travel" : ""
              }`}
            />
          ) : null}
          <div
            role="listitem"
            className={`stage-track__node stage-track__node--${stage.status} ${
              traveling ? "stage-track__node--travel" : ""
            } ${stage.status === "latched" ? "stage-track__node--latch" : ""}`}
            title={`${stage.label}: ${statusText(stage.status)}`}
          >
            {variant === "full" ? (
              <span className="stage-track__node-inner">
                <span className="stage-track__node-label">{stage.label}</span>
                {stage.status === "latched" ? <span className="stage-track__node-stopped">Stopped here</span> : null}
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {variant === "full" && stages.length === STAGE_ORDER.length ? (
        <div className="stage-track__segment" style={{ "--stage-index": stages.length } as React.CSSProperties}>
          <span
            className={`stage-track__line stage-track__line--${
              clearedToChain ? "passed" : "not-reached"
            } ${traveling ? "stage-track__line--travel" : ""}`}
          />
          <div
            className={`stage-track__destination ${clearedToChain ? "stage-track__destination--live" : ""} ${
              traveling ? "stage-track__destination--travel" : ""
            }`}
          >
            On chain
          </div>
        </div>
      ) : null}
    </div>
  );
}

function lineState(prev: StageStatus["status"]): StageStatus["status"] {
  return prev;
}

function statusText(status: StageStatus["status"]): string {
  if (status === "passed") return "cleared";
  if (status === "latched") return "latched here";
  return "not reached";
}
