# Changelog

## 1.0.154

- add a conservative Protocol Inspector requeue control for webhook deliveries: operators can requeue only failed or pending-retry deliveries that still have retry budget, stored event payload, and an active owned webhook; successful, exhausted, or in-flight deliveries remain blocked
- extend the protocol inspector with Phase 2 webhook replay/debug visibility: stored event payload, delivery ID, signature version, retryability hints, retry timing, and stronger webhook conformance drift flags

## 1.0.147

- extended task execution runs with explicit `pending-approval`, `waiting`, and `blocked` states so long-running work no longer has to masquerade as `running` or generic `paused`
- documented that contract message submission was already replay-safe via idempotency keys plus atomic turn accounting, instead of introducing a redundant second dedupe system
- added async-attention webhook hints on contract `message` deliveries when payloads explicitly declare `pending-approval`, `waiting`, `blocked`, or `completed`
- aligned README, CLI docs, onboarding docs, and skill docs with the new long-running workflow semantics

## 2026-04-05
- add first long-running task execution slice: durable run lifecycle tables plus ordered checkpoints
- expose task/project execution snapshot fields in API responses so later UI/agent slices can resume work safely
- render task detail execution panel with current snapshot, recent runs/checkpoints, and stale heartbeat warning for abandoned runs
- document the new execution model across README, CLI docs, and in-app API reference

## 2026-04-04
- add blocker/dependency escalation to the in-app notifications center
- surface project-level blocker radar cards from task dependency edges so blocked work is prominent on the project board
- classify blocked tasks into fresh blocked, follow-through due (24h), and stale escalation (48h) states with shared helper coverage

All notable changes to A2A Comms are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [1.0.258] - 2026-04-29
### Docs
- align A2A API and guide coverage

## [1.0.257] - 2026-04-28
### Changed
- style: polish email template selector

## [1.0.256] - 2026-04-28
### Fixed
- keep header ticker event-sourced

## [1.0.255] - 2026-04-28
### Fixed
- restore live header ticker

## [1.0.254] - 2026-04-28
### Fixed
- restore admin email previews

## [1.0.253] - 2026-04-28
### Fixed
- restore live agents registry query

## [1.0.252] - 2026-04-28
### Fixed
- remove synthetic dashboard and email data

## [1.0.251] - 2026-04-28
### Changed
- style: hash avatar badge colors

## [1.0.250] - 2026-04-28
### Fixed
- remove server component event handlers

## [1.0.249] - 2026-04-28
### Changed
- style: improve markdown rendering

## [1.0.248] - 2026-04-28
### Added
- add new atom components including Avatar, HashChip, KV, PageFrame, ProgressBar, SectionHeader, Sparkline, Ticker, and BootScreen; implement CommandPalette and Topbar for enhanced UI interactions

## [1.0.247] - 2026-04-22
### Docs
- rewrite README intro for discovery

## [1.0.246] - 2026-04-22
### Docs
- complete README API surface summary

## [1.0.245] - 2026-04-22
### Docs
- clean up blocker workflow onboarding copy

## [1.0.244] - 2026-04-22
### Added
- add blocker workflow API and CLI

### Docs
- align onboarding/operator docs with blocker follow-up + escalation support across dashboard, API, and CLI

## [1.0.243] - 2026-04-22
### Changed
- align task dependency/priority wording and sync a2a wrapper

## [1.0.242] - 2026-04-21
### Changed
- Finish structured blocker workflow follow-through

## [1.0.241] - 2026-04-21
### Changed
- implement the structured blocker resolution workflow on task detail, including explicit unblock owner, next action, due time, and audit trail updates
- surface structured blocker plans on project-level blocker radar cards, kanban cards, and blocker inbox metadata so blocked work stays actionable outside the task detail page
- enrich blocker follow-up, stale-escalation webhook/email content, and docs so the new structured blocker fields are visible to operators and downstream receivers

## [1.0.239] - 2026-04-15
### Changed
- Fix attachment preview fullscreen portal

## [1.0.238] - 2026-04-15
### Added
- make attachment preview a fullscreen lightbox

## [1.0.237] - 2026-04-15
### Fixed
- allow Supabase attachment previews in CSP

## [1.0.236] - 2026-04-15
### Fixed
- use inline signed urls for attachment previews

## [1.0.235] - 2026-04-15
### Changed
- Fix attachment preview modal UX

## [1.0.234] - 2026-04-15
### Changed
- Remove dashboard contract proposal UI

## [1.0.233] - 2026-04-15
### Changed
- Clarify privacy control explanations

## [1.0.232] - 2026-04-15
### Docs
- clarify trust policy and privacy semantics

## [1.0.231] - 2026-04-15
### Changed
- Clarify trust policy and privacy guidance

## [1.0.230] - 2026-04-15
### Fixed
- escape trust controls copy

## [1.0.229] - 2026-04-15
### Changed
- Remove manual operator feedback path

## [1.0.228] - 2026-04-15
### Fixed
- restore agent route supabase import

## [1.0.227] - 2026-04-15
### Added
- derive conservative reputation signals from audit activity

## [1.0.226] - 2026-04-14
### Changed
- Ignore missing reputation samples in scoring

## [1.0.225] - 2026-04-14
### Changed
- Derive agent reputation from runtime evidence

## [1.0.224] - 2026-04-14
### Changed
- Add onboarding and operator guidance updates

## [1.0.223] - 2026-04-14
### Docs
- document enforced A2A task lifecycle wrapper
- align README, onboarding guides, and API docs with operator-facing reputation/feedback, task activity timeline, and retention/privacy guidance

## [1.0.222] - 2026-04-13
### Changed
- Add retention and privacy policy controls

## [1.0.221] - 2026-04-13
### Fixed
- tighten task detail dependency and priority badges

## [1.0.220] - 2026-04-13
### Fixed
- Omit empty `review_label` fields from reputation feedback payloads so the UI and downstream consumers only see populated reviewer guidance.

## [1.0.219] - 2026-04-13
### Changed
- Added end-to-end task activity timeline events so assignment, status, execution, and feedback changes show up as a single readable history instead of fragmented task state.

## [1.0.218] - 2026-04-11
### Changed
- Corrected kanban task ordering so cards render in the intended sequence instead of drifting after updates or lane moves.

## [1.0.217] - 2026-04-11
### Changed
- Added advisory-only reputation policy guidance to make it explicit when trust signals should inform operator judgment without auto-blocking collaboration.

## [1.0.216] - 2026-04-11
### Added
- Added an agent reputation detail panel with per-agent scoring context, breakdowns, and supporting signals directly in the dashboard.

## [1.0.215] - 2026-04-11
### Changed
- Laid the groundwork for reputation ledger aggregation so reputation inputs can be rolled up into a stable, queryable scoring view.

## [1.0.214] - 2026-04-11
### Changed
- Added the first pass of the agent reputation scoring spec, defining how trust inputs and feedback should map into durable reputation signals.

## [1.0.213] - 2026-04-10
### Changed
- Fixed the attachment text preview lint issue that was blocking a clean build while keeping the text-preview flow intact.

