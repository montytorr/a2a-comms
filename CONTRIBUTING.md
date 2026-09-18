# CONTRIBUTING.md — A2A Comms Post-Change Discipline

Every change to A2A Comms — feature, fix, or refactor — must update **all** artifacts before the commit is pushed. No partial updates.

---

## Post-Change Checklist

After any code change, walk through every item. Skip only if genuinely not affected.

### 1. Code & Version
- [ ] Feature/fix implemented and tested (`npm test`; `npx next build && ./scripts/verify-e2e.sh` for migration, HMAC or contract/task/attachment changes)
- [ ] Commit message says what changed and why — the changelog is generated from it

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
sudo docker exec -i clawdius-postgres psql -U a2a_app -d a2a \
  -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql
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

### 2. Markdown Docs (repo root + `docs/`)
- [ ] `ONBOARDING-AGENT.md` — agent integration guide, endpoints, error codes
- [ ] `ONBOARDING-HUMAN.md` — human operator guide, security model
- [ ] `AGENTS.md` — full agent integration reference
- [ ] `docs/cli.md` — CLI commands, flags, new error codes, response headers
- [ ] `README.md` — if architecture or setup changed

### 3. Dashboard TSX Pages
- [ ] `onboarding/agent/page.tsx` — mirrors ONBOARDING-AGENT.md content
- [ ] `onboarding/human/page.tsx` — mirrors ONBOARDING-HUMAN.md content
- [ ] `security/page.tsx` — security features, validation, audit
- [ ] `api-docs/page.tsx` — API reference, endpoints, request/response examples

### 4. Skill & CLI
- [ ] `skill/SKILL.md` — OpenClaw skill doc (commands, examples, version notes)
- [ ] CLI help text in `skill/scripts/a2a` if new subcommands added — the usage banner at the top, not only the argparse help
- [ ] `npm run skill:install` — push SKILL.md, README.md and `scripts/a2a` into the
      agent runtime at `~/clawd/skills/a2a-comms`. It is a **copy, not a symlink**:
      that directory also holds scripts kept deliberately outside this repo
      (`a2a-reactor`, `a2a-expire-sweep`, `a2a-webhook-receiver`,
      `a2a-webhook-recovery`, `tests/`), and a directory symlink would hide them.
      `npm run skill:check` reports drift without changing anything.
      Skipping this is how an agent ends up being told to do something the API
      now refuses.

### 5. Build & Deploy
- [ ] `npm run build` passes (or Docker build if touching infra)
- [ ] Docker image rebuilt if deploying: `docker compose build --no-cache && docker compose up -d`
- [ ] Smoke test: `a2a status` returns healthy

### 6. Git
- [ ] All changes in a single commit (or logical commit chain)
- [ ] Commit message follows convention: `feat:`, `fix:`, `docs:`, `chore:`
- [ ] Pushed to `main`

---

## What Gets Missed Most Often

Based on actual drift patterns:

| Artifact | Symptom when stale |
|----------|-------------------|
| Dashboard TSX pages | Web UI shows outdated info vs actual API behavior |
| `docs/cli.md` | Users hit undocumented errors or miss new flags |
| `skill/SKILL.md` | OpenClaw agents don't know about new capabilities |
| Commit messages | The generated `CHANGELOG.md` says a version shipped and not what it did |
| Error codes in troubleshooting tables | Support confusion on new error responses |

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
- Code changed (`src/app/api/`, `src/lib/`, `supabase/migrations/`) → at least one doc file must be in the diff (README, AGENTS.md, ONBOARDING, dashboard pages, docs/)
- `skill/scripts/a2a` changed → `skill/SKILL.md` must be in the diff
- `reactor/a2a_reactor/` changed → `reactor/README.md` must be in the diff
- `ops/bin/` changed → at least one doc file must be in the diff
- **Mirror pairs**: `ONBOARDING-AGENT.md` and its dashboard page must move together, likewise `ONBOARDING-HUMAN.md` — in either direction

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
When A2A events create dashboard tasks (via `a2a-reactor`), task descriptions for work items include a `[Doc sync: CHANGELOG + docs + SKILL.md if code changes]` reminder.

### Sub-agent task descriptions
When spawning sub-agents for A2A Comms work:

1. **Always include the CONTRIBUTING.md checklist** in the task description
2. **Verify outputs** — sub-agents claim completion but don't always update every artifact
3. **One final `git diff --stat`** before pushing to confirm all expected files changed

The rule: **if you changed behavior, every place that documents that behavior gets updated in the same commit.**

---

*Created: 2026-04-02 | Updated: 2026-09-18 (migrations section; the changelog is CI's, not yours)*
