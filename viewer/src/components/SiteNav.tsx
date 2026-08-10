import "./SiteNav.css";

const REPO_URL = "https://github.com/midasbal/Interlock";

export function SiteNav() {
  return (
    <nav className="site-nav" aria-label="Page sections">
      <div className="site-nav__inner shell">
        <a className="site-nav__brand" href="#top">
          <span className="site-nav__brand-dot" aria-hidden="true" />
          Interlock
        </a>
        <div className="site-nav__links">
          <a className="site-nav__link" href="#overview">
            Overview
          </a>
          <a className="site-nav__link" href="#how-it-works">
            How it works
          </a>
          <a className="site-nav__link" href="#signal-panel">
            Signal panel
          </a>
          <a className="site-nav__link site-nav__link--external" href={REPO_URL} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