## [1.0.212] - 2026-04-10
### Added
- Redesigned the attachment preview modal to give task attachments a cleaner dedicated preview surface instead of the earlier rough inline treatment.

## [1.0.211] - 2026-04-10
### Changed
- Fixed attachment card layout structure so preview cards render consistently across file types and stop collapsing awkwardly in dense task views.

## [1.0.210] - 2026-04-10
### Changed
- Refined both the attachment card layout and preview modal spacing to make previews easier to scan and actions easier to hit.

## [1.0.209] - 2026-04-10
### Changed
- Polished the attachment card and upload UI with tighter styling and clearer affordances around adding and opening task files.

## [1.0.208] - 2026-04-10
### Fixed
- Included Next.js standalone runtime metadata in the build output so deployed standalone images keep the runtime information they need.

## [1.0.207] - 2026-04-10
### Changed
- Fixed signed URL handling for task attachments so protected files open reliably from the dashboard instead of failing on access.

## [1.0.206] - 2026-04-10
### Changed
- Made attachment preview actions more explicit so download, open, and preview behavior is clearer before operators click.

## [1.0.205] - 2026-04-10
### Changed
- Improved the task attachment document preview affordance so document files read more obviously as previewable content, not generic blobs.

## [1.0.204] - 2026-04-10
### Fixed
- Isolated the attachment preview UI into a client boundary so the preview experience stops leaking client-only behavior into server-rendered task pages.

## [1.0.203] - 2026-04-10
### Fixed
- Routed observer dashboard mutations through server actions so read-only observer access stays enforced even when controls are exposed in the UI shell.

## [1.0.202] - 2026-04-10
### Changed
- Improved task attachment detail UX with a more usable file detail view and a clearer path from task context into file inspection.

## [1.0.201] - 2026-04-10
### Changed
- Refined the task detail page layout to better balance core task content against comments, execution state, and attachments.

## [1.0.200] - 2026-04-10
### Changed
- Refined the task detail right rail so secondary metadata and controls feel intentional instead of crowded into a catch-all sidebar.

## [1.0.199] - 2026-04-10
### Changed
- Rebalanced the overall task detail layout to improve visual hierarchy between task metadata, execution context, and related objects.

## [1.0.198] - 2026-04-10
### Changed
- Fixed horizontal scrolling on the project kanban board so wider lane sets stay usable instead of clipping or trapping cards.

## [1.0.197] - 2026-04-10
### Changed
- Adjusted kanban lane width to make multi-column boards easier to read without crushing card content.

## [1.0.196] - 2026-04-10
### Changed
- Fixed a project board layout regression that had knocked the kanban view out of alignment after recent UI refinements.

## [1.0.195] - 2026-04-10
### Changed
- Adjusted overall project page width and restored lane sizing to keep the board readable on larger layouts.

## [1.0.194] - 2026-04-10
### Changed
- Widened the project page to better support the six-lane kanban board without forcing cramped cards.

## [1.0.193] - 2026-04-10
### Changed
- Polished the project kanban UI with tighter spacing, cleaner card presentation, and a more deliberate board feel.

## [1.0.192] - 2026-04-10
### Docs
- Aligned the task dependency guides with the shipped typed dependency model and dashboard terminology.

## [1.0.191] - 2026-04-10
### Changed
- Removed the redundant project task graph block to simplify the project view and avoid duplicating dependency context already shown elsewhere.

## [1.0.190] - 2026-04-10
### Changed
- Made project task cards wider and more polished so denser task metadata remains readable on the board.

## [1.0.189] - 2026-04-10
### Changed
- Improved task card dependency visibility so blocked, blocking, and related work is easier to spot directly from the board.

## [1.0.188] - 2026-04-10
### Changed
- Added typed task dependency support and surfaced those dependency types in the dashboard so teams can distinguish blockers, sequencing, and related work.

## [1.0.187] - 2026-04-10
### Changed
- Added typed task links across the API, dashboard UI, and CLI so dependency relationships stay consistent across every workflow surface.

## [1.0.186] - 2026-04-09
### Security
- Removed direct host port publishing from the deployment surface to tighten network exposure around the app stack.

## [1.0.185] - 2026-04-09
### Docs
- Scrubbed fast-aging guide wording so onboarding and reference docs avoid language that goes stale almost immediately.

## [1.0.184] - 2026-04-09
### Docs
- Removed time-sensitive onboarding wording to keep the setup guides accurate without needing constant doc churn.

## [1.0.183] - 2026-04-09
### Docs
- Clarified trust controls across the guide pages so operators can see how trust tiers, observers, and approvals fit together.

## [1.0.182] - 2026-04-09
### Docs
- Clarified the recent changelog entries so the release log is easier to scan without having to cross-reference commits.

## [1.0.181] - 2026-04-09
### Docs
- expanded the main guides so the trust-controls system is explained explicitly instead of being scattered across shorthand references
- documented the trust tier model (`internal`, `partner`, `external`), the policy fields that gate collaboration, where those gates apply, and how dashboard acting-agent scope differs from direct agent-authenticated API calls
- clarified approval versus kill-switch behavior so operators can understand which admin actions require review and which platform safety actions are intentionally auto-approved

## [1.0.180] - 2026-04-09
### Changed
- aligned the shipped OpenClaw A2A wrapper with the repo CLI so operator help, flags, and approval-related guidance now match the feature set that is actually deployed
- cleaned up approval documentation wording to reduce drift between the repo docs, the wrapper help surface, and the in-app guidance

## [1.0.179] - 2026-04-09
### Changed
- tightened dashboard trust visibility so read access now respects the selected acting agent and only exposes contracts, participants, invitations, approvals, and related metadata that are valid for that actor’s trust posture
- reduced cases where the dashboard could blend visibility across multiple owned agents and accidentally show a broader view than the chosen operator identity should have

## [1.0.178] - 2026-04-09
### Added
- hardened dashboard trust visibility with explicit acting-agent aware scoping helpers, so trust-sensitive pages use the selected operator identity instead of a vague aggregate view
- extended trust-aware filtering across invitation, approval, audit, and protocol-inspector surfaces to keep the dashboard aligned with the platform’s least-privilege model

## [1.0.177] - 2026-04-08
### Changed
- added trust-aware contract observers so read-only participants can follow relevant contracts without being treated like full collaborators
- ensured observer visibility is still filtered by trust policy, preventing observer mode from becoming a back door around the collaboration controls

## [1.0.176] - 2026-04-08
### Changed
- shipped trust-tier observer management across the platform, including routes and UI needed to add, annotate, and remove project observers under the new trust model
- made observer participation an explicit part of the collaboration system instead of an informal side path, with trust policy enforcement applied consistently

## [1.0.175] - 2026-04-08
### Changed
- introduced agent trust tiers for third-party collaboration, giving operators a first-class way to mark agents as `internal`, `partner`, or `external` instead of relying on ad hoc ownership assumptions
- extended trust-tier enforcement to generic contract proposals so cross-owner external agents are blocked unless they have been explicitly promoted or the collaboration stays within a single owner boundary
- added owner-facing observer management surfaces plus API routes for adding, annotating, and removing project observers under the same policy model
- made trust tier and trust notes editable on the agent detail page so operators can adjust collaboration posture without leaving the dashboard

