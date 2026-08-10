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
  return (
    <div className={`stage-track stage-track--${variant}`} role="list" aria-label="Route stages">
      <FreezeNode variant={variant} frozen={Boolean(frozen)} traveling={traveling} />
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

/**
 * Freeze is stage 0: the master interlock precondition, checked before any
 * of the five per-action stages, and different in kind from them, it is a
 * circuit breaker on the wallet itself, not a check on this one action.
 * Rendered first in the track, always, distinct shape and color from the
 * per-action nodes so it reads as a precondition rather than "check one of
 * six". When tripped, the five per-action stages render nothing rather than
 * a row of not-reached nodes, since none of them ran or were even reached.
 */
function FreezeNode({ variant, frozen, traveling }: { variant: "compact" | "full"; frozen: boolean; traveling?: boolean }) {
  const tone = frozen ? "tripped" : "clear";
  const title = frozen
    ? "Freeze, stage 0: tripped. Halts every action, revokes included, until a human re-affirms."
    : "Freeze, stage 0: clear. Checked first, before policy, effect verification, invariants, or simulate.";

  if (variant === "compact") {
    return (
      <div className="stage-track__segment" style={{ "--stage-index": -1 } as React.CSSProperties}>
        <span className={`stage-track__freeze-node stage-track__freeze-node--compact stage-track__freeze-node--${tone}`} title={title} />
        <span className={`stage-track__line stage-track__line--${frozen ? "not-reached" : "passed"}`} />
      </div>
    );
  }

  return (
    <div className="stage-track__segment" style={{ "--stage-index": -1 } as React.CSSProperties}>
      <div
        className={`stage-track__freeze-node stage-track__freeze-node--${tone} ${traveling ? "stage-track__node--travel" : ""}`}
        title={title}
      >
        <span className="stage-track__node-inner">
          <span className="stage-track__freeze-tag">Stage 0</span>
          <span className="stage-track__node-label">Freeze</span>
          {frozen ? <span className="stage-track__node-stopped">Tripped, halts here</span> : null}
        </span>
      </div>
      <span
        className={`stage-track__line stage-track__line--${frozen ? "not-reached" : "passed"} ${
          traveling ? "stage-track__line--travel" : ""
        }`}
      />
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
