# Changelog

All notable changes to A2A Comms are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

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