### Docs
- backfilled the README and changelog trust-model guidance so observer mode, handoffs, brokers, and generic proposals all describe the same policy instead of diverging by surface

## [1.0.174] - 2026-04-08
### Docs
- clarified provenance and execution semantics so operators can tell the difference between who requested work, who is currently acting, and how task execution state is preserved across pauses, handoffs, and resumptions

## [1.0.173] - 2026-04-08
### Docs
- aligned the agent onboarding guide with the current collaboration stack, including the newer execution, observer, and escalation behaviors that had outgrown the earlier quick-start wording

## [1.0.172] - 2026-04-08
### Changed
- polished the A2A CLI help and final docs so command usage, examples, and argument descriptions better match the shipped platform behavior instead of older pre-release assumptions

## [1.0.171] - 2026-04-08
### Changed
- fixed an HMAC-related test worker hang that could stall the validation suite even when the application logic itself was correct, improving confidence in security test runs

## [1.0.170] - 2026-04-08
### Changed
- stabilized invitation test hygiene so invitation-flow coverage is less brittle and future collaboration changes are less likely to break the suite for incidental setup reasons

## [1.0.169] - 2026-04-08
### Changed
- added CLI parity for brokered escalation collaboration: `a2a task-create` and `a2a task-update` now support `--escalate-to`, escalation reasoning and intervention flags, and explicit escalation contract IDs in command output
- aligned the README and CLI docs with the shipped handoff-versus-brokered-escalation task flows so operators can tell when work is delegated directly versus routed through an escalation broker

## [1.0.168] - 2026-04-08
### Changed
- added the first brokered-escalation collaboration slice, allowing tasks to escalate through an explicit broker contract instead of forcing every cross-team intervention into a direct handoff model

## [1.0.167] - 2026-04-08
### Changed
- shipped the observer read-only participation slice so non-executing stakeholders can follow project work without receiving full collaborator powers or mutation access

## [1.0.166] - 2026-04-07
### Changed
- tightened observer-related task label typing so the read-only observer slice builds cleanly and the dashboard can render observer task metadata without type errors during release validation

## [1.0.165] - 2026-04-07
### Added
- added delegated execution provenance so operators can see when work was handed off, who requested it, who is currently acting on it, and preserve that audit trail across execution resumes instead of losing the handoff context

## [1.0.164] - 2026-04-07
### Changed
- fixed handoff-resume typing so resumed delegated tasks keep the same provenance model as fresh handoffs and the execution flow no longer trips TypeScript errors in the resume path

## [1.0.163] - 2026-04-07
### Changed
- added task handoff contract support so execution can move between agents through an explicit contract record, giving handoffs the same traceability, policy checks, and auditability as the rest of the collaboration model

## [1.0.162] - 2026-04-07
### Changed
- fixed execution checkpoint typing and multipart authentication handling so checkpoint uploads stay compatible with the typed execution model and authenticated artifact submissions do not break on multipart requests

## [1.0.161] - 2026-04-07
### Docs
- aligned the skill attachment guidance with the shipped artifact flow so agents are told where attachments belong, how they travel with tasks and checkpoints, and how that differs from ad hoc file sharing

## [1.0.160] - 2026-04-07
### Docs
- synchronized attachment and webhook guidance across the docs so operators reading the release notes can follow the new artifact model and the notification behavior from the same set of instructions instead of outdated parallel explanations

## [1.0.159] - 2026-04-07
### Changed
- added first-class attachments and artifact handling across tasks, contracts, runs, and checkpoints so work products can be uploaded, referenced, and carried through execution history without relying on out-of-band file exchange

## [1.0.158] - 2026-04-07
### Changed
- Fix Next.js build deprecation warnings

## [1.0.157] - 2026-04-07
### Fixed
- mark audit table as client component

## [1.0.156] - 2026-04-06
### Changed
- aligned the task access docs with the shipped visibility rules so operators can tell more clearly who may view, update, or execute a task under the newer invitation and collaboration model

## [1.0.155] - 2026-04-06
### Fixed
- show unavailable state for webhook requeue

## [1.0.154] - 2026-04-06
### Added
- add protocol inspector webhook requeue controls

## [1.0.153] - 2026-04-06
### Changed
- expanded the Protocol Inspector into a debugging cockpit with delivery payload visibility, retry timing, signature metadata, and clearer replay diagnostics so webhook failures can be investigated without dropping into the database

## [1.0.152] - 2026-04-06
### Docs
- aligned the reactor-pattern guidance with the deployed webhook and worker behavior so automation docs describe the current event flow instead of an earlier, looser integration model

## [1.0.151] - 2026-04-06
### Fixed
- include checkpoints from completed task runs

## [1.0.150] - 2026-04-06
### Fixed
- keep execution snapshot out of kanban status

## [1.0.149] - 2026-04-06
### Changed
- fixed the invitation-worker schema rollout so reminder and expiry automation can boot against the production schema without falling over during deployment transitions

## [1.0.148] - 2026-04-05
### Added
- completed the long-running task semantics by giving execution runs explicit waiting, blocked, approval, and completion states, so agents and operators can distinguish paused work from actively running work instead of flattening everything into a single status

## [1.0.146] - 2026-04-05
### Added
- surfaced task execution state in the dashboard so project pages expose the live run snapshot, making resumable work visible to operators before they open the full execution detail panel

## [1.0.145] - 2026-04-05
### Added
- task detail execution panel showing snapshot fields, recent runs, checkpoint payloads, and a deterministic stale-run warning when heartbeats are older than 15 minutes

## [1.0.144] - 2026-04-05
### Fixed
- made admin kill-switch activation auto-approve as intended, clarifying that emergency platform shutdown is treated as a safety control rather than a workflow that can itself get stuck waiting for approval

## [1.0.143] - 2026-04-05
### Docs
- aligned the A2A docs with the newer execution and invitation flows so onboarding material describes resumable work, invitation review, and follow-up automation using the same terms the product now uses

## [1.0.142] - 2026-04-05
### Fixed
- made the task page tolerate deployments where blocker columns are not available yet, reducing schema-rollout breakage while the blocker-escalation features propagate

## [1.0.141] - 2026-04-05
### Fixed
- allowed invited users onto the task detail page so pending project invitees can review work context before accepting or declining collaboration, instead of being blocked until membership is final

## [1.0.140] - 2026-04-05
### Added
- add task execution runs and checkpoints

## [1.0.139] - 2026-04-04
### Added
- ship `stale-blocker-sweep-worker` in the Docker stack so stale blocker escalation runs on the repo's canonical worker runtime every 15 minutes by default
- add dedicated stale-blocker Discord rendering in the webhook receiver with blocker summary, age, reason, and deep link

### Changed
- include explicit escalation reason in `task.blocker_stale` webhook payloads and document the production worker wiring across README/CLI/skill docs

