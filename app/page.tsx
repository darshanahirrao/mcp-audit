import { Audit } from "@/components/Audit";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Page() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <a className="brand-mark" href="/">
              mcp<span className="brand-caret">audit</span>
            </a>
            <span className="brand-sub">Server inspection</span>
          </div>
          <div className="topbar-actions">
            <a className="btn btn-quiet" href="https://github.com/darshanahirrao/mcp-audit">
              Source
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <Audit />

      <footer className="footer">
        <div className="wrap footer-inner">
          <span>
            Built by{" "}
            <a href="https://darsh.top" rel="me">
              Darshan Ahirrao
            </a>
            . A clear audit is a starting point, not a guarantee of safety.
          </span>
          <span className="footer-links">
            <a href="https://github.com/darshanahirrao/mcp-audit">Source</a>
            <a href="mailto:darshan@growthforgeai.com">Contact</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
