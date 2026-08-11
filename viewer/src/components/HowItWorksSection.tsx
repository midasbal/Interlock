import { LampDot } from "./icons";
import "./HowItWorksSection.css";

const FREEZE_STAGE = {
  name: "Freeze",
  detail: "the master interlock precondition: a circuit breaker on the wallet itself, checked before anything else. Halts every action, revokes included, until a human re-affirms.",
};

const STAGES = [
  { name: "Policy", detail: "chain, target, and value-cap allowlists, purely local, no network call" },
  { name: "Effect verification", detail: "the real, traced effect of the exact call must match what its author declared" },
  { name: "Invariant", detail: "standing rules against the aggregated state: balances, exposure caps, watched slots" },
  { name: "Simulate", detail: "KeeperHub's own pre-flight check, would this call revert" },
  { name: "Execute", detail: "signed and broadcast only once every earlier stage has cleared" },
];

const CAPABILITIES = [
  { name: "Inbound self-gate", detail: "the agent's own proposed actions pass through the same gate before they can be signed" },
  { name: "Outbound autonomous defense", detail: "the system originates a protective action when a real threat fires, no separate urgent-path bypass" },
  { name: "Intent-versus-effect verification", detail: "a declared effect is checked against the real, traced effect before a signature is possible" },
  { name: "Standing invariants", detail: "rules evaluated against aggregated state, not any single action's own claim about itself" },
  { name: "Delegation-integrity freeze", detail: "a wallet's onchain delegation is watched, and the panel locks if it is ever silently re-pointed" },
  { name: "Post-execution reconciliation", detail: "what was authorized is checked against what actually landed on chain and what KeeperHub reports" },
  { name: "Hash-chained, on-chain-anchored audit trail", detail: "every entry chains to the last, and the chain head is committed on chain for independent verification" },
];

const LEGEND = [
  { state: "cleared", label: "Cleared", tone: "clear", detail: "every stage passed, the action landed" },
  { state: "latched", label: "Latched", tone: "danger", detail: "a stage refused it, the route stopped there, nothing broadcast" },
  { state: "frozen", label: "Frozen", tone: "anomaly", detail: "a delegation-integrity violation locked the panel before any stage ran" },
  { state: "divergence", label: "Divergence", tone: "anomaly", detail: "reconciliation found the chain or KeeperHub disagree with what was authorized" },
];

export function HowItWorksSection() {
  return (
    <section className="how-it-works" id="how-it-works" aria-label="How it works">
      <div className="shell how-it-works__inner">
        <span className="section-kicker">How it works</span>
        <h2 className="how-it-works__title">Freeze-first, then a five-stage pipeline</h2>

        <div className="stage-frame">
          <div className="stage-list__item stage-list__item--freeze">
            <span className="stage-list__index stage-list__index--freeze mono-num">00</span>
            <div>
              <span className="stage-list__name">{FREEZE_STAGE.name}</span>
              <p className="stage-list__detail">{FREEZE_STAGE.detail}</p>
            </div>
          </div>
          <ol className="stage-list">
            {STAGES.map((stage, i) => (
              <li className="stage-list__item" key={stage.name}>
                <span className="stage-list__index mono-num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <span className="stage-list__name">{stage.name}</span>
                  <p className="stage-list__detail">{stage.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <h3 className="how-it-works__subtitle">Capabilities, shipped and proven on Base Sepolia</h3>
        <ul className="capability-list">
          {CAPABILITIES.map((cap) => (
            <li className="capability-list__item" key={cap.name}>
              <span className="capability-list__name">{cap.name}</span>
              <span className="capability-list__detail">{cap.detail}</span>
            </li>
          ))}
        </ul>

        <h3 className="how-it-works__subtitle">Signal states</h3>
        <ul className="legend">
          {LEGEND.map((item) => (
            <li className="legend__item" key={item.state}>
              <span className={`legend__dot legend__dot--${item.tone}`}>
                <LampDot />
              </span>
              <span className="legend__label">{item.label}</span>
              <span className="legend__detail">{item.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