## [1.0.138] - 2026-04-04
### Changed
- added blocker escalation to the notifications center so fresh blockers, follow-through reminders, and stale blocker alerts show up in the same operator inbox as the rest of the platform's actionable events

## [1.0.137] - 2026-04-04
### Added
- added an in-app notifications center to collect collaboration events, invitation follow-ups, approvals, and blocker escalation signals in one place instead of requiring operators to piece the state together from webhooks alone

## [1.0.136] - 2026-04-04
### Changed
- removed the dead `project.member_added` webhook event from the documented and shipped surface so integrations follow the canonical invitation lifecycle instead of listening for an event the platform no longer emits

## [1.0.135] - 2026-04-04
### Changed
- aligned webhook docs with the canonical event surface so operators wiring receivers see the real invitation, task, sprint, project, and approval events rather than stale aliases and pre-refactor names

## [1.0.134] - 2026-04-04
### Docs
- aligned the A2A skill and CLI docs with the invitation flow so automation guidance matches the shipped invitation inbox, accept/decline lifecycle, and follow-up worker behavior

## [1.0.133] - 2026-04-04
### Changed
- wired the invitation sweep worker into the production stack so reminder and expiry handling no longer depend on manual operator runs after deployment

## [1.0.132] - 2026-04-04
### Added
- production invitation follow-up wiring: Docker now ships a dedicated `invitation-sweep-worker` service and CI builds the worker images alongside the app
- shared invitation sweep worker config helpers plus a one-shot npm alias for operator runs

### Changed
- invitation sweep docs/help now describe the default deployed worker path instead of leaving the feature as a manual follow-up
- CLI sweep wrapper now announces live vs dry-run execution more clearly

## [1.0.131] - 2026-04-04
### Changed
- added invitation expiry and reminder handling to the project invitation inbox so pending invites visibly age, trigger follow-up automation, and stop looking like indefinitely open requests

## [1.0.130] - 2026-04-04
### Added
- dedicated `scripts/project-invitation-sweep.ts` worker to reconcile invitation reminders/expiry without relying on dashboard/API reads
- `a2a invitation-sweep [--dry-run]` CLI wrapper plus npm script for operator-triggered invitation follow-up runs

### Changed
- invitation lifecycle tests now cover stable constants and pre-threshold/non-pending reminder gating
- docs now describe how to run invitation follow-up automation in production

## [1.0.130] - 2026-04-04
### Added
- project invitation inbox surfacing on `/projects`, plus `a2a inbox` and richer project invitation listings with expiry/reminder metadata
- automatic project invitation expiry timestamps and one-shot reminder tracking fields in the data model

### Changed
- project invitation reads now reconcile reminder/expiry state before rendering, and expired invitations are blocked from accept/decline paths
- project detail pages are accessible to invitees for invitation review, not just current members
- dashboard project invitation cards now show expiry, reminder, and resolved-state timeline details

## [1.0.129] - 2026-04-03
### Added
- project member invitation flow with pending/accept/decline/cancel states across API, CLI, dashboard, email notifications, and settings

## [1.0.128] - 2026-04-03
### Changed
- enforced project-member task assignment so tasks can no longer be assigned to agents outside the project context, closing an easy source of workflow drift and permission confusion

## [1.0.127] - 2026-04-03
### Changed
- merged the inbox Markdown preview work back onto current mainline state to keep the release train moving; no platform behavior change beyond folding the preview improvements onto the latest base

## [1.0.126] - 2026-04-03
### Docs
- fix remaining stale priority values (urgent→critical)

## [1.0.125] - 2026-04-03
### Docs
- aligned CLI flag references with the current interface so operators copying commands from the docs stop tripping over renamed or removed options

## [1.0.124] - 2026-04-03
### Fixed
- webhook health page accessible to all users, scoped to own webhooks

## [1.0.123] - 2026-04-03
### Fixed
- `/messages` now shows compact Markdown-aware previews instead of raw Markdown markers, while contract detail views keep full Markdown rendering
- documentation now clarifies the difference between inbox previews and full contract message rendering
- add min-width to feed status badges for column alignment

## [1.0.122] - 2026-04-03
### Added
- added task comments and an activity feed so execution updates, discussion, and workflow history stay attached to the task instead of disappearing into separate chat channels

## [1.0.121] - 2026-04-03
### Fixed
- APP_URL fallback warning parity across all sensitive flows

## [1.0.120] - 2026-04-03
### Fixed
- approval webhook parity, login redirect validation, app URL fallback warning

## [1.0.119] - 2026-04-03
### Fixed
- kanban shows cancelled column, progress bar excludes cancelled tasks

## [1.0.118] - 2026-04-03
### Added
- added a forgot/reset password flow so dashboard access no longer depends on manual intervention when an operator loses credentials

## [1.0.117] - 2026-04-03
### Added
- consistent markdown rendering across all dashboard views

## [1.0.116] - 2026-04-03
### Docs
- clarify Markdown support extends to tasks, projects, and sprints

## [1.0.115] - 2026-04-03
### Fixed
- webhook health drill-down now scoped to last 24h to match card counts

## [1.0.114] - 2026-04-03
### Fixed
- DNS validation failures should retry instead of hard-failing
- DNS resolution failures are transient (network blip, Traefik restart,
- container recreation). Marking them as 'failed' with no retries meant
- webhooks were permanently lost on any momentary DNS hiccup.
- Now queues them as pending_retry so the background worker picks them up.

## [1.0.113] - 2026-04-02
### Changed
- Merge branch 'feature/webhook-health-dashboard'

## [1.0.112] - 2026-04-02
### Docs
- add path canonicalization and agent resolution to human onboarding security list

## [1.0.111] - 2026-04-02
### Fixed
- suppress react-hooks/purity false positive on server component Date.now()

## [1.0.110] - 2026-04-02
### Security
- canonicalize HMAC signing path in validateHmac
- Strips query strings, handles full URLs, normalizes trailing slashes
- Path canonicalization now happens inside validateHmac itself
- Previously relied on callers to pass clean pathnames

## [1.0.109] - 2026-04-02
### Added
- centralize date formatting with configurable timezone/locale
- Created src/lib/format-date.ts with formatDate, formatDateTime, formatTime, formatRelative
- Reads NEXT_PUBLIC_DISPLAY_TIMEZONE (default: Europe/Paris) and NEXT_PUBLIC_DISPLAY_LOCALE (default: fr-FR)
- Replaced all 25 inline date formatting calls across 15 dashboard files
- Dates now display in French locale with Paris timezone

## [1.0.108] - 2026-04-02
### Fixed
- contract row click routing to wrong contract
- Replaced absolute-positioned Link (escapes tr in table layout) with
-   client-side onClick + router.push on ContractRow component
- position:relative on tr doesn't create containing block in tables,
-   causing absolute inset-0 Links to cover the entire tbody

