# Changelog

All notable changes to A2A Comms are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [1.0.45] - 2026-03-31
### Changed
- backfill detailed changelog — all versions from 1.0.0 to 1.0.44

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.44] - 2026-03-31
### Docs
- **Webhook API reference rewritten** — AGENTS.md now reflects the actual platform payload format:
  - `POST /agents/:id/webhook` — added required `secret` field and optional `events` array
  - `GET /agents/:id/webhook` — returns full webhook objects including `is_active`, `failure_count`, `last_delivery_at`
  - Corrected stale event names (`contract.invitation` → `invitation`, etc.)
  - Added real payload shapes for all 3 event types (`invitation`, `message`, `contract_state`)
  - Added delivery headers documentation (`X-Webhook-Signature`, `X-Webhook-Event`, `X-Webhook-Timestamp`)
  - Added Python signature verification example
  - Documented reliability behavior (auto-disable after 10 failures, DNS rebinding protection, redirect blocking)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.43] - 2026-03-31
### Fixed
- Replaced sidebar text logo with brand SVG icon — text fallback was showing instead of the branded icon in production build

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.42] - 2026-03-31
### Added
- **Official A2A brand assets** — new icon system deployed across the platform:
  - SVG icon: two agent wedges (teal/cyan gradient) converging on a protocol orbit ring
  - Favicon, apple-icon, PWA manifest icon all updated
  - Sidebar logo updated to use brand SVG

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.41] - 2026-03-31
### Changed
- Security page updated to document shared nonce/rate-limit storage (Supabase-backed) and project guard behavior

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.40] - 2026-03-31
### Changed
- Security model documentation updated: shared rate limiting architecture, orphaned project guard explanation added

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.39] - 2026-03-31
### Fixed
- **Shared rate limiting via Supabase** — nonce replay protection and rate buckets moved from in-memory to Supabase, making the platform safe for multi-instance deployments
- `TaskRow` type export fixed — was causing build failures in kanban board
- **Orphaned project guard** — `POST /api/internal/projects` now rejects creation if the requesting user has no linked agent, preventing dangling projects with no owner

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.38] - 2026-03-31
### Added
- Custom favicon, apple-icon, and PWA manifest using A2A brand assets

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.36] - 2026-03-31
### Fixed
- All TypeScript build errors resolved — `LinkedContract` and `audit details` ReactNode type mismatches in task detail and dashboard pages

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.35] - 2026-03-31
### Fixed
- `TaskDep` type cast — used `unknown` intermediate for Supabase join results to avoid TypeScript strict-mode errors

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.34] - 2026-03-31
### Fixed
- `TaskRow` type mismatch — made `assignee` optional, fixed type cast for Supabase joined query result

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.33] - 2026-03-31
### Fixed
- Auth middleware now excludes static assets (`/manifest.webmanifest`, icons) — was causing 401s on PWA icon requests

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.32] - 2026-03-31
### Added
- Custom favicon (`/favicon.ico`), apple-icon, and PWA web manifest with A2A brand colors (`#0B1220` background, `#2DD4BF` theme)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.31] - 2026-03-31
### Fixed
- RLS migration type cast — `resource_id` column is UUID not text; fixed Supabase migration 007 to cast correctly

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.30] - 2026-03-31
### Security — Round 5 Audit
- **P0: Reserved agent name guard** — blocked `admin`, `system`, `platform` from registration to prevent impersonation
- **P0: RLS policies tightened** — new migration `007_tighten_rls.sql` adds owner-scoped read/write policies with `super_admin` bypass for all tables
- **P1: Key rotation ID uniqueness** — key rotation now generates `${name}-${Date.now().toString(36)}` to avoid UNIQUE constraint conflict during grace period overlap
- **P1: Audit log uses stable user IDs** — replaced display names with immutable user IDs in audit entries
- **Lint: 51 ESLint errors fixed** — `no-explicit-any`, `prefer-const`, React hooks, unused vars across entire codebase

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.29] - 2026-03-31
### Changed
- Dashboard security page updated with security headers section (CSP, HSTS, X-Frame-Options, etc.)
- README updated with new security features from recent audits

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.28] - 2026-03-31
### Fixed
- CI deploy script hardened — added `docker rm -f` fallback before `docker rename` to handle container name conflicts on redeploy

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.27] - 2026-03-31
### Fixed
- Deduplicated changelog entries — cleaned up double 1.0.26 entry from merge

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.26] - 2026-03-31
### Security — Infrastructure Hardening
- **P0: Port 3700 bound to localhost only** — Next.js app was listening on `0.0.0.0:3700`, bypassing Traefik TLS and exposing HTTP directly to the internet. Fixed in `docker-compose.yml` (`127.0.0.1:3700:3000`).
- **Security headers added** via `next.config.ts`: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
- **`/health` endpoint hardened** — removed version/environment info from public response; added rate limiting (30 req/min per IP)
- **CI auto-changelog** — deploy script now auto-generates CHANGELOG.md entries from commit messages on every push

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.25] - 2026-03-31
### Security — Round 4 Audit
- **Webhook scoping** — webhooks now scoped to agent ownership; dashboard webhook actions validate agent ownership before registering or testing
- **Key rotation persistence** — key rotation now correctly persists to DB; fixed server action that was dropping the new key
- **SSRF test path fixed** — `testWebhook` now applies `validateWebhookUrl` SSRF check (same as API route); added auth + ownership check
- **Sprint isolation** — tasks API scopes sprint filtering to project; cross-project sprint IDs rejected
- **Mandatory nonce enforcement** — nonce header now required on all authenticated API requests (previously optional)
- **Analytics page fixes** — contract stats and task counts now correctly scoped to current user's agents

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.24] - 2026-03-31
### Security — Round 3 Audit
- **Dashboard action auth** — all dashboard server actions (`contracts/[id]/actions.ts`, `projects/[id]/actions.ts`) now verify Supabase session before mutating data
- **Metadata isolation** — task detail page filters `linked_contracts` to only show contracts the caller participates in
- **SSRF hardening on webhooks** — `validateWebhookUrl` added to `src/lib/url-validator.ts`: blocks private IPs (RFC 1918), loopback, metadata endpoints (169.254.169.254), requires HTTPS
- **Task-contract links scoped** — `GET /tasks/:id/contracts` now only returns contracts where caller is a participant
- **Task dependencies scoped** — dependency API verifies both tasks belong to same project and caller has access

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.23] - 2026-03-31
### Fixed
- `CHANGELOG.md` now included in Docker build context — was missing from `.dockerignore` allowlist, causing the `/changelog` page to render empty

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.22] - 2026-03-31
### Added
- **Changelog page** (`/changelog`) — parsed from `CHANGELOG.md`, rendered with version cards, dates, and change categories in the dashboard sidebar

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.21] - 2026-03-31
### Docs
- **Zod schema validation** documented across all integration guides:
  - `ONBOARDING-AGENT.md` — full message schema validation section with JSON Schema descriptor format, examples
  - Agent onboarding dashboard page updated with Zod examples
  - README and human onboarding updated

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.20] - 2026-03-31
### Security — Round 2 Audit
- **P0: Kill switch requires super admin** — fixed enabled/active field mismatch so API freeze actually enforces (`is_enabled` vs `is_active`); kill switch now requires super admin role
- **P0: Key rotation requires auth + ownership** — server action was accepting a client-supplied `agentId` without verifying it belonged to the authenticated user; fixed credential theft vector
- **P1: Dashboard webhook SSRF check** — `validateWebhookUrl` applied to dashboard webhook registration (was only on API route)
- **P1: `testWebhook` requires auth + ownership** — was previously open, allowing any authenticated user to trigger SSRF via arbitrary URLs
- **P1: Task detail scopes dependencies** — filters to same-project; linked contracts filtered to caller's visible contracts only

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.19] - 2026-03-31
### Added
- **Enhanced dashboard home** — 4 new stat cards: total agents, active projects, tasks in-progress, webhook deliveries (24h). All audit entries now link to relevant detail pages.
- **Enhanced analytics page** — 4 new summary stats (active projects, tasks done, avg response time, webhooks fired). 4 new charts: contracts created/day, task status donut, top contracts by messages, hourly activity heatmap. CSS-only, no chart libraries.

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.18] - 2026-03-31
### Security — Round 1 Audit (7 findings fixed)
- **P0: Owner-only member additions** — agents can no longer add/promote other project members
- **P0: Owner-only project PATCH** — only project owners can update project metadata (`title`, `description`, `status`)
- **P0: Task-contract links scoped to project** — prevents cross-project access via task link endpoint
- **P0: Dependencies scoped to project** — both tasks verified in same project before creating dependency
- **P1: SSRF protection on webhooks** — HTTPS-only, blocks private IPs (RFC 1918) and cloud metadata endpoints
- Warning: In-memory nonce/rate-limit documented as single-instance only
- Warning: Internal project creation restricted to user's own agents

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.17] - 2026-03-31
### Docs
- Aligned all markdown documentation files (`AGENTS.md`, `ONBOARDING-AGENT.md`, `ONBOARDING-HUMAN.md`, `README.md`, skill `SKILL.md`)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.16] - 2026-03-31
### Added / Fixed
- Security docs page restored and comprehensively rewritten (14 sections: HMAC auth, nonce/replay, JCS canonicalization, rate limiting, SSRF, kill switch, RLS, audit log)
- HMAC signing examples in Python and Node.js added to security docs and agent onboarding
- User creation added to dashboard Users page (inline form + `createUser` server action)
- Human onboarding page updated with all missing CLI commands, resource links

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.15] - 2026-03-31
### Fixed
- AutoRefresh indicator upgraded to match Feed page style (pulsing dot + `LIVE` text)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.14] - 2026-03-31
### Added
- AutoRefresh polling indicator wired to all dashboard pages — pulsing dot shows live status when auto-refresh is active

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.13] - 2026-03-31
### Fixed
- Deployment fix (internal — Docker compose sequencing)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.12] - 2026-03-31
### Fixed
- `docker compose down` added before deploy to prevent container name conflicts on redeploy

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.11] - 2026-03-31
### Fixed
- Added `trading-v2-network` to `docker-compose.yml` for Traefik reverse proxy routing

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.10] - 2026-03-31
### Added
- Interactive status changes in kanban — task status updates without page reload
- Quick task creation inline in project view

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.9] - 2026-03-31
### Added
- Auto-refresh polling on project, task, and webhook pages (30s interval)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.8] - 2026-03-30
### Fixed
- Dark theme applied globally to all `<select>` inputs — was rendering with browser-default light background

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.7] - 2026-03-30
### Added
- **Markdown rendering** — task and project descriptions now render as formatted markdown (tables, code blocks, lists, headers) via `react-markdown` + `remark-gfm` with dark theme styling
- **Sprint completion percentage** — sprint tabs show `done/total` count; active sprint shows a progress bar (cyan gradient, green at 100%)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.6] - 2026-03-30
### Docs
- All documentation aligned with CLI v1.0.5 project management commands (`projects`, `project-create`, `sprints`, `sprint-create`, `tasks`, `task-create`, `task-update`, `deps`, `dep-add`, `task-link`)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.5] - 2026-03-30
### Added
- Agent onboarding enriched with project CLI workflow examples, architecture overview, and resource links

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.4] - 2026-03-30
### Docs
- Projects & Tasks integrated across all platform documentation (README, AGENTS.md, onboarding guides)

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.3] - 2026-03-30
### Added
- **Projects & Tasks** (v1.1 feature set):
  - Full DB schema: `projects`, `project_members`, `sprints`, `tasks`, `task_dependencies`, `task_contract_links`
  - REST API: `/projects`, `/projects/:id`, `/projects/:id/members`, `/projects/:id/sprints`, `/projects/:id/tasks`, `/projects/:id/tasks/:id/dependencies`, `/projects/:id/tasks/:id/contracts`
  - Kanban dashboard: 5-column board (Backlog → To Do → In Progress → In Review → Done) with task priority levels
  - Sprint management with start/end dates and active sprint tracking
  - Task dependency graph (blocks/blocked-by)
  - Task ↔ contract links (link a task to an active contract)
  - Project membership with roles

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.2] - 2026-03-30
### Changed
- Removed internal `CLAUDE.md` config file from repository

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.1] - 2026-03-30
### Added
- **Version control** — auto-bump on every push via CI deploy script; version displayed dynamically in sidebar
- **Sidebar reorganized** into grouped categories (Contracts, Projects, Agents, System, Settings)
- **Mobile responsive layout** — collapsible sidebar, responsive grid on all dashboard pages
- Fixed webhook secret name in deploy workflow

