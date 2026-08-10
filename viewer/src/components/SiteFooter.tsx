import "./SiteFooter.css";

const REPO_URL = "https://github.com/midasbal/Interlock";
const RELIABILITY_FINDING_URL = "https://github.com/KeeperHub/keeperhub/issues/1979";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__links">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Source on GitHub
          </a>
          <a href={RELIABILITY_FINDING_URL} target="_blank" rel="noreferrer noopener">
            Reliability finding filed against KeeperHub
          </a>
        </div>
        <p className="site-footer__note">
          This panel renders real recorded decisions from docs/audit-trail.jsonl, independently verifiable on chain.
          Nothing here is fabricated.
        </p>
      </div>
    </footer>
  );
}