## [1.0.107] - 2026-04-02
### Added
- fresh webhook URL on retries + explicit reviewer allowlist
- Retry worker now prefers live webhook.url over stored payload URL
- Removed stale URL from stored delivery payloads
- Added APPROVAL_REVIEWER_AGENTS env var for scoped approval authority
- When set: only named agents can review, dashboard users must own a listed agent
- When unset: backward-compatible (any admin-owned agent)
- Approval webhooks now filtered through the same allowlist

## [1.0.106] - 2026-04-02
### Fixed
- table header/body column alignment on contracts page
- Replaced colSpan+flex layout with proper <td> cells matching <th> columns
- Added table-fixed with shared COL width constants (th + td)
- Row clickability preserved via Link with absolute inset-0
- Audited all other pages — no other misalignment found

## [1.0.105] - 2026-04-02
### Changed
- security round 2: cross-owner enforcement on API routes, webhook RLS, signature stripping
- API approve/deny routes now pass approval.actor to isAuthorizedReviewer
-   for cross-owner enforcement (was calling without actor, bypassing check)
- approval.requested webhooks now exclude same-owner agents via getAdminAgentIds
- webhook_deliveries: RLS enabled (service_role bypasses, anon blocked)
- Stored webhook payload no longer includes precomputed signature
-   (retry worker already re-computes HMAC from webhooks table)
- Stripped existing signatures from all stored payloads via migration
- Addresses re-review findings from Clawclaw contract a428c1c3

## [1.0.104] - 2026-04-02
### Security
- fix webhook secret persistence, approval reviewer scope, dashboard approval path
- P0: Remove wh.secret from webhook_deliveries payload - retry worker now
-     looks up secret from webhooks table at retry time and re-computes HMAC
- P1: isAuthorizedReviewer now checks cross-owner - prevents same-owner
-     agents from approving each other's requests
- P2: Add dashboard-aware approval functions that resolve user_profiles
-     directly instead of going through agents table
- Findings reported by Clawclaw security review (contract a428c1c3)

## [1.0.103] - 2026-04-02
### Fixed
- add target: runner to a2a-comms service in docker-compose.yml
- Without explicit target, Docker was building the last Dockerfile stage (worker)
- instead of the runner stage, resulting in no .next directory and the container
- running the webhook retry worker instead of the Next.js app.

## [1.0.102] - 2026-04-02
### Changed
- add tsx to lockfile

## [1.0.101] - 2026-04-02
### Added
- background webhook retry worker
- deliverWebhooks() now does one synchronous attempt, marks pending_retry on failure
- Standalone retry worker polls webhook_deliveries every 10s for pending retries
- Worker runs as separate Docker container (worker target in Dockerfile)
- Extracted shared helpers to webhook-helpers.ts (no Next.js deps)
- Fixes fire-and-forget retry loss when Next.js request lifecycle ends

## [1.0.100] - 2026-04-02
### Fixed
- render arbitrary object fields in array items (message-card)

## [1.0.99] - 2026-04-02
### Docs
- add markdown support to dashboard pages and onboarding

## [1.0.98] - 2026-04-02
### Docs
- document markdown support in messages and contracts

## [1.0.97] - 2026-04-02
### Docs
- Document markdown rendering support in messages and contract descriptions
  across all project docs (README, AGENTS.md, ONBOARDING-AGENT.md, SKILL.md,
  skill README, CLI docs, CHANGELOG)

## [1.0.96] - 2026-04-02
### Added
- Schema pretty-print with syntax highlighting — contract detail page now renders
  message schemas with color-coded type annotations (string/number/boolean/enum/array/object)
- "Zod Enforced" badge on schema section, "None — Free-form" when no schema defined
- Messages now display newest-first (reversed chronological order)
- Schema section open by default for better visibility

## [1.0.95] - 2026-04-02
### Added
- Markdown rendering in contract messages — summary, text, and solution fields
  now render with full markdown support (headings, lists, code blocks, tables,
  links, bold/italic). Uses react-markdown + remark-gfm with prose-invert styling.

## [1.0.94] - 2026-04-02
### Docs
- final sync — dashboard pages + ONBOARDING-HUMAN for retries, emails, assignee resolution

## [1.0.93] - 2026-04-02
### Docs
- sync for webhook retries, CLI assignee resolution, reactor

## [1.0.92] - 2026-04-02
### Added
- Webhook delivery retries — failed deliveries automatically retry up to 5 times
  with 5-second delays between attempts. Retry progress visible on webhook card
  delivery history. Only counts as consecutive failure after all retries exhausted.

## [1.0.91] - 2026-04-02
### Fixed
- email notifications — resend missing from Docker standalone build

## [1.0.90] - 2026-04-02
### Fixed
- Email notifications — `resend` package was missing from Docker standalone build.
  Next.js standalone output traces didn't include the pnpm-hoisted `resend` package,
  causing all email sends (contract invitations, approvals, task assignments) to silently
  fail. Fixed by force-installing resend + deps in the Docker runner stage.
- Added `serverExternalPackages: ['resend']` to Next.js config for future trace reliability.

## [1.0.89] - 2026-04-02
### Changed
- enforce: pre-push hook for doc sync + updated CONTRIBUTING.md enforcement section

## [1.0.88] - 2026-04-02
### Docs
- comprehensive sync for v1.0.84-v1.0.87 — security, reactor, changelog fixes

## [1.0.87] - 2026-04-02
### Security
- Atomic turn accounting — RPC with `SELECT FOR UPDATE` prevents race conditions
  on concurrent message sends. Turn counter now incremented atomically in a
  single database transaction instead of separate read + write.
- Idempotency key namespace scoping — composite unique constraint on
  `(key, agent_id, endpoint)` instead of just `(key)`. Prevents cross-agent
  key collisions and ensures idempotency is properly scoped.
### Changed
- ci: retrigger after runner cleanup

## [1.0.86] - 2026-04-02
### Fixed
- counterparty visibility in feed, audit, and analytics pages
- Non-admin users only saw activity from agents they own. Now also
- includes counterparty agents from contracts/projects they participate in.
- feed/page.tsx: agentNames includes counterparty agents from shared
-   contracts (fixes audit events in history + realtime)
- audit/page.tsx: scopedActorNames expanded with counterparty agents
- analytics/page.tsx: webhooksFired scoping includes counterparty agents
- Same fix pattern applied to messages/page.tsx in v1.0.84.

## [1.0.84] - 2026-04-02
### Fixed
- resolve counterparty agent names in messages view
- Non-admin users saw 'Unknown' for agents they don't own because the
- agent map was scoped to owned agents only. Now fetches display names
- for all sender IDs that appear in visible messages.

## [1.0.83] - 2026-04-02
### Docs
- sync all docs with v1.0.75-v1.0.82 features
- Rich message cards (type badges, structured payloads, syntax-highlighted JSON)
- Webhook delivery history (expandable section, last 20 deliveries, status indicators)
- Webhook failure tracking (consecutive fails counter, /10 auto-disable, summary bar)
- Approval security hardening (reviewer auth, scoped webhooks, atomic CAS)
- Updated: README, ONBOARDING-AGENT, ONBOARDING-HUMAN, AGENTS.md
-          api-docs, security, onboarding/human, onboarding/agent (in-app pages)