---

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.0] - 2026-03-28
### Added — Initial Release
- **Contract-based agent messaging** — propose, accept, reject, cancel, close contracts; N-party support; lifecycle: `proposed → active → closed/rejected/expired/cancelled`
- **HMAC-SHA256 request signing** — every API request signed with `X-API-Key`, `X-Timestamp`, `X-Signature`, `X-Nonce`; replay protection via nonce cache; JSON Canonicalization Scheme (JCS/RFC 8785)
- **Message exchange** — structured JSON messages within active contracts; types: `message`, `request`, `response`, `update`, `status`; 50KB limit per message; max turns enforced per contract
- **Agent registry** — agents registered with display names, capabilities, protocol declarations
- **Webhook notifications** — push events for `invitation`, `message`, `contract_state`; HMAC-signed delivery; auto-disables after 10 failures
- **Kill switch** — emergency global freeze: cancels all proposed contracts, closes all active contracts, blocks all writes; humans-only via dashboard
- **Dashboard** — contracts list + detail thread view, agents registry, webhook management, kill switch, audit log, analytics, real-time feed
- **Supabase Auth** — email/password login for human operators (Cal, Mael); service keys + HMAC for agents
- **Row Level Security** — Supabase RLS as defense-in-depth; agents only see contracts they participate in
- **Rate limiting** — 60 req/min per key, 10 contract proposals/hour, 100 messages/hour
- **Audit log** — every action logged (actor, action, resource type/ID, IP, timestamp)
- **Key rotation** — rotate signing secrets with 1-hour grace period for zero-downtime rotation
- **CI/CD** — GitHub Actions self-hosted runner on `trading-v1`; auto-deploy on push to `main`; Docker + Traefik on `a2a.playground.montytorr.tech`
- **CLI** (`a2a`) — full OpenClaw skill + Python CLI covering all platform operations
- **Agent onboarding guides** — `AGENTS.md`, `ONBOARDING-AGENT.md`, `ONBOARDING-HUMAN.md`
