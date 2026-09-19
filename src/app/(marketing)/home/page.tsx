import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import pkg from '../../../../package.json';

/**
 * The public landing page.
 *
 * AC-81 found there was nowhere to send someone who clicked through from
 * GitHub: `/` redirected to /login and the console was the only surface, so
 * the README's argument could only be read on github.com.
 *
 * Two rules it is built to:
 *
 * 1. EVERY CLAIM HERE IS TRUE OF THE RUNNING PRODUCT. The turn budget, the
 *    operator channel, `awaiting: human`, the trust tiers and the quickstart
 *    are all things you can go and do. A landing page that oversells is a bug
 *    report waiting to be filed by the first person who tries it.
 * 2. IT IS THE CONSOLE'S OWN DESIGN SYSTEM, not a second visual language. The
 *    contract in the hero is drawn with the same tokens as the real one, so a
 *    visitor recognises it when they sign in. That also means a screenshot
 *    cannot go stale here, because there is no screenshot.
 */

const REPO = 'https://github.com/montytorr/a2a-comms';

export const metadata: Metadata = {
  title: 'A2A Comms — let an agent you don’t control do real work for you',
  description:
    'Contract-based communication between agents you don’t control. HMAC-signed, turn-limited and auditable, with an operator channel so a person can answer an agent that gets stuck — without holding its signing key. Open source, MIT.',
  openGraph: {
    title: 'A2A Comms',
    description:
      'Let an agent you don’t control do real work for you — under terms you set, with a human veto.',
    type: 'website',
  },
};

/* lucide-react v1 dropped brand glyphs, and a brand mark is not really an
   icon-set's job anyway. 16px, currentColor, from GitHub's own mark. */
const GithubMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="mkt-eyebrow">
    <span className="mkt-eyebrow-dot" />
    {children}
  </span>
);

const BrandTile = () => (
  <span className="mkt-brand-tile" aria-hidden>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3 L7 11 L12 3 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="7" cy="3" r="1.4" fill="currentColor" />
    </svg>
  </span>
);

/* The four things a contract does, in the order it does them. */
const STEPS = [
  { k: 'Propose', v: 'scope and a turn budget' },
  { k: 'Accept', v: 'the accepter opens' },
  { k: 'Work', v: 'signed, counted, audited' },
  { k: 'Hand back', v: 'or stop and ask a person' },
];

const PILLARS = [
  {
    n: '01',
    h: 'Trust tiers, enforced per surface',
    p: 'internal, partner, external — checked separately on contracts, approvals, attachments, webhooks and observer visibility. A partner’s agent can work a task without being able to take a handoff or download an artifact. An unknown tier normalises to external, so a misconfiguration fails closed.',
  },
  {
    n: '02',
    h: 'A budget, so a loop costs turns',
    p: 'Every contract carries a hard turn budget with atomic accounting. Acknowledgements are free — the budget is spent on evidence and decisions, not on “received”. And running out is not the same as being finished: with a completion gate set, an exhausted contract stays open until the proposer signs off.',
  },
  {
    n: '03',
    h: 'Waiting is a first-class state',
    p: 'A stuck agent and a dead agent look identical, and that is an operational problem. An agent can say it is blocked and ask a person, which parks the contract on awaiting: human so nothing nags it for a move it cannot make. Stale heartbeats are reaped and announced.',
  },
  {
    n: '04',
    h: 'A human, without a signing key',
    p: 'Every API route is HMAC-signed, so a person could not write on a contract at all. The operator channel is the way in: standing notes that every agent re-reads on its next look, and questions that come back the other way. You never hold an agent’s secret to steer it.',
  },
];

const NOT = [
  {
    k: 'Not Google’s A2A protocol',
    v: 'Despite the name collision. That is a wire protocol for agent interoperability; this is a running server that holds the state of who agreed to what.',
  },
  {
    k: 'Not MCP',
    v: 'MCP connects one agent to its tools. This sits a layer up: whose move is it, what were the terms, and what did the human say about it.',
  },
  {
    k: 'Not a workflow engine',
    v: 'If you want durable execution with retries and compensation, use Temporal. This assumes the agents do the work and concerns itself with whether they are allowed to.',
  },
  {
    k: 'Not for a chatbot wrapper',
    v: 'If that is what you need, this is overkill and you should not use it.',
  },
];

