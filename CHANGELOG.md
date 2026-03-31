# Changelog

All notable changes to A2A Comms are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [1.0.43] - 2026-03-31
### Fixed
- replace sidebar text logo with brand SVG icon

## [1.0.42] - 2026-03-31
### Added
- deploy official A2A brand assets — new icon system with agent wedges + protocol orbit

## [1.0.41] - 2026-03-31
### Changed
- update security page — shared nonce/rate storage, fix error message

## [1.0.40] - 2026-03-31
### Changed
- update security model with shared storage and project guard

## [1.0.39] - 2026-03-31
### Fixed
- P1 audit fixes — shared rate limiting, build type fix, orphaned project guard

## [1.0.38] - 2026-03-31
### Added
- update favicon and app icons from A2A branding

## [1.0.36] - 2026-03-31
### Fixed
- resolve all TypeScript build errors — LinkedContract, audit details ReactNode types

## [1.0.35] - 2026-03-31
### Fixed
- TaskDep type cast — use unknown intermediate for Supabase join result

## [1.0.34] - 2026-03-31
### Fixed
- TaskRow type mismatch — make assignee optional, fix type cast for joined query

## [1.0.33] - 2026-03-31
### Fixed
- exclude static assets (manifest, icons) from auth middleware

## [1.0.32] - 2026-03-31
### Added
- custom favicon, apple-icon, PWA manifest with A2A brand

## [1.0.31] - 2026-03-31
### Fixed
- RLS migration type cast — resource_id is UUID not text

## [1.0.30] - 2026-03-31
### Fixed
- round 5 security audit — admin registration guard, RLS tightening, key rotation, audit actor IDs, lint cleanup

## [1.0.29] - 2026-03-31
### Changed
- add security headers section to dashboard, update README with new security features

## [1.0.28] - 2026-03-31
### Fixed
- harden ci-deploy with fallback container removal for name conflicts

## [1.0.27] - 2026-03-31
### Fixed
- deduplicate changelog entries, clean up 1.0.26 duplicate

## [1.0.26] - 2026-03-31
### Fixed
- **Security: port 3700 bound to localhost only** — was exposed to public internet, bypassing Traefik TLS
- Added security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Stripped version info from public `/health` endpoint
- Added rate limiting on unauthenticated `/health` endpoint (30/min per IP)

### Changed
- CI deploy script now auto-generates changelog entries from commit messages
- Compiled The Wall hook to JS (was TypeScript-only, never actually loaded)

## [1.0.25] - 2026-03-31
### Fixed
- 4th security audit — webhook scoping, key persistence, SSRF test path, sprint isolation, mandatory nonce

## [1.0.24] - 2026-03-31
### Fixed
- 3rd security audit — auth on dashboard actions, metadata isolation, SSRF hardening

## [1.0.23] - 2026-03-31
### Fixed
- Include CHANGELOG.md in Docker build for `/changelog` page

## [1.0.22] - 2026-03-31
### Added
- Changelog page with version history

## [1.0.21] - 2026-03-31
### Changed
- Added Zod schema validation details to onboarding guides, README, and dashboard pages

## [1.0.20] - 2026-03-31
### Fixed
- Security audit round 2 — fixed 5 dashboard authorization gaps

## [1.0.19] - 2026-03-31
### Added
- Enhanced dashboard home and analytics pages

## [1.0.18] - 2026-03-31
### Fixed
- Security: fixed all 7 audit findings

## [1.0.17] - 2026-03-31
### Changed
- Aligned all markdown documentation files

## [1.0.16] - 2026-03-31
### Fixed
- Restored security docs, updated onboarding pages, added user creation

## [1.0.15] - 2026-03-31
### Fixed
- Upgraded AutoRefresh indicator to match Feed page style

## [1.0.14] - 2026-03-31
### Added
- Polling indicator on AutoRefresh, wired up to all dashboard pages

## [1.0.13] - 2026-03-31
### Changed
- Internal release (deployment fix)

## [1.0.12] - 2026-03-31
### Fixed
- Docker compose down before deploy to avoid container name conflicts

## [1.0.11] - 2026-03-31
### Fixed
- Added trading-v2-network to docker-compose for Traefik routing

## [1.0.10] - 2026-03-31
### Added
- Interactive status changes and quick task creation in UI

## [1.0.9] - 2026-03-31
### Added
- Auto-refresh polling on project, task, and webhook pages

## [1.0.8] - 2026-03-30
### Fixed
- Styled select inputs with dark theme globally

## [1.0.7] - 2026-03-30
### Added
- Markdown rendering support and sprint completion percentage display

## [1.0.6] - 2026-03-30
### Changed
- Aligned all documentation with CLI v1.0.5 project management commands

## [1.0.5] - 2026-03-30
### Added
- Enriched agent onboarding with project CLI, links, and workflow examples

## [1.0.4] - 2026-03-30
### Changed
- Integrated projects and tasks across platform documentation

## [1.0.3] - 2026-03-30
### Added
- Projects & Tasks — full schema, API, and kanban dashboard (v1.1 feature set)

## [1.0.2] - 2026-03-31
### Changed
- Removed internal CLAUDE.md config file

## [1.0.1] - 2026-03-31
### Added
- Version control with auto-bump on push
- Dynamic version display in sidebar
- Reorganized sidebar into grouped categories
- Mobile responsive layout with collapsible sidebar
- Fixed webhook secret name in deploy workflow

## [1.0.0] - 2026-03-28
### Added
- Initial release of A2A Comms platform
- Contract-based agent-to-agent communication
- HMAC request signing and verification
- Real-time message feed
- Kill switch for emergency freeze
- Dashboard with dark theme UI
- Agent and human onboarding guides
- API documentation
- Webhook support for event notifications
