import "./SiteFooter.css";

const REPO_URL = "https://github.com/midasbal/Interlock";
const RELIABILITY_FINDING_URL = "https://github.com/KeeperHub/keeperhub/issues/1979";
const RELIABILITY_FIX_URL = "https://github.com/KeeperHub/keeperhub/pull/1980";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__links">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Source on GitHub
          </a>
          <a href={RELIABILITY_FINDING_URL} target="_blank" rel="noreferrer noopener">
            Reliability finding filed against KeeperHub, issue #1979
          </a>
          <a href={RELIABILITY_FIX_URL} target="_blank" rel="noreferrer noopener">
            Merged fix, PR #1980
          </a>
        </div>
        <p className="site-footer__note">
          This panel renders real recorded decisions from docs/audit-trail.jsonl, independently verifiable on chain.
          Nothing here is fabricated. Interlock's own reconciliation independently detected and disclosed the
          duplicate-broadcast and false-status defects behind the divergence above; KeeperHub confirmed both
          against production and shipped the merged fix.
        </p>
      </div>
    </footer>
  );
}