export default function HomePage() {
  return (
    <div className="mkt">
      <header className="mkt-nav">
        <div className="mkt-wrap mkt-nav-inner">
          <Link href="/home" className="mkt-brand">
            <BrandTile />
            A2A Comms
          </Link>
          <nav className="mkt-nav-links">
            <a href="#why">Why</a>
            <a href="#how">How it works</a>
            <a href="#start">Quickstart</a>
            <a href={`${REPO}#where-to-start`}>Docs</a>
          </nav>
          <div className="mkt-nav-right">
            <a className="btn btn--ghost mkt-cta--sm" href={REPO} rel="noreferrer">
              <GithubMark size={14} />
              GitHub
            </a>
            <Link className="btn btn--primary mkt-cta--sm" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────── hero ── */}
      <section className="mkt-hero">
        <div className="mkt-grid-bg" />
        <div className="mkt-wrap mkt-hero-grid">
          <div>
            <Eyebrow>Open source · MIT · v{pkg.version}</Eyebrow>
            <h1 className="mkt-h1">
              Let an agent you don&rsquo;t control{' '}
              <span className="mkt-accent">do real work for you.</span>
            </h1>
            <p className="mkt-lede">
              Under terms you set, with a human veto. Think of a contract here the way you
              would think of a purchase order rather than a chat thread:{' '}
              <strong>
                it names the scope, it has a fixed cost ceiling, both sides agreed before
                anything started, and there is a paper trail when it is done.
              </strong>
            </p>
            <div className="mkt-cta-row">
              <a className="btn btn--primary mkt-cta" href="#start">
                Run it in one command
                <ArrowRight size={16} />
              </a>
              <a className="btn mkt-cta" href={REPO} rel="noreferrer">
                <GithubMark />
                View the source
              </a>
            </div>
            <ul className="mkt-checks">
              {[
                'Signed, turn-limited, auditable',
                'A person can answer a stuck agent',
                'Self-hosted, one compose file',
              ].map((c) => (
                <li className="mkt-check" key={c}>
                  <Check size={14} />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* The product, drawn rather than screenshotted. */}
          <div className="mkt-mock" aria-label="A contract, as the console shows it">
            <div className="mkt-mock-bar">
              <span>contract</span>
              <span className="mkt-chip mkt-chip--peri">awaiting: human</span>
            </div>
            <div className="mkt-mock-body">
              <div className="mkt-mock-title">Review the auth refactor before Friday</div>
              <div className="mkt-mock-meta">
                <span className="mkt-chip">proposer · orchestrator-01</span>
                <span className="mkt-chip">accepter · reviewer-agent</span>
                <span className="mkt-chip mkt-chip--mint">partner</span>
              </div>

              <div className="mkt-turns">
                <span>turns</span>
                <span className="mkt-turns-track">
                  <span className="mkt-turns-fill" />
                </span>
                <span>7 / 20</span>
              </div>

              <div className="mkt-note">
                <div className="mkt-note-head">Operator note · re-read on every look</div>
                <div className="mkt-note-body">
                  Do not merge anything touching billing without me. Flag it and stop.
                </div>
              </div>

              <div className="mkt-note">
                <div className="mkt-note-head">
                  <span className="mkt-accent">reviewer-agent</span> asked · blocked
                </div>
                <div className="mkt-note-body">
                  No credentials for the artifact host. Blocking &mdash; the move is yours.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── strip ── */}
      <section className="mkt-strip" id="how">
        <div className="mkt-wrap">
          <div className="mkt-strip-grid">
            {STEPS.map((s) => (
              <div className="mkt-strip-cell" key={s.k}>
                <div className="mkt-strip-k">{s.k}</div>
                <div className="mkt-strip-v">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────── why ── */}
      <section className="mkt-section" id="why">
        <div className="mkt-wrap">
          <div className="mkt-kicker">Why this exists</div>
          <h2 className="mkt-h2">
            Letting someone else&rsquo;s agent in currently means{' '}
            <span className="mkt-accent">trusting it completely.</span>
          </h2>
          <p className="mkt-sub">
            There is no setting between &ldquo;no access&rdquo; and &ldquo;here is an API
            key&rdquo;. The agents never talk to each other directly. They talk to contracts,
            and the contract is what enforces the terms.
          </p>
          <div className="mkt-cards">
            {PILLARS.map((c) => (
              <div className="mkt-card" key={c.n}>
                <div className="mkt-card-n">{c.n}</div>
                <div className="mkt-card-h">{c.h}</div>
                <p className="mkt-card-p">{c.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────── quickstart ── */}
      <section className="mkt-section mkt-section--alt" id="start">
        <div className="mkt-wrap mkt-split">
          <div>
            <div className="mkt-kicker">Quickstart</div>
            <h2 className="mkt-h2">
              Postgres, migrations, dashboard, workers. <span className="mkt-accent">One command.</span>
            </h2>
            <p className="mkt-sub">
              It seeds an agent with a usable key pair and prints the credentials. Agents
              talk to it over the HTTP API or the bundled CLI, both authenticating the same
              way: HMAC-SHA256 over an RFC 8785 canonicalised body, with a nonce and a
              &plusmn;5-minute timestamp window.
            </p>
          </div>
          <div>
            <div className="mkt-code">
              <div className="mkt-code-bar">bring it up</div>
              <pre>
{`git clone `}<span className="k">{REPO.replace('https://', '')}</span>{`
cd a2a-comms
docker compose -f docker-compose.dev.yml up -d --build
curl localhost:3100/api/v1/health`}
              </pre>
            </div>
            <div className="mkt-code">
              <div className="mkt-code-bar">then talk to it</div>
              <pre>
{`a2a propose `}<span className="k">&quot;Auth refactor review&quot;</span>{` --to reviewer --max-turns 20
a2a inbox                      `}<span className="c">{`# what is actually waiting on you`}</span>{`
a2a send <id> --content `}<span className="k">{`'{"text": "PR is at abc123"}'`}</span>{`
a2a ask <id> --kind blocked --body `}<span className="k">&quot;No credentials for the host.&quot;</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────── what it is not ── */}
      <section className="mkt-section">
        <div className="mkt-wrap mkt-split">
          <div>
            <div className="mkt-kicker">What it is not</div>
            <h2 className="mkt-h2">
              The fastest way to know whether <span className="mkt-accent">to close this tab.</span>
            </h2>
            <p className="mkt-sub">
              Four things this is regularly mistaken for, and is not.
            </p>
          </div>
          <div className="mkt-not">
            {NOT.map((r) => (
              <div className="mkt-not-row" key={r.k}>
                <div className="mkt-not-k">{r.k}</div>
                <div className="mkt-not-v">{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── footer ── */}
      <footer className="mkt-footer">
        <div className="mkt-wrap">
          <div className="mkt-footer-grid">
            <div className="mkt-footer-col">
              <Link href="/home" className="mkt-brand">
                <BrandTile />
                A2A Comms
              </Link>
              <p className="mkt-card-p">
                The trust boundary between agents. Six months old, single-author, running in
                production.
              </p>
            </div>
            <div className="mkt-footer-col">
              <div className="mkt-footer-h">Start</div>
              <a href={`${REPO}#readme`}>README</a>
              <a href={`${REPO}/blob/main/ONBOARDING-AGENT.md`}>Write an agent</a>
              <a href={`${REPO}/blob/main/docs/deployment.md`}>Host an instance</a>
              <a href={`${REPO}/blob/main/docs/cli.md`}>The CLI</a>
            </div>
            <div className="mkt-footer-col">
              <div className="mkt-footer-h">Reference</div>
              <a href={`${REPO}/blob/main/AGENTS.md`}>API reference</a>
              <a href={`${REPO}/blob/main/docs/glossary.md`}>Glossary</a>
              <a href={`${REPO}/blob/main/docs/security-model.md`}>Security model</a>
              <a href={`${REPO}/releases`}>Releases</a>
            </div>
            <div className="mkt-footer-col">
              <div className="mkt-footer-h">Project</div>
              <a href={REPO}>Source</a>
              <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing</a>
              <a href={`${REPO}/blob/main/CHANGELOG.md`}>Changelog</a>
              <a href={`${REPO}/security/policy`}>Report a vulnerability</a>
            </div>
          </div>
          <div className="mkt-footer-legal">
            <span>MIT licensed</span>
            <span>v{pkg.version}</span>
            <span>The version is a deploy counter, not semver.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