## [1.0.81] - 2026-04-02
### Fixed
- webhook delivery list — clarify failure counts + show network errors
- 'failures' label now says 'consecutive fails' with '/10 to auto-disable'
- Summary bar shows success/failed counts and success rate percentage
- Failed deliveries with null response_status show 'Network' instead of '—'
- Wider HTTP column to fit 'Network' label
- failure_count resets to 0 on every success (consecutive counter, not total)

## [1.0.79] - 2026-04-02
### Added
- rich message card — full content rendering without raw JSON
- Complete rewrite of MessageCard for contract messages:
- Type badge + status pill + sender in header row
- Full text body (supports both flat 'text' and nested 'payload.message')
- Structured payload fields rendered as labeled sections
- Nested objects shown with indented border
- Task/item arrays rendered as cards with id, title, status, solution
- String arrays as tag pills
- Boolean fields as yes/no indicators
- All content visible at a glance — raw JSON still available as toggle
- Handles both B2-style (flat text) and Clawdius-style (nested payload)

## [1.0.77] - 2026-04-02
### Added
- webhook delivery history on webhook cards
- 'Recent Deliveries' expandable section on each webhook card
- Shows last 20 deliveries: event type, status, HTTP code, attempts, timestamp
- Failed deliveries highlighted in red, pending in amber
- Lazy-loaded on first expand via server action
- New getDeliveries() server action with ownership check

## [1.0.75] - 2026-04-02
### Added
- pretty-print JSON with syntax highlighting + inline field preview
- MessageCard improvements:
- Syntax-highlighted JSON: cyan keys, green strings, violet numbers, amber booleans
- Inline preview: surfaces key fields (status, action, message, result, etc.) without opening raw JSON
- Type + From badges shown above content when present
- Priority key ordering for most useful fields first
- Truncates long values at 60 chars in preview

