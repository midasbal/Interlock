import "./OverviewSection.css";

export function OverviewSection() {
  return (
    <section className="overview" id="overview" aria-label="Overview">
      <div className="shell overview__inner">
        <div className="overview__content">
          <span className="section-kicker">Overview</span>
          <h2 className="overview__title">A safety-gated execution layer for autonomous onchain agents</h2>
          <p className="overview__lede">
            Interlock sits between an agent and the chain, built on KeeperHub. Every action it proposes, and every
            action it originates on its own in response to a real threat, is simulated, checked against a declarative
            policy, and signed only if it passes, with the full path recorded to a verifiable audit trail.
          </p>
          <p className="overview__thesis">
            The idea is an interlocking: an action is a route request, and the route is only set, only cleared to
            run, once every stage proves it safe.
          </p>
        </div>
      </div>
    </section>
  );
}
