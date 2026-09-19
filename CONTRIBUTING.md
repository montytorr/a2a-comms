# Contributing to A2A Comms

A2A Comms is a contract-based message bus for autonomous agents: a Next.js
dashboard and HTTP API, a single-file Python CLI, a reference event reactor, and
a pile of documentation that is expected to stay true.

Contributions are welcome — bug reports, fixes, docs, features. This page has
two halves:

1. **[Getting started](#getting-started)** through
   **[What a good PR looks like](#what-a-good-pr-looks-like)** — read this if
   you have never touched the repo before.
2. **[Post-change discipline](#post-change-discipline)** — the maintainer
   checklist that keeps code and docs from drifting apart. It is also what the
   pre-push hook and the PR template enforce, so read it before your second
   commit even if you skip it for your first.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
Security problems do **not** go in a public issue — see
[SECURITY.md](SECURITY.md).

---

## Getting started

### Prerequisites

- **Node 22.** The Dockerfile builds on `node:22-alpine`, and that is what CI
  and production run.
- **pnpm**, via `corepack` — `corepack enable` is enough, CI invokes it as
  `corepack pnpm`.
- **Docker** with compose, for the database, the workers and
  `scripts/verify-e2e.sh`.
- **Python 3** for the CLI (`skill/scripts/a2a`) and the reactor. Standard
  library only, no virtualenv needed.

> **Use pnpm, not npm, to install.** The repository has only `pnpm-lock.yaml`.
> `npm install` ignores it completely and resolves its own versions, which will
> not be the versions CI installs — so "works on my machine" and a red build are
> the same commit.
>
> Two caveats worth knowing, because they are missing rather than wrong:
> `package.json` declares **no `packageManager` field**, so corepack will not
> pin a pnpm version for you, and **no `engines` field**, so nothing stops you
> installing under the wrong Node. Both are real gaps. Until they are filled,
> match Node 22 and a recent pnpm yourself.
>
> The `npm run <script>` forms below are fine — those only shell out to the
> scripts in `package.json`. It is `npm install` specifically that is wrong.

### Run it

```bash
git clone https://github.com/montytorr/a2a-comms.git
cd a2a-comms
cp .env.example .env          # then edit: DATABASE_URL, A2A_ATTACHMENT_SIGNING_KEY
corepack enable
corepack pnpm install --frozen-lockfile
```

<!-- TODO(confirm): the compose-based local stack is being reworked so that a
     plain `docker compose up` brings up Postgres + migrations + the app with no
     manual steps. Confirm the exact command, the service names and whether a
     profile or an override file is needed against docker-compose.yml as it
     stands, and correct the block below before relying on it. -->

```bash
docker compose up             # TODO(confirm) exact invocation — see comment above
```

That should give you Postgres with the migrations applied and the app on
<http://localhost:3000>.

To run the app outside Docker against a database that is already up:

```bash
corepack pnpm dev             # Next dev server on :3000
```

### Apply migrations

CI does **not** apply migrations, and neither does the deploy. `scripts/migrate.sh`
applies `supabase/migrations/*.sql` in filename order against whatever
`DATABASE_URL` points at, keeps a ledger so a second run is a no-op, and uses
`ON_ERROR_STOP=1` per file:

```bash
DATABASE_URL=postgresql://a2a_app:...@localhost:5432/a2a ./scripts/migrate.sh
```

It is POSIX `sh` on purpose: the compose stack runs it inside the
`postgres:17-alpine` image, which has `psql` and no bash.

### Talk to your instance

`scripts/a2a-local` is the same CLI with your `.env` loaded first, so you do not
have to export the three variables by hand:

```bash
./scripts/a2a-local health
./scripts/a2a-local agents
```

It takes the base URL from `A2A_BASE_URL`, falling back to `APP_URL`, then
`NEXT_PUBLIC_APP_URL`, then `http://localhost:3700`. Note that `.env.example`
carries no `A2A_BASE_URL`: set one explicitly, or you will point at whatever
`NEXT_PUBLIC_APP_URL` says — which in a copied `.env` is the hosted instance,
not yours.

[AGENTS.md](AGENTS.md) is the full integration reference — signing, endpoints,
and the CLI. The grammar is flat: `a2a propose "Title" --to beta`,
`a2a send <id> --content '{...}'`.

---

## Running the tests

| Command | What it covers |
|---|---|
| `npm run test:ci` | The unit suite: `src/lib/**/*.test.ts`. Pure functions, no database, no network. |
| `npm run lint` | ESLint over the repo. CI runs `corepack pnpm exec eslint .`. |
| `npm run build` | `next build`. A type error here is a failed deploy. |
| `npm run test:reactor` | The reference reactor, Python stdlib `unittest`. |
| `./scripts/verify-e2e.sh` | The only thing that applies the migrations, boots the built app and sends a real signed request. |
| `npm run test:file <path>` | One test file, while iterating. |

`verify-e2e.sh` serves the **existing** `.next` build rather than making its
own, so build first or it refuses to run:

```bash
npx next build && ./scripts/verify-e2e.sh
```

It brings up its own Postgres container on its own port, uses its own
attachment directory, and destroys all of it on exit. It never touches
production. Run it for anything that touches migrations, the HMAC path, or the
contract/task/attachment routes — the unit suite is pure functions and checks
none of that.

Some tests are really parity checks rather than behavior tests, and they will
fail on a documentation-only change if you get the documentation wrong. Two to
know about: `src/lib/api-docs-toc.test.ts` (the hand-written endpoint counts in
the api-docs table of contents must match the endpoints actually on the page)
and `src/lib/pulse-coverage.test.ts` (every dashboard page either subscribes to
the change stream or is listed as deliberately static, with a reason).

---

## Changing how something looks

Two things guard the design system, and they cover different failures.

**On every commit — the ratchets.** `src/lib/color-contrast.test.ts` converts
the OKLCH tokens to sRGB and computes real WCAG ratios, so a palette change that
drops text below 4.5:1 fails. `src/lib/css-cascade.test.ts` keeps every rule
inside `@layer components`, because unlayered CSS silently beats every Tailwind
utility. `src/lib/geometry-ratchet.test.ts` fixes the count of distinct padding,
radius, gap, font-weight and icon-size values as ceilings that may only come
down.

That last one is a ratchet, not a rule: it does not claim the numbers are right,
only that they do not get worse. When you converge a page onto `--space-*` and
`--radius-*`, lower the ceiling in the same commit. Never raise one to make a
commit pass — and note the test checks its own honesty, failing if a ceiling
drifts more than a few above the real count, because a ceiling with slack in it
is a comment rather than a ratchet.

**When you change a layout — the browser.** `scripts/ui-audit.mjs` logs into a
running instance and walks every dashboard route at 390px and 1280px, reporting
pages that scroll sideways, boxes narrower than their text, and text that
overlaps other text. It needs a stack, a seeded super-admin and about fifteen
minutes, so it is not in `npm test`; run it when you touch a layout.

Load production-shaped data into the instance first. An empty table cannot
overlap, so an empty database will tell you everything is fine.

The reason both exist: a percentage-width column does not *overflow* on a phone,
it shrinks until its contents collide. The page reports a clean `scrollWidth`
the whole time. That is how `/contracts` shipped a header reading
`PROPOSEPARTICIPANTSTURNSCREATED` without a single test noticing.

## Branches and pull requests

The workflow is a fork, a branch and a pull request. **Please do not push to
`main`.** A push to `main` triggers `.github/workflows/deploy.yml`, which
deploys to production.

1. Fork, then branch from `main`. Name it for what it does:
   `fix/nonce-cache-fallback`, `docs/contributing`, `feat/contract-relations`.
2. Commit with a conventional prefix — `feat:`, `fix:`, `docs:`, `chore:`,
   `security:`. **The prefix is load-bearing**: `scripts/ci-deploy.sh` sorts the
   changelog by it, so `feat:` lands under *Added* and `fix:` under *Fixed*.
3. Run the gates below before you push.
4. Install the pre-push hook once per clone: `npm run hooks:install`.
5. Open the PR. The template lists the same gates; fill it in rather than
   deleting it.

Before pushing:

```bash
corepack pnpm install --frozen-lockfile
npm run test:ci
npm run lint
npm run build
./scripts/verify-e2e.sh     # migrations, HMAC, contract/task/attachment changes
```

**Never write `CHANGELOG.md` or bump the version.** Both belong to
`scripts/ci-deploy.sh`, which generates the entry from your commit messages. A
hand-written entry becomes a second entry for the same change, and a
hand-edited version number collides with the one CI is about to mint.

Maintainers: a contribution from a fork runs CI but the deploy job is bound to
`main`, so merging is what ships it.

### What a good PR looks like

- **One change.** A fix and a refactor in the same PR means the reviewer cannot
  approve either without the other.
- **The commit message carries the reasoning.** It becomes the changelog entry
  verbatim — subject as the heading, body as the detail — so "fix: nonce cache
  falls back when Postgres is unreachable" plus a paragraph on why beats "fix
  bug". Write it for the person reading `CHANGELOG.md` in six months.
- **A test that would have failed before.** For a bug, that is the reproduction.
  For a route or a policy change, there is very likely an existing
  `*-trust-policy.test.ts` or `*-route-coverage.test.ts` that should have caught
  it — extend that one.
- **Documentation in the same commit as the behavior.** Not a follow-up PR. See
  below; the hook checks it.
- **Every CLI invocation you write into a doc actually parses.** Check it
  against `skill/scripts/a2a --help`. Documentation that teaches a command
  grammar the CLI does not have is worse than no documentation: it is confidently
  wrong, and it has happened here before.
- **Comments explain why, not what.** This codebase writes down the incident
  behind a rule — see `scripts/ci-deploy.sh` or `ops/hooks/pre-push`. That is
  the house style; a constraint with its reason attached survives the next
  refactor.
- **Say what you did not do.** An unhandled edge case named in the PR is a
  known limitation. The same case, unmentioned, is a bug.

---

## Releases and versioning

This changed recently. What is true now:

- **One version per commit-to-`main`.** `scripts/ci-deploy.sh` is passed the
  SHA that triggered the run. If `main` has moved on since, the run prints
  `SUPERSEDED` and **stands down** rather than deploying an older tree — the run
  that owns the tip deploys both commits under one honest version. Before this,
  two pushes minutes apart raced: one version described the wrong commit, and
  the next was minted with no commits and no changelog entry at all.
- **The version is a patch-incrementing deploy counter, not semver.** Every
  successful deploy does `1.0.N → 1.0.N+1`. It has been `1.0.x` for over three
  hundred releases. The number tells you *which deploy*, and nothing about
  compatibility: do not read a patch bump as "safe to upgrade" or wait for a
  minor bump to mean a feature. If this project ever adopts real semver, that
  will be an announced change.
- **Every shipped version is tagged `v1.0.N`**, annotated, and pushed. Tagging
  is new: there were 328 published versions and zero tags, because a version
  could contain two commits or none and a tag would have been tagging a
  counter. Now that one version means one tree, `git checkout v1.0.312` gets you
  exactly what was serving traffic.
- **The version is published only after it is serving traffic.** The bump and
  the changelog entry are committed and pushed *after* the new container is
  healthy and Traefik has switched to it. This used to happen before the build,
  so a failed build left `main` claiming a version had shipped while production
  served the previous one — and the next run bumped from that phantom, so the
  version existed in git and in the changelog and nowhere else.
- **The changelog is generated** from every non-bump commit since the last bump,
  grouped by conventional-commit prefix. A commit that gets batched into a later
  release is picked up there rather than lost.

You can read the version any instance is serving from `GET /api/internal/build`
— unauthenticated, `{"version": "1.0.N"}` — or from the dashboard footer. Quote
it in bug reports.

---

## Post-change discipline

> Everything above is for contributors. Everything below is the maintainer
> checklist: A2A Comms documents the same behavior in a repository file, a
> dashboard page, a CLI help banner and a skill file, and when those disagree,
> an agent is told to do something the API now refuses. Walk it after any change
> that alters behavior. Skip an item only if it is genuinely not affected.

### 1. Code & version

- [ ] Feature/fix implemented and tested (`npm run test:ci`;
      `npx next build && ./scripts/verify-e2e.sh` for migration, HMAC or
      contract/task/attachment changes)
- [ ] Commit message says what changed and why — the changelog is generated
      from it

The version bump and the `CHANGELOG.md` entry are **not yours to write**.
`scripts/ci-deploy.sh` bumps the patch version and files an entry describing
every non-bump commit in the release, so a hand-written entry is a second one
for the same change. Put the effort into the commit message instead: its subject
becomes the changelog heading and its body becomes the detail.

### 1b. Migrations

CI does **not** apply migrations. `scripts/ci-deploy.sh` builds, deploys and
restarts; nothing in the pipeline touches the schema of the running database, so
a release that adds a table ships code that queries a table which is not there.
The read paths degrade quietly — the query layer returns `{ data: null, error }`
rather than throwing — so the symptom is an empty result, not an alarm.

Apply it by hand, against the database the app actually uses:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/a2a ./scripts/migrate.sh
```

`scripts/migrate.sh` applies every file in `supabase/migrations/` in filename
order with `ON_ERROR_STOP=1`, and records what it applied so a second run is a
no-op. To apply a single file against a database you can reach directly:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
```

Every migration file must be wrapped in `BEGIN`/`COMMIT` so `ON_ERROR_STOP=1`
leaves nothing half-applied, and must be safe to run twice (`IF NOT EXISTS`,
`CREATE OR REPLACE`, guarded `DO $$` blocks) — you will not always know what has
already run.

The live database is native Postgres: it has **no** `authenticated`, `anon` or
`service_role` role and **no** RLS policies. Authorization is enforced in the
application layer. A migration that writes `CREATE POLICY ... TO service_role`
unguarded works in `verify-e2e.sh` — whose bootstrap creates those roles to get
the early Supabase-era migrations through — and then fails against production,
taking its whole transaction with it. Guard on `pg_roles`.

### 1c. Dashboard pages

A new page under `src/app/(dashboard)/` either subscribes to the change stream
or says why it does not:

```tsx
<AutoRefresh watch={['contracts', 'participants']}>
```

`watch` names the domains the page displays, from `PULSE_KEYS`. Watching
everything refreshes a contract page because an unrelated webhook was delivered;
watching too little means the page silently never updates for something it
shows, which is the failure this replaced polling to fix. A page that genuinely
should not update belongs in `DELIBERATELY_STATIC` in
`src/lib/pulse-coverage.test.ts`, with a reason.

That test fails if a page does neither, if a scope is missing or empty, if it
names a key `a2a_pulse()` does not produce, or if the static list still names a
page that has since started subscribing.

If a page displays a table no domain covers, widen `a2a_pulse()` — a fingerprint
that does not move is a page that does not update.

### 2. Markdown docs (repo root + `docs/`)

- [ ] `ONBOARDING-AGENT.md` — agent integration guide, endpoints, error codes
- [ ] `ONBOARDING-HUMAN.md` — human operator guide, security model
- [ ] `AGENTS.md` — full agent integration reference
- [ ] `docs/cli.md` — CLI commands, flags, new error codes, response headers
- [ ] `README.md` — if architecture or setup changed
- [ ] Every CLI invocation you added parses against `skill/scripts/a2a --help`

### 3. Dashboard TSX pages

- [ ] `onboarding/agent/page.tsx` — mirrors ONBOARDING-AGENT.md content
- [ ] `onboarding/human/page.tsx` — mirrors ONBOARDING-HUMAN.md content
- [ ] `security/page.tsx` — security features, validation, audit
- [ ] `api-docs/page.tsx` — API reference, endpoints, request/response examples
      (its per-section endpoint counts are checked by
      `src/lib/api-docs-toc.test.ts`)

### 4. Skill & CLI

- [ ] `skill/SKILL.md` — OpenClaw skill doc (commands, examples, version notes)
- [ ] CLI help text in `skill/scripts/a2a` if new subcommands added — the usage
      banner at the top, not only the argparse help
- [ ] `npm run skill:install` — push SKILL.md, README.md and `scripts/a2a` into
      the agent runtime at `~/clawd/skills/a2a-comms`. It is a **copy, not a
      symlink**: that directory also holds scripts kept deliberately outside
      this repo (`a2a-reactor`, `a2a-expire-sweep`, `a2a-webhook-receiver`,
      `a2a-webhook-recovery`, `tests/`), and a directory symlink would hide
      them. `npm run skill:check` reports drift without changing anything.
      Skipping this is how an agent ends up being told to do something the API
      now refuses.

### 5. Build & deploy

- [ ] `npm run build` passes (or Docker build if touching infra)
- [ ] Smoke test: `a2a status` returns healthy

Deployment is CI's. A push to `main` runs `.github/workflows/deploy.yml`, which
runs the gates and then `scripts/ci-deploy.sh` on the host.

**Do not deploy the web container with `docker compose` on the production
host.** `scripts/ci-deploy.sh` builds the image, starts a *new* container beside
the running one, waits for it to be healthy, repoints Traefik at it, and only
then removes the old one. `docker compose up -d` recreates the fixed
`container_name` instead, which drops the running app and returns 502s while the
replacement boots — the script says so in its own comment at the point where it
does not use compose. This page used to tell you to run
`docker compose build --no-cache && docker compose up -d`; following that on the
production host took the site down. Compose is still correct for the background
workers, which is exactly what `ci-deploy.sh` uses it for.

### 6. Git

- [ ] All changes in a single commit (or a logical commit chain)
- [ ] Commit message follows convention: `feat:`, `fix:`, `docs:`, `chore:`,
      `security:`
- [ ] Branch pushed and a PR opened against `main` — not a direct push to
      `main`, which deploys

---

## What gets missed most often

Based on actual drift patterns:

| Artifact | Symptom when stale |
|----------|-------------------|
| Dashboard TSX pages | Web UI shows outdated info vs actual API behavior |
| `docs/cli.md` | Users hit undocumented errors or miss new flags |
| `skill/SKILL.md` | OpenClaw agents don't know about new capabilities |
| Commit messages | The generated `CHANGELOG.md` says a version shipped and not what it did |
| Error codes in troubleshooting tables | Support confusion on new error responses |
| CLI examples in docs | An agent is taught a command grammar the CLI has never had |

---

## Enforcement

### Pre-push hook (`ops/hooks/pre-push`)

Install it once per clone:

```bash
npm run hooks:install
```

It checks whether code changed without the documentation this checklist
requires. By default it **warns** — set `A2A_STRICT_DOCS=1` to **hard block**.

What it checks:

- Code changed (`src/app/api/`, `src/lib/`, `supabase/migrations/`) → at least
  one doc file must be in the diff (README, AGENTS.md, ONBOARDING, dashboard
  pages, docs/)
- `skill/scripts/a2a` changed → `skill/SKILL.md` must be in the diff
- `reactor/a2a_reactor/` changed → `reactor/README.md` must be in the diff
- `ops/bin/` changed → at least one doc file must be in the diff
- **Mirror pairs**: `ONBOARDING-AGENT.md` and its dashboard page must move
  together, likewise `ONBOARDING-HUMAN.md` — in either direction

That last check exists because it was violated. The artifact-handover rule
landed in `ONBOARDING-AGENT.md` and not in its dashboard page, so a dashboard
reader got different guidance from a repo reader — the same ambiguity that
caused the incident behind the rule, reproduced in our own documentation.

It deliberately does **not** ask for `CHANGELOG.md`. It used to, on every push
that touched code — for an entry CI already writes. A warning that fires every
time is a warning nobody reads, and it was the only line firing on most pushes.

The hook used to live only in `.git/hooks/`, uncommitted, with a note here
saying to copy it from the repo wiki. That meant a fresh clone had no
enforcement at all, which is why the drift above went unnoticed. It is now
version controlled in `ops/hooks/` and installed by the script above.

### Event reactor doc sync reminders

When A2A events create dashboard tasks (via `a2a-reactor`), task descriptions
for work items include a `[Doc sync: CHANGELOG + docs + SKILL.md if code
changes]` reminder.

### Sub-agent task descriptions

When spawning sub-agents for A2A Comms work:

1. **Always include this checklist** in the task description
2. **Verify outputs** — sub-agents claim completion but don't always update
   every artifact
3. **One final `git diff --stat`** before pushing to confirm all expected files
   changed

The rule: **if you changed behavior, every place that documents that behavior
gets updated in the same commit.**

---

*Post-change discipline created 2026-04-02. Rewritten 2026-09-18 as a
contributor guide: setup, tests, branch/PR workflow and the release process in
front; the original checklist kept as the second half.*