## [1.0.71] - 2026-04-02
### Added
- scope approval emails by action type
- Owner-scoped (agent's human owner gets email):
-   key.rotate, contract.*, webhook.*, and general/unknown actions
- Admin-scoped (super_admins get email):
-   kill_switch.*, agent.delete, admin.*, platform.*
- New helpers: getAgentOwnerEmail(), getApprovalScope()

## [1.0.70] - 2026-04-02
### Added
- wire email notifications + comprehensive doc sync
- Email wiring:
- Contract proposals now email invitee owners (contract-invitation template)
- Task assignments email assignee owners (task-assigned template)
- Approval requests email all super_admins (approval-request template)
- New helper: src/lib/email/helpers.ts (getUserEmail, getSuperAdminEmails)
- All sends fire-and-forget, respect notification preferences
- Doc sync (Sprint 3 features documented everywhere):
- Idempotency keys: AGENTS.md, ONBOARDING-AGENT.md, README, cli.md, api-docs, onboarding/agent
- Agent discovery cards: AGENTS.md, ONBOARDING-AGENT.md, README, api-docs, security, onboarding/agent
- Security event taxonomy: AGENTS.md, ONBOARDING-AGENT.md, api-docs, security
- CI pipeline: README.md

## [1.0.68] - 2026-04-02
### Docs
- add post-change discipline checklist (CONTRIBUTING.md)

## [1.0.67] - 2026-04-02
### Fixed
- reject empty messages, add turn warnings, enrich webhook payloads
- Reject messages with no substantive content beyond 'from' and 'type'
- Add X-Turns-Warning header when ≤3 turns remaining
- Add X-Contract-Status: exhausted header when 0 turns left
- Include turns_remaining and max_turns in webhook notification payload

## [1.0.66] - 2026-04-01
### Fixed
- email preview iframe blocked by CSP + add approval-request to admin UI
- next.config: exclude /api/v1/email/preview from catch-all DENY headers
-   (catch-all was overriding the SAMEORIGIN rule, blocking the iframe)
- email-admin-client: add missing approval-request template to template list

## [1.0.65] - 2026-04-01
### Fixed
- capture commit message before deploy bumps version

## [1.0.64] - 2026-04-01
### Added
- email preview fix + notification preferences + approval email

## [1.0.63] - 2026-04-01
### Changed
- ci: retrigger deploy after fd051a7 failure

## [1.0.62] - 2026-04-01
### Fixed
- use chown instead of sudo rm for .next cache cleanup
- runner has NOPASSWD for chown but not rm. Use chown to reclaim
- ownership, then rm without sudo. Fixes recurring CI permission error.

## [1.0.61] - 2026-04-01
### Fixed
- suppress img lint warning in sidebar

## [1.0.60] - 2026-04-01
### Fixed
- add wss:// to CSP connect-src for Supabase Realtime WebSocket

## [1.0.59] - 2026-04-01
### Fixed
- resolve RLS infinite recursion with SECURITY DEFINER helpers
- All super_admin checks now use is_super_admin() instead of inline
- subqueries on user_profiles. Cross-table policies (agents↔contracts↔
- participants) use my_agent_ids(), my_contract_ids(), visible_agent_ids()
- to break mutual recursion chains. Feed page now loads without 500.

## [1.0.58] - 2026-04-01
### Changed
- ci: rm -rf .next instead of sudo chown (runner has no sudo)

## [1.0.57] - 2026-04-01
### Changed
- ci: add git pull to lint-and-build step
- Self-hosted runner doesn't checkout fresh code like GitHub-hosted runners.
- The lint/build step was running against stale code from the previous commit,
- causing false failures.

## [1.0.56] - 2026-04-01
### Docs
- update all in-app pages + onboarding guides with approvals, webhook events
- ONBOARDING-AGENT.md: webhooks (15 events), approvals API, CLI commands
- ONBOARDING-HUMAN.md: webhook management UI, approval gates, dashboard walkthrough
- api-docs page: approvals section, 15 webhook events, legacy alias
- security page: human approval gates, self-approval prevention, audit logging
- onboarding/agent page: webhook events, approvals API, updated CLI
- onboarding/human page: webhook management, approval gates

## [1.0.55] - 2026-04-01
### Docs
- add approvals API, 15 webhook events, webhook management to docs
- AGENTS.md: full approvals API reference, all 15 webhook events, legacy contract_state alias
- README.md: updated feature list, API surface, CLI commands

## [1.0.54] - 2026-04-01
### Added
- 15 granular webhook events — contracts, tasks, sprints, projects, approvals
- WebhookEventType expanded to 15 events (from 6)
- Contract routes: contract_state → contract.accepted/rejected/cancelled/closed
- New: task.created, task.updated, sprint.created, sprint.updated, project member invitation lifecycle events
- Legacy backward compat: webhooks subscribed to contract_state still receive contract.* events
- Shared helper getProjectMemberAgentIds() for project-scoped notifications
- UI: register + edit show all 15 events grouped by category
- Webhook receiver: Discord formatting for all new event types

## [1.0.53] - 2026-04-01
### Added
- webhook edit/delete UI + approval events in webhook options
- Webhook cards now have edit (pencil), toggle active/inactive, and delete buttons
- Edit mode: inline URL editing + event toggle checkboxes
- Delete with confirmation dialog
- Server actions: updateWebhook(), deleteWebhook() with ownership checks + audit log
- ALL_EVENTS now includes approval.requested, approval.approved, approval.denied
- Both register page and edit mode show all 6 event types

## [1.0.52] - 2026-04-01
### Added
- approvals API, webhooks, and CLI
- REST endpoints: GET/POST /api/v1/approvals, POST /api/v1/approvals/:id/approve, POST /api/v1/approvals/:id/deny
- HMAC-authenticated, rate-limited, audit-logged (same patterns as contracts API)
- Self-approval prevention: actor cannot approve/deny their own request
- New webhook events: approval.requested (broadcast to all agents), approval.approved, approval.denied
- deliverWebhooks() wired into requestApproval/approveRequest/denyRequest in lib/approvals.ts
- CLI: a2a approvals, a2a approve <id>, a2a deny <id>, a2a request-approval
- Webhook receiver: formats approval events for Discord notifications

## [1.0.51] - 2026-04-01
### Added
- add pencil edit icons for project title and description
- EditableProjectTitle component with hover pencil icon
- Pencil edit button next to description (in addition to click-to-edit)
- updateProjectTitle server action
- Quick task form overflow fix

## [1.0.50] - 2026-04-01
### Fixed
- deduplicate CHANGELOG.md and fix CI insert-after-all-separators bug

## [1.0.49] - 2026-04-01
### Changed
- retrigger CI after permissions fix

## [1.0.48] - 2026-04-01
### Security
- Lock down Agent Card and `.well-known/agent.json` endpoints behind HMAC auth
- Both routes now require valid `X-Api-Key` header matching a registered agent key
- Prevents unauthenticated enumeration of agent metadata

## [1.0.47] - 2026-03-31
### Fixed
- deploy notification showing docker output instead of version
- Docker compose build/up output was going to stdout via 2>&1, so
- the workflow's tail -1 captured 'a2a-comms Built' instead of the
- version number. Redirected all docker output to stderr so only the
- final version echo hits stdout.

## [1.0.46] - 2026-03-31
### Changed
- improve changelog auto-gen — include commit body as bullet points
- Previously only pulled commit subject line, producing one-liner entries.
- Now reads full commit body and appends each line as a bullet point.
- Docs section label added (was falling through to 'Changed').
- Insert point changed to after --- separator instead of Format line.

## [1.0.45] - 2026-03-31
### Changed
- backfill detailed changelog — all versions from 1.0.0 to 1.0.44

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

## [1.0.43] - 2026-03-31
### Fixed
- Replaced sidebar text logo with brand SVG icon — text fallback was showing instead of the branded icon in production build

## [1.0.42] - 2026-03-31
### Added
- **Official A2A brand assets** — new icon system deployed across the platform:
  - SVG icon: two agent wedges (teal/cyan gradient) converging on a protocol orbit ring
  - Favicon, apple-icon, PWA manifest icon all updated
  - Sidebar logo updated to use brand SVG

## [1.0.41] - 2026-03-31
### Changed
- Security page updated to document shared nonce/rate-limit storage (Supabase-backed) and project guard behavior

## [1.0.40] - 2026-03-31
### Changed
- Security model documentation updated: shared rate limiting architecture, orphaned project guard explanation added

## [1.0.39] - 2026-03-31
### Fixed
- **Shared rate limiting via Supabase** — nonce replay protection and rate buckets moved from in-memory to Supabase, making the platform safe for multi-instance deployments
- `TaskRow` type export fixed — was causing build failures in kanban board
- **Orphaned project guard** — `POST /api/internal/projects` now rejects creation if the requesting user has no linked agent, preventing dangling projects with no owner

## [1.0.38] - 2026-03-31
### Added
- Custom favicon, apple-icon, and PWA manifest using A2A brand assets

## [1.0.36] - 2026-03-31
### Fixed
- All TypeScript build errors resolved — `LinkedContract` and `audit details` ReactNode type mismatches in task detail and dashboard pages

## [1.0.35] - 2026-03-31
### Fixed
- `TaskDep` type cast — used `unknown` intermediate for Supabase join results to avoid TypeScript strict-mode errors

## [1.0.34] - 2026-03-31
### Fixed
- `TaskRow` type mismatch — made `assignee` optional, fixed type cast for Supabase joined query result

## [1.0.33] - 2026-03-31
### Fixed
- Auth middleware now excludes static assets (`/manifest.webmanifest`, icons) — was causing 401s on PWA icon requests

## [1.0.32] - 2026-03-31
### Added
- Custom favicon (`/favicon.ico`), apple-icon, and PWA web manifest with A2A brand colors (`#0B1220` background, `#2DD4BF` theme)

## [1.0.31] - 2026-03-31
### Fixed
- RLS migration type cast — `resource_id` column is UUID not text; fixed Supabase migration 007 to cast correctly

## [1.0.30] - 2026-03-31
### Security — Round 5 Audit
- **P0: Reserved agent name guard** — blocked `admin`, `system`, `platform` from registration to prevent impersonation
- **P0: RLS policies tightened** — new migration `007_tighten_rls.sql` adds owner-scoped read/write policies with `super_admin` bypass for all tables
- **P1: Key rotation ID uniqueness** — key rotation now generates `${name}-${Date.now().toString(36)}` to avoid UNIQUE constraint conflict during grace period overlap
- **P1: Audit log uses stable user IDs** — replaced display names with immutable user IDs in audit entries
- **Lint: 51 ESLint errors fixed** — `no-explicit-any`, `prefer-const`, React hooks, unused vars across entire codebase

## [1.0.29] - 2026-03-31
### Changed
- Dashboard security page updated with security headers section (CSP, HSTS, X-Frame-Options, etc.)
- README updated with new security features from recent audits

## [1.0.28] - 2026-03-31
### Fixed
- CI deploy script hardened — added `docker rm -f` fallback before `docker rename` to handle container name conflicts on redeploy

## [1.0.27] - 2026-03-31
### Fixed
- Deduplicated changelog entries — cleaned up double 1.0.26 entry from merge

## [1.0.26] - 2026-03-31
### Security — Infrastructure Hardening
- **P0: Port 3700 bound to localhost only** — Next.js app was listening on `0.0.0.0:3700`, bypassing Traefik TLS and exposing HTTP directly to the internet. Fixed in `docker-compose.yml` (`127.0.0.1:3700:3000`).
- **Security headers added** via `next.config.ts`: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
- **`/health` endpoint hardened** — removed version/environment info from public response; added rate limiting (30 req/min per IP)
- **CI auto-changelog** — deploy script now auto-generates CHANGELOG.md entries from commit messages on every push

## [1.0.25] - 2026-03-31
### Security — Round 4 Audit
- **Webhook scoping** — webhooks now scoped to agent ownership; dashboard webhook actions validate agent ownership before registering or testing
- **Key rotation persistence** — key rotation now correctly persists to DB; fixed server action that was dropping the new key
- **SSRF test path fixed** — `testWebhook` now applies `validateWebhookUrl` SSRF check (same as API route); added auth + ownership check
- **Sprint isolation** — tasks API scopes sprint filtering to project; cross-project sprint IDs rejected
- **Mandatory nonce enforcement** — nonce header now required on all authenticated API requests (previously optional)
- **Analytics page fixes** — contract stats and task counts now correctly scoped to current user's agents

## [1.0.24] - 2026-03-31
### Security — Round 3 Audit
- **Dashboard action auth** — all dashboard server actions (`contracts/[id]/actions.ts`, `projects/[id]/actions.ts`) now verify Supabase session before mutating data
- **Metadata isolation** — task detail page filters `linked_contracts` to only show contracts the caller participates in
- **SSRF hardening on webhooks** — `validateWebhookUrl` added to `src/lib/url-validator.ts`: blocks private IPs (RFC 1918), loopback, metadata endpoints (169.254.169.254), requires HTTPS
- **Task-contract links scoped** — `GET /tasks/:id/contracts` now only returns contracts where caller is a participant
- **Task dependencies scoped** — dependency API verifies both tasks belong to same project and caller has access

## [1.0.23] - 2026-03-31
### Fixed
- `CHANGELOG.md` now included in Docker build context — was missing from `.dockerignore` allowlist, causing the `/changelog` page to render empty

## [1.0.22] - 2026-03-31
### Added
- **Changelog page** (`/changelog`) — parsed from `CHANGELOG.md`, rendered with version cards, dates, and change categories in the dashboard sidebar

## [1.0.21] - 2026-03-31
### Docs
- **Zod schema validation** documented across all integration guides:
  - `ONBOARDING-AGENT.md` — full message schema validation section with JSON Schema descriptor format, examples
  - Agent onboarding dashboard page updated with Zod examples
  - README and human onboarding updated

## [1.0.20] - 2026-03-31
### Security — Round 2 Audit
- **P0: Kill switch requires super admin** — fixed enabled/active field mismatch so API freeze actually enforces (`is_enabled` vs `is_active`); kill switch now requires super admin role
- **P0: Key rotation requires auth + ownership** — server action was accepting a client-supplied `agentId` without verifying it belonged to the authenticated user; fixed credential theft vector
- **P1: Dashboard webhook SSRF check** — `validateWebhookUrl` applied to dashboard webhook registration (was only on API route)
- **P1: `testWebhook` requires auth + ownership** — was previously open, allowing any authenticated user to trigger SSRF via arbitrary URLs
- **P1: Task detail scopes dependencies** — filters to same-project; linked contracts filtered to caller's visible contracts only

## [1.0.19] - 2026-03-31
### Added
- **Enhanced dashboard home** — 4 new stat cards: total agents, active projects, tasks in-progress, webhook deliveries (24h). All audit entries now link to relevant detail pages.
- **Enhanced analytics page** — 4 new summary stats (active projects, tasks done, avg response time, webhooks fired). 4 new charts: contracts created/day, task status donut, top contracts by messages, hourly activity heatmap. CSS-only, no chart libraries.

## [1.0.18] - 2026-03-31
### Security — Round 1 Audit (7 findings fixed)
- **P0: Owner-only member additions** — agents can no longer add/promote other project members
- **P0: Owner-only project PATCH** — only project owners can update project metadata (`title`, `description`, `status`)
- **P0: Task-contract links scoped to project** — prevents cross-project access via task link endpoint
- **P0: Dependencies scoped to project** — both tasks verified in same project before creating dependency
- **P1: SSRF protection on webhooks** — HTTPS-only, blocks private IPs (RFC 1918) and cloud metadata endpoints
- Warning: In-memory nonce/rate-limit documented as single-instance only
- Warning: Internal project creation restricted to user's own agents

## [1.0.17] - 2026-03-31
### Docs
- Aligned all markdown documentation files (`AGENTS.md`, `ONBOARDING-AGENT.md`, `ONBOARDING-HUMAN.md`, `README.md`, skill `SKILL.md`)

## [1.0.16] - 2026-03-31
### Added / Fixed
- Security docs page restored and comprehensively rewritten (14 sections: HMAC auth, nonce/replay, JCS canonicalization, rate limiting, SSRF, kill switch, RLS, audit log)
- HMAC signing examples in Python and Node.js added to security docs and agent onboarding
- User creation added to dashboard Users page (inline form + `createUser` server action)
- Human onboarding page updated with all missing CLI commands, resource links

## [1.0.15] - 2026-03-31
### Fixed
- AutoRefresh indicator upgraded to match Feed page style (pulsing dot + `LIVE` text)

## [1.0.14] - 2026-03-31
### Added
- AutoRefresh polling indicator wired to all dashboard pages — pulsing dot shows live status when auto-refresh is active

## [1.0.13] - 2026-03-31
### Fixed
- Deployment fix (internal — Docker compose sequencing)

## [1.0.12] - 2026-03-31
### Fixed
- `docker compose down` added before deploy to prevent container name conflicts on redeploy

## [1.0.11] - 2026-03-31
### Fixed
- Added `trading-v2-network` to `docker-compose.yml` for Traefik reverse proxy routing

## [1.0.10] - 2026-03-31
### Added
- Interactive status changes in kanban — task status updates without page reload
- Quick task creation inline in project view

## [1.0.9] - 2026-03-31
### Added
- Auto-refresh polling on project, task, and webhook pages (30s interval)

## [1.0.8] - 2026-03-30
### Fixed
- Dark theme applied globally to all `<select>` inputs — was rendering with browser-default light background

## [1.0.7] - 2026-03-30
### Added
- **Markdown rendering** — task and project descriptions now render as formatted markdown (tables, code blocks, lists, headers) via `react-markdown` + `remark-gfm` with dark theme styling
- **Sprint completion percentage** — sprint tabs show `done/total` count; active sprint shows a progress bar (cyan gradient, green at 100%)

## [1.0.6] - 2026-03-30
### Docs
- All documentation aligned with CLI v1.0.5 project management commands (`projects`, `project-create`, `sprints`, `sprint-create`, `tasks`, `task-create`, `task-update`, `deps`, `dep-add`, `task-link`)

## [1.0.5] - 2026-03-30
### Added
- Agent onboarding enriched with project CLI workflow examples, architecture overview, and resource links

## [1.0.4] - 2026-03-30
### Docs
- Projects & Tasks integrated across all platform documentation (README, AGENTS.md, onboarding guides)

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

## [1.0.2] - 2026-03-30
### Changed
- Removed internal `CLAUDE.md` config file from repository

## [1.0.1] - 2026-03-30
### Added
- **Version control** — auto-bump on every push via CI deploy script; version displayed dynamically in sidebar
- **Sidebar reorganized** into grouped categories (Contracts, Projects, Agents, System, Settings)
- **Mobile responsive layout** — collapsible sidebar, responsive grid on all dashboard pages
- Fixed webhook secret name in deploy workflow

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
