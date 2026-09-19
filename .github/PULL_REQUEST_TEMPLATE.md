<!--
Thanks for contributing. The checklists below are the gates this repo actually
has — the same commands CI runs. Delete any section that genuinely does not
apply; do not delete the whole thing.
-->

## What this changes

<!-- One or two sentences. What behavior is different after this merges? -->

## Why

<!-- The problem, or the issue number. "Closes #123" is enough if the issue
     carries the detail. -->

## How to verify

<!-- What a reviewer should run or click to see it working. An API or CLI
     change deserves the exact invocation. -->

```bash
```

---

## Gates

Run these before pushing. CI (`.github/workflows/deploy.yml`) runs the same
four, and a failure there blocks the deploy for everyone.

- [ ] `pnpm test` (or `npm run test:ci`) — the unit suite
- [ ] `pnpm exec eslint .` (or `npm run lint`) — clean, no new warnings
- [ ] `pnpm exec next build` (or `npm run build`) — passes
- [ ] `scripts/verify-e2e.sh` — **required** if this touches migrations, HMAC,
      or contract/task/attachment routes. It applies the migrations to a
      throwaway Postgres, boots the built app and sends a signed request. The
      unit suite is pure functions and checks none of that.
- [ ] `npm run test:reactor` — if `reactor/` changed

> Use **pnpm**. The repo has only `pnpm-lock.yaml`, and `npm install` ignores
> it entirely — it will resolve different versions from the ones CI installs.

## Docs parity

The pre-push hook (`ops/hooks/pre-push`, installed once per clone with
`npm run hooks:install`) checks that code and its documentation move together.
It **warns** by default; `A2A_STRICT_DOCS=1` makes it block. Please satisfy it
rather than pushing past it.

- [ ] Hook installed (`npm run hooks:install`) and it passed
- [ ] Code changed (`src/app/api/`, `src/lib/`, `migrations/`) → at
      least one doc moved with it (`README.md`, `AGENTS.md`, `ONBOARDING-*.md`,
      `docs/`, or the matching dashboard page)
- [ ] `skill/scripts/a2a` changed → `skill/SKILL.md` updated, including the
      usage banner at the top of the script, not only the argparse help
- [ ] `reactor/a2a_reactor/` changed → `reactor/README.md` updated
- [ ] Mirror pairs move together, in either direction:
      `ONBOARDING-AGENT.md` ↔ `src/app/(dashboard)/onboarding/agent/`, and
      `ONBOARDING-HUMAN.md` ↔ `src/app/(dashboard)/onboarding/human/`
- [ ] Every CLI invocation I added to a doc actually parses. The grammar is
      flat — `a2a propose "Title" --to beta`, `a2a send <id> --content '...'`.
      There is no `a2a contracts propose` or `a2a messages send`.

## Migrations

- [ ] Not applicable
- [ ] Wrapped in `BEGIN`/`COMMIT`, safe to run twice (`IF NOT EXISTS`,
      `CREATE OR REPLACE`, guarded `DO $$`), and guarded on `pg_roles` if it
      mentions `service_role`/`anon` — production is native Postgres with no
      RLS and no such roles
- [ ] `scripts/verify-e2e.sh` passes with it applied

> CI does **not** apply migrations. Whoever deploys applies them by hand. Say
> so explicitly in this PR so it is not discovered by an empty result later.

## Dashboard pages

- [ ] Not applicable
- [ ] Any new page under `src/app/(dashboard)/` subscribes via
      `<AutoRefresh watch={[...]}>` with the domains it displays, or is listed
      in `DELIBERATELY_STATIC` in `src/lib/pulse-coverage.test.ts` with a reason

## Commits

- [ ] Subjects follow `feat:` / `fix:` / `docs:` / `chore:` / `security:`
- [ ] Commit messages say what changed and why

> `CHANGELOG.md` and the version bump are **not yours to write**.
> `scripts/ci-deploy.sh` generates the changelog entry from the commit messages
> of every non-bump commit in the release, so a hand-written entry becomes a
> duplicate. Put the effort into the commit message: its subject becomes the
> changelog heading and its body becomes the detail.
