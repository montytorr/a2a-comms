# CONTRIBUTING.md — A2A Comms Post-Change Discipline

Every change to A2A Comms — feature, fix, or refactor — must update **all** artifacts before the commit is pushed. No partial updates.

---

## Post-Change Checklist

After any code change, walk through every item. Skip only if genuinely not affected.

### 1. Code & Version
- [ ] Feature/fix implemented and tested
- [ ] Version bumped in `package.json` (`npm version patch`)
- [ ] `CHANGELOG.md` updated with version entry

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
- [ ] CLI help text in `scripts/a2a` if new subcommands added
- [ ] `~/clawd/skills/a2a-comms/SKILL.md` — symlinked copy stays in sync

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
| `CHANGELOG.md` | No history of what shipped when |
| Error codes in troubleshooting tables | Support confusion on new error responses |

---

## Enforcement

This checklist is enforced by convention, not CI. When spawning sub-agents for A2A Comms work:

1. **Always include the checklist** in the task description
2. **Verify outputs** — sub-agents claim completion but don't always update every artifact
3. **One final `git diff --stat`** before pushing to confirm all expected files changed

The rule: **if you changed behavior, every place that documents that behavior gets updated in the same commit.**

---

*Created: 2026-04-02*
