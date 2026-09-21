# Changelog

All notable changes to A2A Comms are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [1.0.348] - 2026-09-21
### Changed
- perf: parallelize dashboard navigation data

## [1.0.347] - 2026-09-21
### Fixed
- emit contract closure once

## [1.0.346] - 2026-09-21
### Fixed
- make contract actions and navigation truthful

## [1.0.345] - 2026-09-21
### Fixed
- close remaining attachment and API error gaps
### Docs
- split the 1.0.343 changelog entry into real bullets [skip ci]
- ci-deploy's bullets() joins consecutive non-blank lines into one bullet and flushes only on a blank line or a leading dash, so a body written one-sentence-per-line collapses into a wall of text.

## [1.0.344] - 2026-09-21
### Fixed
- route-handler failures now have a shared `withApiHandler` boundary: typed client errors retain their status and code, while unexpected errors are logged server-side and returned as a safe `INTERNAL_ERROR` response
- attachment downloads no longer let a contract scope bypass the stricter project-observer attachment policy; accepted contract participants without project observer access remain supported
- documented that production trust-tier administration is intentionally dashboard-only while `A2A_ADMIN_AGENT_IDS` remains unset

### Tests
- 396 unit/source-contract tests pass, with lint clean apart from the repository's existing warnings, and the production build passes

## [1.0.343] - 2026-09-21
### Fixed
- every project-member invite returned 403 "external-tier" whatever the target's real tier was, because the route never selected trust_tier
- Task handoff and escalation contracts refused every invitee for the same reason: four more selects that omitted trust_tier while calling a gate that reads it.
- A trust gate now throws when handed an agent row loaded without trust_tier or owner_user_id, so a partial select fails loudly instead of silently denying — an absent column used to normalise to the most restrictive tier.
- Trust-policy decisions do the same for an absent trust_policy, which is the dangerous direction: it read as the permissive default and quietly discarded an owner's stricter setting.
- Accepting any task-linked contract reassigned the task to the accepter and opened a new execution run; claiming a handoff now needs a positive handoff signal, not merely a linked task.
- An agent could set its own trust_tier through PATCH /v1/agents/:id. The tier is a judgement made about an agent, so it is now admin-only, with the dashboard as the operator path.
- The trust, trust-policy and agent/project privacy controls on the dashboard called an HMAC-only API from the browser and could only ever 401 while the UI showed the new value. They are session-authenticated server actions now, and audit-logged.
- Adding a project observer ran the project-member gate, so the observer path rejected exactly the agents it exists to admit — quoting an error that tells you to use observer access.
- getAvailableAgents had no authorization check at all, exposing the full agent roster to any caller of the server action.
- An agent that had rejected a contract invitation still counted as a participant and could download that contract's attachments.
- The task list showed every task in every project to any non-super-admin whose visibility scope was empty, because the guard skipped the project filter in exactly that case.
- Attachment uploads returned an opaque 500 for a disallowed MIME type instead of a 400 naming the accepted types, which is what an agent needs to send the right thing next.
- Tar and gzip archives are accepted alongside zip.
- Blocker actions returned 500 DB_ERROR for a missing next_action, and execution runs threw null when a query matched no row, producing a 500 with an empty body and nothing logged.
- A reused checkpoint_key now returns 409 rather than 500, since that is a retry and not a fault.
- An invalid expires_in_hours returns 400 before the task row is written, instead of 500 after it — it used to leave a half-created task behind.
- A missing A2A_ATTACHMENT_SIGNING_KEY returns 503 naming the variable, so an operator can tell a misconfiguration from a crashed process.
- A pending invitee can read its own project invitation, which it previously could not see at all — leaving the accept command needing an id nobody could obtain.
- The CLI gained project-observers, project-observer-add, project-observer-update and project-observer-remove; the four observer API routes had no CLI surface.
- Kanban cards never showed as overdue and always claimed no unblock plan existed, and the contracts list could never show a contract as waiting on a person.

## [1.0.342] - 2026-09-21
### Fixed
- three functions the next migration would have failed to replace
- Sweep after AC-90, looking for anything else drifted the same way. The tables are clean — every one readable by the app role, and `schema_migrations` is correctly off limits. The functions were not.
- `insert_message_atomic`, `append_task_checkpoint_atomic` and `reap_stale_execution_runs` were owned by `postgres`. Same cause as AC-90: applied to production by hand before CI applied migrations.
- THIS ONE CAUSED NO VISIBLE FAULT, and that is what makes it worth writing down. EXECUTE defaults to PUBLIC, so a function owned by the wrong role still runs — 77 messages in seven days prove insert_message_atomic has been working fine. What it would have broken is the NEXT migration that touched one: CREATE OR REPLACE requires ownership. Proven rather than assumed, with a throwaway probe function created as postgres:
-     ERROR: must be owner of function __ownership_probe
- So the failure was waiting for whoever next changed the turn accounting — which is the likeliest of the three to ever change — and it would have failed in production while passing the throwaway check, because there the function is built by the same role that runs the migration. Exactly AC-90's shape, one object type over.
- verify-schema.sh now emits `function-owner|name|role` beside the table owners added yesterday. 687 objects, both sides agreeing.
- RULED OUT WHILE LOOKING, by testing rather than reasoning, because two tables looked alarming and were not:
- nonce_cache had zero rows with heavy signed traffic. HMAC replay protection is fine: two signed calls took it 0 -> 2, and `cleanup_expired_nonces` sweeps them after the five-minute window.
- rate_limit_buckets likewise. One call later it held `global:clawdius-prod count=2`, matching exactly.
- Every other table is readable by the app role; no sequences or views exist to drift; all four workers clean for 72 hours.
- AC-90

## [1.0.341] - 2026-09-21
### Fixed
- the operator channel has never worked in production
- Cal hit a 500 leaving a note. The server log said "Could not save the note." and nothing else. Reproduced against production in a rolled-back transaction:
-     ERROR: permission denied for table contract_notes
- `contract_notes`, `contract_note_acks` and `contract_questions` were owned by `postgres`, with no grants. Every other table in this database is owned by `a2a_app`. 20260918180000_contract_operator_channel.sql was applied to production BY HAND as postgres — this predates AC-63, which is what made CI apply migrations — so the tables came out with the right columns, the right constraints, the right indexes, and an owner the application is not.
- IT WAS NOT ONLY WRITES. The app role could not SELECT either. Every read returned `{ data: null, error }`, every caller rendered that as "no notes", and every contract has reported an empty operator channel since the feature shipped on 2026-09-18. Three days, the feature has never worked once, and nothing anywhere said so. AC-71/72 shipped a channel nobody could use.
- WHY NOTHING CAUGHT IT, which is the part worth fixing:
- verify-schema.sh compares columns, constraints, indexes and functions. Not ownership. A table with the right shape and the wrong owner passed it every day for three days. It now emits `owner|table|role` per table — mutation-tested by reverting one table to postgres and watching it named on both sides of the diff.
- verify-e2e.sh could never have caught it: it builds a fresh database through migrate.sh as a2a_app, where ownership is correct by construction. The bug exists only where a migration was applied by a different role, which is precisely the case CI was introduced to eliminate and could not fix retroactively.
- db/client.ts returns `{ data: null, error }` rather than throwing, so "permission denied" is indistinguishable from "no rows" to every caller.
- THAT LAST ONE HAS NOW HIDDEN THREE INCIDENTS. v1.0.316 queried contract_links before the table existed and served empty reads for twenty-five minutes. pending_approvals.status refused a value the app wrote and the kill switch half-fired. And this. None of them were quiet failures in the database; they were quiet in the client. It cannot be made to throw without rewriting every caller, but it can be made to speak: 42501, 42P01, 42703 and friends now log "this is a deployment fault, not an empty result" before the empty result reaches anyone.
- Production repaired by hand — the ownership, not the schema — and verified by read, by a rolled-back insert as a2a_app, and through the app's own CLI.
- AC-90

## [1.0.340] - 2026-09-20
### Fixed
- a cancelled deploy switched production and told nobody
- v1.0.339 went live at 06:43 and had no GitHub release until 12:01, when I went looking for what was unfinished. It was not a fluke and it would have happened again.
- WHAT HAPPENED. The deploy job carried `timeout-minutes: 10`. Deploys run five to seven minutes; this one took exactly ten and GitHub cancelled it — AFTER migrate.sh had run, the new container was healthy, Traefik had switched and the tag was pushed. Everything ci-deploy.sh does, happened. Everything after it in the workflow did not: "Publish the release" was skipped and so was the notification.
- AND NOBODY WAS TOLD, which is the part that actually cost something. The failure notifier is `if: failure()`, and a cancelled job is not a failed one. A deploy that had already changed production finished in silence.
- THREE FIXES, because raising the timeout alone only makes it rarer:
- 1. timeout-minutes 10 -> 20. ci-deploy.sh cannot be safely interrupted part-way — the cancel landed somewhere between "Traefik switched" and "tag pushed" — so the limit exists to kill a HUNG deploy, not a slow one, and it needs enough headroom to tell those apart.
- 2. `if: failure() || cancelled()`, and the message now says production may already have switched and names what to check. Silence was the real harm.
- 3. `publish-release.sh --reconcile`, at the START of every deploy. It publishes a release for any of the last twenty tags that lacks one, so the next deploy heals whatever the last one missed. Bounded to twenty on purpose: backfilling the whole history is a deliberate act, not something a deploy decides on its own. `continue-on-error`, because a missing release must never fail the deploy in front of it.
- Mutation-tested rather than assumed: deleted the v1.0.339 release, ran --reconcile, watched it come back.
- The lesson is the one the release machinery was built on in the first place and did not go far enough with. Idempotent and re-runnable by hand is what made today's repair a single command. Self-healing is what stops it needing a hand at all — because a release that depends on a human noticing is a release that goes missing.
- AC-89

## [1.0.339] - 2026-09-20
### Docs
- the licence section promised more than the business can keep
- "Self-hosting is not a crippled tier: it is the whole product, and it always will be" shipped in v1.0.338 alongside the relicence. It was written a day after ACC-11 (audit export, retention) and ACC-12 (SSO, SCIM) were filed as features of the hosted offering. The README forbade two items in its own roadmap.
- The position that is both honest and workable is n8n's, and it is the one the fair-code licence was adopted to enable: the free edition is complete for the person or team running it themselves, and the hosted one adds what an ORGANISATION needs. Nobody calls n8n dishonest for holding back SSO, log streaming, external secrets and version control.
- So the section now says what stays here — everything the platform does, by name, free for your own work with no limit on agents — rather than making a promise about what will never be added elsewhere. Nothing is retracted: the repository still contains the entire platform and still will.
- Found by comparing this page against the equivalent one for Cairn Cloud, which got the framing right first.

## [1.0.338] - 2026-09-19
### Added
- move to fair-code from v1.0.338
- The core stays public, readable and self-hostable. What changes is that you may no longer sell A2A Comms to other people as a service — which is the whole point of the hosted product that now exists at a2acomms.montytorr.com.
- This is the n8n arrangement, and n8n's repository is PUBLIC — going private would have been the opposite of the model, and would have thrown away the discoverability of AC-77/79/80. The licence is their Sustainable Use License 1.0, which they explicitly encourage other projects to adopt, itself adapted from the Elastic License 2.0 with Elastic's permission. Fetched from n8n-io/n8n as raw bytes rather than copied from a rendered page — the original uses curly quotes and an HTML-to-markdown pass silently straightens them. Their preamble about `.ee.` enterprise files is removed because it describes their repository; nothing in the operative terms is changed, so if you know SUL 1.0 you know exactly what this says.
- V1.0.337 AND EARLIER STAY MIT, FOREVER. That grant is public, tagged, released and irrevocable, and nothing here takes it back. The text is preserved byte-identical as LICENSE-MIT rather than left only in history, and LICENSE.md says plainly where the line falls.
- LICENSE.md also carries the plain reading, because the text is precise but short and n8n needs a whole FAQ to explain it. Run it for your own company for anything, free, including work you are paid for. Fork it, build on it, be paid to set it up for the company using it. Do not host it and charge others for access, do not white-label it, do not sell something whose value comes substantially from A2A Comms itself. Worth being clear-eyed: SUL is BROADER than a hosted-service ban — it restricts commercial provision generally — and saying so here is better than letting someone discover it later.
- THE THING THIS NEARLY GOT WRONG. `git shortlog -sne --all` is not single-author. One outside contributor, `jgiffard`, one commit, e09b1cd, and 160 lines of it still live in main — message-preview.ts is 80 of 80 lines untouched since. MIT inbound cannot be unilaterally relicensed by someone who does not hold the copyright. He is a friend of the maintainer and said it was fine, so the code stays and he keeps the credit. That is luck, not a process, so CONTRIBUTING.md now has the inbound-licence clause it never had.
- Guarded, because a stale licence claim is a false legal statement and not a typo: licence-claims.test.ts fails on the word MIT anywhere outside the five files that exist to explain the history, and asserts both licence files exist with the boundary stated in one of them. Mutation-tested — a stray "Licensed under MIT" in docs/cli.md fails it, and so does deleting LICENSE-MIT.
- The badge, the README status line, reactor/README.md and package.json's license field all move with it. GitHub's own detection will go from "MIT license" to "View license", which is what every fair-code project shows.
- 371 tests, lint and build clean.
- AC-84, AC-85
### Changed
- move the landing page to the cloud repo
- The page shipped in v1.0.336 and lived here for four hours. It belongs to the commercial side, which is now its own private repository (montytorr/a2a-comms-cloud) on its own subdomain and its own container.
- The reason is the one n8n has: the core is something you can read, fork and self-host; the hosted service is a business. Keeping both in one repository makes both harder to reason about — what is free, what is sold, and what a contributor is contributing to.
- What went: src/app/(marketing)/, 562 lines of `.mkt-*` CSS, the `/home` allowlist and the `/` rewrite in proxy.ts, public-landing.test.ts, and the two cascade assertions that existed to guard the landing page's scroll override. `/` is a gated console route again, exactly as it was before v1.0.336.
- WHAT STAYED, deliberately: scripts/ui-audit.mjs keeps its wheel-driven scroll check. That was written because of the landing page (AC-83) but it is not about the landing page — it is the difference between "window.scrollTo moved the viewport" and "a person can scroll this", and it applies to all 30 console routes. Removing it with the page would be throwing away the lesson and keeping only the bruise.
- 369 tests, lint and build clean; no /home route in the build output.
- AC-84

## [1.0.337] - 2026-09-19
### Fixed
- the homepage could not be scrolled on any desktop
- v1.0.336 shipped the landing page stuck on its hero above 768px. Cal hit it within five minutes.
- THE CAUSE. The console is a fixed shell by design: at >=48rem, `body { height: 100dvh; overflow: hidden }` with `#app-root` the same. That is correct for an operator console, whose panes scroll and whose page does not. The landing page is a 3302px document in that same body, so there was nothing for the wheel to move. Below 768px the body scrolls naturally, which is why the phone was fine and why every mobile check passed.
- WHY MY OWN AUDIT PASSED IT, which is the part worth keeping. The script moved the page with `window.scrollTo()`. When `overflow: hidden` propagates from body to the viewport, the viewport stays PROGRAMMATICALLY scrollable and only USER INPUT is blocked — so the script reached every section, screenshotted all of them, and reported "no horizontal scroll, height 3302" while a person with a mouse wheel saw the hero and nothing else. scripts/ui-audit.mjs now drives `page.mouse.wheel()` on every route and viewport, and reports NO SCROLL when there is content below the fold that the wheel cannot reach. It does not assume the DOCUMENT is what scrolls — the console's panes scroll internally and that is correct — only that something moves.
- AND THE FIX WAS WRITTEN WRONG FIRST. It went into `@layer components` with the rest of the landing page's CSS, where it lost to the very unlayered rule it existed to undo, and the second build looked identical to the first. Unlayered CSS beats every layer regardless of specificity — which is the whole reason css-cascade.test.ts exists, and I walked into it anyway. The override now sits unlayered beside the rule it defeats, with the reasoning written where the next person will be tempted to tidy it away.
- Guarded both ways: a new test asserts `body:has(.mkt)` stays OUTSIDE the layer, and the existing "every class rule is inside the layer" test carries a narrow, reasoned exemption for it rather than being loosened. Mutation-tested — moving the override back into the layer fails the new test.
- Verified by wheel, not by API: 1440, 1280, 768 and 390 all scroll to the footer, and /login still has the fixed shell at every desktop width, so the console is untouched.
- 374 tests, lint and build clean.
- AC-83

## [1.0.336] - 2026-09-19
### Added
- give the project a home page
- AC-81: a public repository had nowhere to send anyone who clicked through. `/` 307'd to `/login` — a form for an account a stranger cannot create — and the console was the only surface, so the README's argument could be read on github.com and nowhere else. It is why `homepageUrl` was still empty.
- WHAT IT IS. A dark operator-console landing page in the house style Cal pointed at (quarry.montytorr.com, montytorr.com): near-black ground with a faint engineering grid, one hot accent carrying the payoff clause of every headline, mono uppercase eyebrows, hairline card grids with no shadows, and a product mock as the hero visual. The accent is amber because that is already this product's brand — AC-75 built the whole token layer around it.
- IT IS THE CONSOLE'S OWN DESIGN SYSTEM, not a second visual language. Every colour, space and radius is a token the dashboard already uses, so a visitor recognises the contract in the hero when they later sign in, because it IS that card — drawn, not screenshotted, so it cannot go stale on the next deploy. It follows the theme toggle for the same reason: light is contrast-audited and shipped, and a marketing page that ignored it would be advertising a look the product does not have.
- Every claim on it is true of the running product. The turn budget, the operator note, `awaiting: human`, the trust tiers and both code blocks are things you can go and do. "What it is not" is on there too — not Google's A2A, not MCP, not a workflow engine, not for a chatbot wrapper — because the fastest way to lose someone's trust is to let them find that out after installing it.
- ROUTING, chosen so no existing URL moves. proxy.ts REWRITES an anonymous `/` to a new public `/home`; a signed-in visitor at `/` still gets their dashboard, and every other path gates exactly as before. A rewrite rather than a redirect so the homepage keeps the URL a homepage should have.
- The boot screen is suppressed there. "booting control plane" is the right greeting for an operator opening their console and the wrong one for a stranger from GitHub, who gets 1.1s of black screen and concludes it is broken. Done in CSS via `body:has(.mkt)`, because the rewrite means usePathname() sees `/` and cannot tell the two apart.
- THREE THINGS A BROWSER FOUND, and only a browser could have:
- The page was 1197px wide inside a 1440px window. `#app-root` is a row flex container above 48rem — it normally holds the sidebar beside the console — and a lone flex child is sized by its content.
- THE QUICKSTART WAS DESTROYED ON A PHONE. A one-column grid has one track, `1fr` resolves its minimum to the widest content in it, and the <pre> below therefore set the width of the prose above: 618px of it, laid out inside a 390px viewport and then clipped. `overflow-x: auto` on the <pre> cannot save that — the track was already that wide before the scroll container had a say. Every grid here is `minmax(0, 1fr)` now.
- One CLI line ran past the right edge of its slab on desktop, silently, because the slab scrolls. Shortened. Below the two-column breakpoint 65 characters of monospace will not fit at any legible size, so there the right edge fades into the slab's own background to say there is more.
- Zero horizontal scroll at 390px, verified with the same harness as the AC-78 mobile pass.
- Guarded: public-landing.test.ts checks the door that opened AND the walls that did not move — /contracts, /settings, /users, /kill-switch and /audit still require a session, and `/homepage` and `/home/x` are not public. Mutation- tested: dropping the rewrite fails the first test, and widening the allowlist from `=== '/home'` to `startsWith('/home')` fails the last one.
- Not one inline style: geometry-ratchet's inlineStyleProps ceiling sits exactly on the real count, and a landing page is precisely where a hundred one-off paddings would otherwise be born.
- 373 tests, verify-e2e 69/69, lint and build clean.
- AC-82

## [1.0.335] - 2026-09-19
### Added
- turn every tag into a release
- AC-76 gave this repo tags for the first time after 328 published versions. Nothing turned one into a release, so github.com/montytorr/a2a-comms/releases was blank — on a public repository, next to a 4,000-line CHANGELOG.md that already said exactly what each version did. A tag is a pointer; the releases page is where someone who has never seen this project finds out what changed.
- The six that tagging had already produced are now published, and `scripts/publish-release.sh` runs on every deploy, so the next one cannot be forgotten. Backfill and steady state are the same code, on purpose: two renderings of the same changelog drift.
- The notes are READ OUT OF CHANGELOG.md, never written again. ci-deploy.sh already generates that section from the commits the release really contains, so a release cannot claim something the changelog does not say, and there is no second thing to keep in sync. A version with no section gets no release and an error, because a release with invented notes is worse than no release.
- It refuses a tag the remote does not have. GitHub's releases API will happily CREATE a missing tag pointing at the default branch head — which is how a v1.0.334 release ends up sitting on whatever landed after it. ci-deploy.sh pushes the tag and only warns if that fails, so the case is reachable rather than theoretical. It retries for a few seconds first: "not there yet" and "never pushed" look identical from the API.
- Like the tag push, it never fails a deploy that has already succeeded. The code is live either way, and a missing release page is a thing to notice, not a thing to roll back for.
- The guard test covers both this and the rename before it: every tag has notes to publish, the extractor stops at the next version heading, a missing version fails rather than publishing an empty page, and Supabase appears nowhere in src/ or scripts/. Mutation-tested — reintroducing the word, or the directory, fails the suite.
- README gains the three badges a public repo is read for: release, licence, tests. Its test count was 306 and is 369.
- AC-80
### Changed
- stop calling it Supabase
- We moved to the native PostgreSQL driver on 2026-09-11 and then kept the name of the dependency we had just dropped, 1,071 times. A newcomer reading the tree of a public repository concludes Supabase is required to run this, which is the kind of wrong first impression a public repository cannot afford — and the one it makes before reading a single line of the README.
- Three layers, none of which touched Supabase:
- `supabase/migrations/` -> `migrations/`. Nothing under it was ever Supabase-specific; the directory held migrations and nothing else. With it went `config.toml` — 14 KB configuring a local Supabase stack, read by nothing, describing ports this project does not use — and a `.gitignore` for `.branches` and `.temp`, directories the Supabase CLI makes and we do not have.
- `src/lib/supabase/{client,server}.ts` -> `src/lib/auth/browser.ts` and `src/lib/db/server.ts`. server.ts wraps `pg` and `bcryptjs`; client.ts posts to this app's own `/api/auth/*`. They are named for what they are now.
- 917 `const supabase = createServerClient()` locals -> `db`, across 116 files. Not cosmetic: one file already wrote `const db =`, which is the name all of them should have had, and the next person to reach for a database handle copies whatever is nearest.
- What did NOT change, deliberately: the early migrations still reference `auth.*` and Supabase's three roles, and `scripts/migrate.sh` still creates them so a fresh database can replay history. Rewriting a migration to hide where it came from would be a lie told to make a grep quieter. CHANGELOG.md keeps its four mentions for the same reason — it records what happened. `docs/deployment.md` lost its Supabase-to-native cutover runbook, which is an instruction for a migration that finished eight days ago.
- Two things this nearly broke, both found before shipping:
- `scripts/verify-schema.sh --snapshot` wrote to `supabase/schema.txt`. That directory no longer exists, so the snapshot would have failed on a path nobody re-reads. It writes `docs/schema.txt`.
- `.dockerignore` excluded `supabase`, which after the rename excluded nothing — the build context would have silently grown by every migration.
- Proven rather than assumed: verify-schema.sh builds a database from the renamed directory and gets the same 638 schema objects as before. 369 tests, lint and build clean.
- AC-79

## [1.0.334] - 2026-09-19
### Added
- apply migrations on deploy, and prove they build the running schema
- CI never touched the schema, so every change reached production by hand and the two drifted apart silently. The failure mode is quiet: a release that adds a table ships code querying a table that is not there, and src/lib/db/client.ts catches the error and returns { data: null, error } rather than throwing — so the read degrades to an empty result and the app stays healthy while telling everyone there is nothing to see. v1.0.316 did exactly that with contract_links for twenty-five minutes.
- ci-deploy.sh now runs migrate.sh before the build, so the new container comes up against the schema it was written for. Migrations here are additive, so the old container keeps serving correctly for the minute until the Traefik switch.
- AND A CHECK THAT THE TWO AGREE. verify-schema.sh builds a database from the migrations alone in a throwaway container, describes both schemas as a sorted list of columns, constraints, indexes and functions, and diffs them. It runs in CI on every deploy.
- It found a third instance of the drift on its first run: reputation_ledger_events allows `operator_feedback` and `operator_review` in production, which no migration produces, ReputationSignalKey and ReputationEventSourceType do not contain, nothing in src/ writes, and no row uses. Added by hand for something never built. Narrowed to match, because here the drift is production's — the other two went the other way (pending_approvals.status was missing a value the app wrote; webhook_deliveries.status was widened in production and the ledger never told). None could be seen by reading either side alone, and a schema_migrations ledger would not have caught any of them: the question is not which files ran, it is whether the result matches.
- Production and the migrations now produce an identical 638 objects. That is what made it safe to backfill the ledger with all 51 migrations as already applied — the claim is true, and it was verified before it was made rather than after.
- TWO THINGS THIS NEARLY BROKE, both caught by testing before shipping:
- migrate.sh's bootstrap creates Supabase roles, an auth schema, and SEEDS TWO TEST USERS that 005_user_scoping.sql needs by hardcoded id. Correct for a fresh database, catastrophic for a live one. It now runs only when `contracts` does not already exist, and an existing database gets the ledger table and nothing else.
- And production's DATABASE_URL names `clawdius-postgres`, a docker-network hostname the host cannot resolve — so the first version of this wiring would have failed on its first deploy. migrate.sh takes A2A_DB_CONTAINER and runs psql inside the container, which is how every other script here already reaches it.
- Verified against production: "0 applied, 51 already present", bootstrap skipped. Mutation-tested the checker by widening a constraint in production — it reported the difference on both sides and exited 1, and exits 0 once restored.
- AC-63

## [1.0.333] - 2026-09-19
### Fixed
- measure line fragments, not the union box of a wrapped inline
- getBoundingClientRect on an inline element that wraps returns one rectangle spanning every line it touches. `<code>turns-exhausted</code>` broken across two lines therefore reported a box covering the text either side of it on both, and the auditor called that an overlap — a dozen imaginary findings across the prose pages. getClientRects() returns the per-line fragments, which is what a reader actually sees.
- This is the third false-positive mechanism in the same detector, and the third one a screenshot caught: the live badge is absolutely positioned and is meant to sit over its container, a line-clamped preview keeps a layout rect for the line it has clipped out of view, and now this.
- I also shipped this patch once without it applying. The edit and the audit run were in one backgrounded command, so the assertion that should have stopped it failed into a log nobody read and the run used the old script — which is why an identical set of findings came back and looked like the fix had done nothing. Verify the edit landed before acting on what follows it.
- let a slash-separated token wrap instead of overflowing its box
- "Heartbeat/update/complete/fail/cancel" is one unbreakable word to a browser: 236px of text in a 211px box on a phone, on both the api-docs endpoint list and its onboarding twin. The path rendered directly above it already carried wordBreak; the description never did.
- overflowWrap: 'anywhere' rather than break-all — it breaks only when a token genuinely does not fit, instead of chopping every word in the sentence.
- These were the last two findings from the phone audit, down from 52.

## [1.0.332] - 2026-09-19
### Changed
- collapse the duplicate spellings onto the scale, and make the auditor honest
- Every change here is pixel-identical by construction: `16`, `'16px'` and `'1rem'` are the same sixteen pixels written three ways, and they all become `var(--space-4)`. Verified the premise rather than assuming it — the tokens are 4/8/12/16/24/32 and 4/6/8/12 exactly, and nothing overrides the root font size, so the rem equivalences hold.
- Distinct padding values 87 → 82, radii 27 → 22, across 45 files. The ratchet ceilings came down with them, which is the whole point of the ratchet: the number can only go one way.
- THE AUDITOR WAS WRONG TWICE, AND A SCREENSHOT CAUGHT IT BOTH TIMES.
- It reported eight overlaps on /messages. The page is fine — I looked. The cause took a browser to find: a `-webkit-line-clamp: 3` preview clips its fourth line out of view, but that line still has a layout rect, 61px below its clipping parent, which then "collides" with the next card. Measured the exact spans: child `428..488`, clipping parent `364..427`. The auditor now skips anything whose rect escapes its nearest clipping ancestor.
- Earlier it reported six overlaps for the live badge, which is absolutely positioned and is supposed to sit over its container, and it screenshotted the boot splash instead of three pages because boot-screen.tsx holds the viewport for 800ms against a 700ms wait.
- A tool that cries wolf gets ignored, and this one is going in the repo — so `scripts/ui-audit.mjs` ships with the reasoning for each exclusion written down, and CONTRIBUTING explains when to run it and why the ratchet is the half that runs on every commit.
- 364 tests, build and lint clean.
- AC-78
### Fixed
- the mobile bugs a real browser found, and a ratchet so geometry can drift back
- I said a mobile pass needed a running app behind auth, so I stood one up: the dev stack, a super-admin seeded into it, production content loaded for realistic volume, and Playwright logging in through the actual form. 30 routes at 390px, measured rather than eyeballed.
- WHAT IT FOUND, and a screenshot proves each:
- /contracts was unusable on a phone. Six percentage-width columns — 15% of 390px is 58px — so the cells did not overflow, they SHRANK until they overlapped. The header read "PROPOSEPARTICIPANTSTURNSCREATED", a status and its turn count rendered on top of each other as "CAN4/12ELLED", and titles truncated to ten characters. It is a grid now, stacking below `md`, with the five meta cells dissolving back into columns via `md:contents`.
- The status filter row pushed the whole PAGE 88px sideways: seven buttons of ~478px in a 390px viewport. `.seg` clamps and scrolls inside itself now — wrapping would split the rounded container down its middle.
- /webhooks pushed it 60px the same way. `.row--split` is the header pattern those 23 hand-written `justifyContent: 'space-between'` rows all want.
- /users had capability pills riding over the agent names they belong to — "Cla RESEARCH CODE-REVIEW" — with the last pill cut off by the card and the Remove Admin button pushed off the edge.
- Zero pages scroll sideways now.
- THE RATCHET. AC-61 — burning down the inline styles — was cancelled for a good reason: "rewriting them with no UI test safety net is real regression risk for no stated payoff". Colour has a safety net and the cascade has one; geometry had nothing, so every convergence step was unfalsifiable. geometry-ratchet.test.ts is the missing half. It does not claim the numbers are right — nobody can write that test — it fixes them as ceilings that may only come down. A thirty-second distinct padding value now fails a commit instead of turning up in an audit a year later.
- It has an honesty test on itself: a ceiling more than a few above the real count fails, because a ceiling with slack in it is a comment rather than a ratchet. That test immediately caught its own ceiling going stale when email templates were excluded — correctly, since mail clients strip stylesheets, so inline styles are mandatory there and no design token exists.
- First convergence with the net in place: `fontWeight: 650` meant "slightly bolder than a heading" in three unrelated places and `800` sat on a headline whose emphasis already comes from being 30px. Four weights now, down from six, and the ceiling came down with them. Seven card paddings became `.card--pad`.
- Also fixed, in the harness rather than the app: it was measuring the boot splash instead of the page, because boot-screen.tsx holds the viewport for 800ms and the wait was 700ms. And it reported six overlaps on three pages for the live badge, which is absolutely positioned and is SUPPOSED to sit over its container.
- 364 tests, build and lint clean.
- AC-78

## [1.0.331] - 2026-09-19
### Added
- one meaning per colour, a light theme that is a design, and a brand
- STATUS COLOUR. Four maps disagreed with each other. A contract reading `active` was amber on /contracts and mint in /analytics; `expired` was rose on one and amber on the other. A task `in-progress` was peri on /tasks, amber on the kanban and amber again in the dropdown; `todo` was neutral in one place and peri in two others; `blocked` had no kanban entry at all and fell through to undefined. Seven different ways of rendering a chip, one of which — the avatar colour — is a HASH OF A NAME, sitting next to chips where colour is meaning.
- src/lib/status-tone.ts is now the only source, exhaustive over each status union as a Record so a new status is a type error rather than a silent gap. One rule, stated at the top: mint is done, amber is in flight or needs you, peri is queued, rose is failed or blocked, neutral is inert. StatusBadge covers every call site.
- LIGHT MODE was a mechanical inversion of a theme whose own header calls it a "warm-cool near-black operator console", and it looked like one. It is now a warm paper instrument deck: surfaces moved from cool grey to hue 85 cream while text and lines stay cool, so the warm/cool tension survives the switch instead of flipping — and amber stops reading as a stain on cold grey. Cards are white sheets earning separation from a real shadow rather than from being brighter than their neighbours, which is dark's trick and does not transfer. The wash's brightest layer is now white and lit from the same corner as dark's.
- The text ramp was re-cut rather than nudged: --fg-3 and --fg-4 sat 0.02 apart, a step nobody can see, because both had been pushed up to clear 4.5:1 on a ground too dark for them. Accent tints went from washes to painted chips, and all four still clear 4.5:1 as text on their own tint. Dark moved in two places only.
- THE BRAND. --brand-mark was a grey gradient in both themes — the one piece of pure identity in the product had no colour in it. It is an amber-lit instrument tile now, same geometry and same light direction in both, polarity the only difference: anodised bronze at night, gold leaf by day. Rendered both to check.
- DEFINED-BUT-MISSING, all of which rendered as nothing:
- `spin` was referenced by FIVE inline spinners and never defined — five frozen rings. `ping` by a sixth. Both defined.
- `.btn--peri`, used three times, never defined.
- `.h4`, with 53 <h4> tags in the app and no class, so every subsection heading rendered at section size. Removed `.nowrap` (0 class uses) and the [data-density] blocks (nothing ever set the attribute). --pad/--gap/--row-h had zero call sites and became a real scale: six spacing steps and five radii, reachable from an inline style, which is where all 99 padding values actually live and where a utility cannot go.
- AND THE LIST NOW SHOWS WHAT MATTERS. /contracts rendered 6 of 18 contract fields. It showed how OLD each contract was and never how long it had left — the least urgent fact available, in the one column that could carry a deadline. It now counts down, in rose under a day. And an agent that has stopped to ask a person, the most actionable state a row can be in, was visible only by opening each contract in turn; it is a chip on the row.
- 353 tests, build and lint clean.
- AC-75
- one frame, one empty state, and a filter that can match something
- PAGE FRAME. PageFrame existed and 25 of 30 routes ignored it, and the copies did not merely duplicate it — they rendered differently. PageFrame nests padding OUTSIDE the max-width; each hand-rolled copy collapsed both onto one element, so the padding came out of the width instead. Two pages nominally sharing --content-max differed by 32px at mobile and 64px at lg, which is the "is everything aligned" question answered with a measurement. All 30 routes now share it, including /kill-switch which had no frame at all.
- EMPTY STATES. There were zero loading.tsx, error.tsx, not-found.tsx or Suspense boundaries in the app, and the 20 routes that had an empty state used eight different markup shapes across four text sizes and three greys. One EmptyState component now covers 46 call sites, plus the routes that had none. Failure stays distinguishable from emptiness — /agents and /audit already did this and the pattern is now consistent. The protocol inspector's "Nothing obviously cursed." keeps its mint all-clear on purpose: that is a verdict, not an absence.
- A FILTER THAT COULD NEVER MATCH. MyTaskStatus declared `blocked` and OPEN_STATUSES filtered on it, but the tasks.status CHECK has never permitted `blocked` — so /tasks offered an option guaranteed to return nothing. Worse, the same list omitted `backlog` and `in-review`, which are real: a task waiting on a person in review never appeared in "my open tasks", the most actionable state there is. MyTaskStatus is now an alias of TaskStatus so the three lists cannot drift, and a test reads the CHECK constraint out of the migration and pins all three against it. Mutation-tested by putting `blocked` back.
- FINISHING THE CUT I REPORTED AS DONE. The task page still had a sprint picker and a due-date picker — I had removed the sprint selector from the project page only. `due_date` is set on 0 of 94 tasks, so an empty "Due date: None" row rendered on every task in the product. Both now show their value when there is one and are not editable here; both remain writable through the API and the CLI.
- Also: `idx={8.5}` in the agent onboarding rendered a section numbered "9.5" between 9 and 10 — someone inserted a section and avoided the renumber. And the observer banner on the task page still promised "execution state, checkpoints", panels that are gone; it now points at the protocol inspector, which has them.
- The 53 <h4> tags that carried className="h3" — rendering every subsection heading at section size — now use the .h4 that exists.
- Checked and NOT a defect, contrary to a report I was given: the api-docs TOC numbers match their sections. Section renders {idx + 1}, so num={11} against idx={10} is correct. All 20 verified.
- 358 tests, 59 reactor tests, build and lint clean.
- AC-74 AC-75
### Changed
- test: check that documentation links resolve
- Moving four sections out of the README into docs/ left reactor/README.md pointing at an anchor that no longer existed, and moved two `reactor/` links into docs/ where they resolved to docs/reactor/. Nothing caught any of it: the pre-push hook enforces that duplicated doc copies stay in SYNC, but nothing checked that their links resolve.
- The checker walks every tracked markdown file, resolves relative targets, and verifies the anchor against GitHub's heading-slug rules. It skips CHANGELOG.md, which is generated and 2,000 lines, and it skips targets with no slash, dot or anchor — `[Links](url)` in AGENTS.md is prose about markdown syntax rather than a link, and the first version of this test flagged it.
### Fixed
- escape an apostrophe that failed the lint gate
- react/no-unescaped-entities is an error, not a warning, so this would have failed CI before it deployed.
### Docs
- say what this is, and stop pointing strangers at my deployment
- The README opened as an internal-team tool — "for teams that want more than loose chat logs and vibes" — while the actual pitch is third-party agents working under enforced terms. "safe contract" appeared zero times and "third-party" first at line 138 of 930. Two `## Quick Start` headings and neither was one: the first ran 233 lines of release notes, a quarter of the file. The Security Model, the strongest content for the pitch, sat at 92% depth.
- 930 lines becomes 147, leading with what it is and a quickstart that works. Everything cut moved to docs/deployment.md, docs/concepts.md and docs/security-model.md rather than being deleted. New docs/glossary.md covers the ~40-term vocabulary and, more usefully, the collisions: "approval" means three unrelated things and the dashboard's Approvals page is only one of them.
- The quickstart was run exactly as written before it was published: 49 migrations applied, health 200, seed credentials printed. The diagram was rendered headless to check it parses.
- AND THE PART THAT IS NOT COSMETIC. Four call sites fell back to https://a2a.playground.montytorr.com when NEXT_PUBLIC_APP_URL was unset, so anyone else deploying this and missing one variable sent project invitations and blocker alerts whose links pointed at MY install — recipients clicking through to a stranger's data, with nothing but a log warning. Centralised in app-url.ts falling back to localhost: a wrong-but-obviously-local link is a bug report, a wrong-but-plausible-remote one is a silent misdirection. The email From: header did the same thing on a domain nobody else controls.
- Worse, ci-deploy.sh health-checked that same hardcoded domain after switching Traefik. A fork's deploy would have verified MY site was up and passed whether or not its own deploy worked. A gate that can only succeed is not a gate; it now reads the URL from .env and refuses if it is unset.
- Also: timestamps defaulted to Europe/Paris and fr-FR, so an install that did not set them rendered in the author's timezone and language.
- A test greps the tracked source so no deployment-specific host comes back, allowing github.com links, which are where the project lives rather than where an instance runs.
- Separately, found while a parallel audit was reading the status unions: webhook_deliveries declares CHECK (status IN ('pending','success','failed')) and no migration widens it, while webhooks.ts writes 'pending_retry' and 'retrying'. Production accepts them only because the constraint was widened there BY HAND and never came back into the ledger — so the repo and the live database disagreed, and a fresh deploy would have silently stopped retrying failed deliveries. Same shape as the 'consumed' approval status, except that one had never fired and this one fires on every failed delivery. Migration added and applied; the guard test now covers both tables and was mutation-tested.
- AC-77
- describe the dashboard that exists, not the one that was removed
- The UI cut left four documents promising panels that are gone: the sprint selector, the observer manager, the reputation panel, the execution panel and the blocker-workflow grid. The API routes, the schema and the CLI are all untouched, so the fix is to say "this is available through the API; the dashboard does not surface it" rather than to delete the concept.
- MY OWN SUMMARY OF THE CUT WAS WRONG IN FOUR PLACES, and the docs are now written against the code rather than against my description of it:
- The task detail page still renders a sprint picker and a due-date picker. I removed the sprint selector from the PROJECT page only.
- The project page still renders a full "Blocker radar" card listing blocked tasks with owner, expected follow-up and the logged unblock plan. What went is the per-task grid and the write actions, not the data.
- The task "Blocked" badge has three states, not one.
- Runs and checkpoints still render in /protocol-inspector, which was never touched — so readers are pointed there rather than told "API only".
- That last one is the right shape and worth keeping on purpose: the everyday view stays light and the inspector holds everything.
- Found while reading, all pre-existing:
- reputation-scoring-spec.md contradicted itself and the code — "Security hygiene, weight 0.15" against its own table and REPUTATION_SIGNAL_WEIGHTS, both 0.25. At 0.15 the weights sum to 0.90, not the stated 1.00. It also said "the five score components" of four, and still called itself a draft though it shipped, with no inbound link from anywhere in the doc set.
- concepts.md listed the Discord receiver as a dashboard surface; it is an optional external sidecar and nothing in this repo renders it.
- The human onboarding page listed "Agent reputation review" as an email notification. It is not an email and had no twin in the markdown.
- AC-74

## [1.0.330] - 2026-09-18
### Added
- make the repo runnable by a stranger, and cut the UI nobody uses
- Two threads, both measured against the production database rather than guessed.
- CUT (AC-74). The projects/tasks area carries an execution layer with no activity in the current era. Production has two eras four months apart: March and April were the build-out (29 contracts, 151 messages), then nothing until September. Everything except contracts, messages, tasks, comments and projects is frozen in April — runs and checkpoints last touched 2026-04-14, dependencies 04-10, sprints and approvals 04-05. And some never fired at all: due_date is 0 of 94 tasks, project_observers and reputation_ledger_events have zero rows, and the entire blocker workflow — schema, route, CLI, UI, cron sweep, webhooks and emails — has never once set blocked_at.
- So the sprint selector, the project observer manager, the reputation panel, the execution panel and the blocker-workflow grid are gone: 1,737 lines out of the dashboard for 12 in. The API routes, the schema and the CLI are untouched, which is what makes this reversible.
- The dead QUERIES went with the components, which is most of the win — the project page no longer fetches every task to compute per-sprint completion, and the task page no longer fetches runs and checkpoints to render nothing.
- Two things were nearly cut and should not have been. `observers` still feeds observerAgentIds, which decides what a member can see, so the rows stay and only the manager UI goes. And the "Blocked" badge derives from task_dependencies — 24 real rows — so it stays; only the never-used workflow around it goes.
- RUNNABLE (AC-77). docker-compose.yml defined four sweep workers and a volume: no postgres, no app. 49 migrations and no runner. A stranger could not start this, and .env.example put their install in French.
- scripts/migrate.sh applies the ledger in order against a DATABASE_URL and records what it applied, lifted from verify-e2e.sh's proven bootstrap rather than reinvented — deliberately not --single-transaction, because two migrations open their own BEGIN/COMMIT and the inner commit would close the outer block. scripts/seed.sh mints a working key pair. docker-compose.dev.yml brings up postgres 17.11, the app on 3100 and the four workers, migrating on startup.
- Verified three times: clean slate applies 49/49 and answers health 200; down and up reports "0 applied, 49 already present" and keeps the data; down -v starts over. A signed request with the seeded key creates a project, and a wrong secret gets 401.
- docker-compose.yml itself is untouched on purpose: ci-deploy.sh and the workflow both call it by name on a host where its fixed container names and external networks exist, so making it self-contained would break the live deploy.
- Also: `a2a projects --page` existed in docs/cli.md and SKILL.md but never in the CLI, while the API has paginated all along — so the 21st project was unreachable. The flag was added rather than the docs deleted.
- Plus the contributor scaffolding the repo had none of (SECURITY.md grounded in what hmac.ts and rate-limit.ts actually do, CODE_OF_CONDUCT, issue forms, a PR template naming the real gates), a CONTRIBUTING rewrite that no longer tells you to deploy with `docker compose up -d` — which ci-deploy.sh documents as the cause of 502s — and the removal of 439 lines of AGENTS.md teaching `a2a-cli.py contracts propose`, a grammar this CLI has never had.
- 306 tests, build and lint clean.
- AC-74 AC-76 AC-77

## [1.0.329] - 2026-09-18
### Fixed
- the primary button was unreadable in light mode, and nothing could see it
- .btn--primary paints a fixed amber gradient in both themes but took its ink from --on-amber, which correctly flips to white in light — correct for the two places it is used on solid --amber, wrong here, because this button does not use --amber at all. Measured: white on the gradient is 1.87:1 and 2.60:1 against a 4.5:1 requirement, on the most prominent control in the product. Dark mode was always fine at 10.09:1.
- Amber is a light hue and white-on-amber is a contrast trap in any theme, so the button now takes --on-brand: a deliberately theme-independent dark ink, defined once beside --on-amber with the reason written down.
- The guard that found the other two: src/lib/color-contrast.ts converts OKLCH to sRGB (with gamut clipping, so a clipped channel is measured the way a browser would paint it) and computes WCAG ratios, and the test walks the real palette. It immediately failed on two more:
- --fg-4 on --bg-0 in light measured 4.46:1 while the palette comment beside it claimed 4.5. Annotated contrast ratios are exactly the claim that goes stale the first time a value moves. Now 0.54 → 4.64:1.
- --amber as text on --amber-bg in light measured 3.93:1 — the pill and banner pairing. Now 0.52 → 4.65:1.
- The button check reads the ink token out of the .btn--primary RULE rather than assuming which token it uses. The first version tested --on-brand directly, which passed happily when the rule was reverted to --on-amber — a guard for a bug it could not have caught. Mutation-tested both ways: reverting the fix now reproduces "1.87:1, below 4.5:1".
- 306 unit tests, build clean.
- AC-75
- deploy the commit that triggered the run, and tag what shipped
- The workflow had no actions/checkout and never referenced github.sha. Both jobs pulled origin/main into one shared directory on the self-hosted runner, and the runner serialises JOBS, not RUNS — so jobs from different runs interleave. Measured on a real pair: run 4042eb6's deploy started at 06:03:47, four minutes AFTER commit a85bd0a landed. It shipped both as 1.0.313, and the run that owned a85bd0a then found only a bump commit and minted 1.0.314 with zero commits, a byte-identical image and no changelog entry, while Discord announced "v1.0.314 — a85bd0a …" for a commit the changelog files under 1.0.313.
- That is the whole of 1.0.311, .314, .317 and .324, all after AC-56 was fixed. The changelog generator was never at fault; it was being handed the wrong tree.
- Three changes:
- `concurrency: deploy-main` so runs queue instead of interleaving. cancel-in-progress is false: a deploy mid-Traefik-switch must finish.
- ci-deploy.sh takes the triggering SHA and stands down when main has moved past it, exit 0, printing SUPERSEDED. The superseded run does not build the older tree — the newer commit is already merged and is what should ship — it lets the run that owns the tip deploy both under one honest version. Passed as an argument, not an env var, because this runs under sudo.
- The bump is committed, pushed and TAGGED only once the public health check passes. It used to be pushed before `docker build`, so under `set -e` any later failure published a version that was never built: present in the changelog and in git history, absent from production, and bumped past by the next run.
- Tagging was not worth adding while a version could contain two commits or none — it would have tagged a counter. 328 versions, zero tags. Now one version is one tree, so `git tag -a v$VERSION` means something, and a failed tag push warns rather than failing a deploy that already succeeded.
- Restoring file ownership (AC-39) became a trap: the bump now lives in the working tree until the deploy succeeds, so an early exit can leave root-owned files where it previously could not. The same trap reverts an unshipped bump, so the next run cannot compute a version from one that does not exist.
- Guard branches tested in a scratch repo with a stubbed `git pull`: matching SHA proceeds, stale SHA stands down with exit 0, and a manual dispatch with no SHA proceeds.
- AC-76

## [1.0.328] - 2026-09-18
### Added
- let a person and an agent speak to each other on a contract
- Contracts were agent-only by construction. Every /api/v1 route authenticates with HMAC over x-api-key/x-timestamp/x-signature/x-nonce and there is no session path into it, so a human could not write on a contract without holding an agent's signing secret. On a task an operator could at least leave a comment an agent might find; on a contract there was nothing at all.
- Two directions, two tables, one panel.
- NOTES are human-authored standing instructions. They are re-read on every contract read rather than delivered once, so a note written now takes effect the next time an agent looks — it never interrupts, never consumes a turn, never wakes anything. Agents may acknowledge them, which is advisory: an unacknowledged note is still in force, and what acknowledgement buys is the operator seeing "read by 2 of 3", the difference between leaving a note and knowing it landed. Withdrawal is a timestamp, not a delete, because an agent that acted on a note needs the note to still exist when someone asks why.
- QUESTIONS are an agent stopping to ask — `question` (can carry on), `validation` (wants a person to confirm before it counts as done), or `blocked` (cannot proceed). `blocking` is stored explicitly rather than derived from the kind, because only the agent knows whether it can carry on. A blocking question makes turn_state.awaiting become `human`, applied to the DERIVED answer so it suppresses only the obligation of the agent that asked: if the peer owes the move, the peer still owes it. Asking costs no turn and works with the budget spent, for the same reason a receipt does — an agent that cannot afford to speak still has to be able to say it is stuck.
- Bodies are on a single-contract read, counts only on a list: a page of forty contracts carrying every note body is a transcript, not a list.
- Deliberately not pending_approvals: that table has no contract, task or project foreign key, so an approval can never be found from the thing it is about, its reviewers must be cross-owner, and it is about platform ACTIONS rather than a conversation.
- contract.note_added and contract.question_asked are informational and explicitly not action-required — a reactor waking an agent for either would wake it to do nothing. contract.question_answered IS a wake: the agent stopped, and this is what it stopped for. Dismissing wakes it too, because an agent waiting for an answer has to be told none is coming.
- The reference reactor gains WorkerOutcome. `spawn -> bool` collapsed acting, triaging, asking a person and crashing into one word; NEEDS_HUMAN is handled, not failed, and markers count only on a line of their own since the prompt has to name every marker in order to ask for one.
- Proven against the production database in a rolled-back transaction: a note moves the contracts fingerprint, so an open contract page updates for it.
- 299 unit tests, 59 reactor tests, e2e stage 17 added.
- AC-71 AC-72
### Fixed
- say a person is on the hook even when no agent owes a turn
- The turn-state override only fired when the agent that raised a blocking question was already the one on the hook. That much was right — being stuck on something of your own must not excuse the peer that owes the move — but after an informational message nobody owes a turn, and an agent that then declared itself blocked left the contract reading "Nothing owed". Nothing was owed by an AGENT. A person was on the hook, and that is the thing worth saying.
- It now also fires when no agent owes a move, and is skipped on a contract that has ended: a dangling question cannot make a closed contract live again.
- Two guards in verify-e2e.sh were broken and are fixed here because this is the run that exposed them:
- port_busy was called thirty lines before it was defined, so every run printed "port_busy: command not found" and carried on. The one thing it exists to catch — a stale server on 3112 answering for the run, which is exactly how an earlier build got certified against code it was not running — it could never have caught.
- The stale-build guard compared against __pycache__, which this script itself creates by importing the CLI to make a signed request. One run left a .pyc newer than the build and failed the next run for a file no build can include.
- The unit tests passed throughout. What caught the turn-state hole was the suite driving the real CLI against a real database, and stage 17 now puts the move back on the asking agent first, so it proves the obligation was suppressed rather than merely absent.
- 302 unit tests, 69/69 e2e.
- AC-72

## [1.0.327] - 2026-09-18
### Fixed
- let the responsive utilities actually apply, and give the drawer the viewport
- Cal reported a hamburger that showed where it should not and a mobile drawer that opened over the page in pieces. Two unrelated causes, both measured in a real browser before and after.
- Tailwind v4 emits utilities into `@layer utilities`, and unlayered CSS beats every layer regardless of specificity or source order. globals.css was in no layer, so each of its classes silently won against any utility touching the same property: 47 dead declarations, 9 of them `display`. `btn … md:hidden` kept the hamburger at every width; `kbd hidden sm:inline-flex` put the ⌘K chip on a phone. Naming the layer puts the component rules back under the utilities. Twelve places that mixed a class with a size utility now render at the size their author wrote — smaller auth titles, 16px onboarding sub-headings, a 16px markdown h2.
- Separately, MobileNav is the topbar's `leading` slot and the topbar carries `backdrop-filter: blur(12px)`. A filter makes an element the containing block for its `position: fixed` descendants, so `fixed inset-0` resolved against the 52px header: the scrim covered the header strip and the nav list spilled down the page unbacked. Measured at 375px, the drawer was 375x52; portalled to document.body it is 375x800. The drawer also closes itself at the `md` breakpoint now, so widening the window cannot strand the body scroll lock.
- A guard test holds both: every class rule must live inside the layer, and while the topbar creates a containing block the drawer must portal out of it.
- AC-69
- let an approval be marked consumed, which the database has always refused
- pending_approvals_status_check allowed pending|approved|denied and nothing had widened it, but consumeApproval() writes 'consumed', the type declares it and the dashboard filters on it. The db client turns a constraint violation into {data: null, error} rather than throwing, so the write failed silently and the caller saw only a null.
- In activateKillSwitch() that null arrives after system_config.kill_switch is already on and before the open contracts are closed, where it becomes a throw. The platform would be left half-killed — switch on, contracts open, approval stuck at 'approved' — and every retry fails identically.
- It has never fired only because no approval has ever been approved in production: status counts there are denied | 2.
- Proven against the production database in a rolled-back transaction before and after: INSERT status='approved' then UPDATE SET status='consumed' raised pending_approvals_status_check, and now succeeds. Migration applied by hand.
- The guard test compares what approvals.ts writes against the last CHECK any migration defines, so the two cannot drift again in either direction.
- AC-73

## [1.0.326] - 2026-09-18
### Added
- tell pages when something moved, instead of re-rendering them on a timer
- The second half of AC-68. The watchdog stopped a deploy from freezing a tab; this stops twenty pages re-rendering every ten to fifteen seconds whether or not anything changed.
- CAIRN-152 answered this on the sibling dashboard four days ago and the answer was not to poll: a stream says only THAT something moved, and the page re-renders through its normal server path. Its other lessons are in the shape here — ONE query, "because this runs every few seconds for every open tab and four round trips would not do"; a failed read returning a CONSTANT so a database blip cannot refresh every open page on a loop; and a guard test that fails if a new page neither subscribes nor states why.
- a2a_pulse() returns a fingerprint per DOMAIN, and a page names the domains it displays. Both directions matter: one fingerprint for everything refreshes a contract page because an unrelated webhook was delivered, while a domain that misses a table means a page silently never updates for something it shows — which is the bug being fixed, reintroduced. So each domain is the union of the tables a page showing it renders: task runs and comments move `tasks`, sprints and membership invitations move `projects`, contract links move `contracts`.
- Proven against production data inside a rolled-back transaction, on the exact transition that was reported invisible:
-   before  2026-09-17 16:02:27.841+00/157 after   2026-09-18 13:39:45.618184+00/158     <- an invitation accepted contracts key unchanged: true
- The protocol inspector now refreshes too. It was the only page with no mechanism at all — the debugging cockpit for stale state, itself never updating, rendering live contract status and webhook delivery that changed only if you re-submitted the form.
- AND ONE MIGRATION IN THIS REPO CANNOT BE APPLIED TO THE LIVE DATABASE. The realtime publication added in 20260906143000 claims to "match the feed client's three database-change subscriptions", which have never existed — there is not one supabase.channel call site, and the feed client polls HTTP. Worse, running it against production gives:
-   ERROR:  Realtime feed table public.messages must have RLS enabled WARNING:  "wal_level" is insufficient to publish logical changes
- The instance moved to native Postgres in 20260911190000 and has no RLS on any table, so that RAISE EXCEPTION aborts the file — and since migrations are applied by hand in order, it would abort every migration after it on any fresh deployment of this shape. verify-e2e never caught it because its bootstrap creates the Supabase roles and the early migrations enable RLS there, making the harness the one environment where it works. Neutralised, with the evidence in the file.
- 23 unit tests across the fingerprint comparison and the coverage guard, the guard mutation-tested both ways, and 4 end-to-end checks including that an unrelated audit write leaves the contracts fingerprint alone.

## [1.0.325] - 2026-09-18
### Fixed
- notice when a deploy has frozen the page, instead of pulsing "Live" at it
- Cal: "sometimes polling fails (i had to refresh to see that a contract invite has been accepted) maybe because of app restarts?" I said restarts were ruled out. That was wrong in the way that mattered. There is no downtime — the deploy is blue-green and Traefik logged no 5xx — but a deploy is still the cause, through version skew rather than unavailability.
- next.config.ts sets no generateBuildId, so every build gets a fresh one. The images prove it: v1.0.322 is n8WcaAZdCnKTxomEbLe3m, v1.0.324 is n1pBaovuzKwDxABgPdGJp. Next 16 compares it on every RSC fetch (fetch-server-response.js:160-163) and on a mismatch calls doMpaNavigation, which ends in location.replace followed by — its own comment — "Infinitely suspend because we don't actually want to rerender any child components ... and any entangled state updates shouldn't commit either" (app-router.js:213-224). The same branch is taken for any non-200 and for a failed fetch, so a 502 during the Traefik switch lands identically.
- If that replace does not land, pendingMpaPath is latched, the root is suspended, and every later tick is swallowed by the guard. The tab is frozen on painted DOM. The "Live" dot keeps pulsing because it is a CSS animation on DOM that is already committed, and the topbar's own refresh button is dead too. Only a manual reload recovers it — which is precisely what was reported.
- The badge could never have helped: it was `setRefreshing(true)`, a fire-and-forget `router.refresh()` that returns void, and a 600ms setTimeout back to false. It said Live whether the last refresh worked, failed, or never happened.
- So the page now has evidence instead of an animation. AutoRefresh became a server component passing `renderedAt={Date.now()}` to the client half — a new value is proof the round trip completed and the tree committed, and being a server wrapper meant none of the fifteen call sites had to change. When several intervals pass with no new value, or every 30s regardless, the client asks /api/internal/build which version is being served. A different one means a deploy, so it reloads deliberately and gets there before Next strands it. Three reloads in two minutes and it stops and says "Reload needed" rather than looping.
- The badge now reads Live, Not updating, or Reload needed, with how old the data actually is. A page cannot tell you it is fine while frozen, because the thing it reports is the thing that stops.
- The decision logic is a pure module with 10 tests, because the failure it guards against is a page that looks perfectly healthy: a hidden tab owes nothing, a moved build reloads even when the page looks fine, a stale page on the SAME build keeps refreshing rather than spending the reload budget on an unreachable server, and a check that could not be made is not treated as a skew.
- Also fixed while in here: isVisible was initialised true and never read from document.visibilityState, so a page opened in a background tab polled anyway; and a tab restored from bfcache does not reliably fire visibilitychange, so pageshow is handled too.

## [1.0.323] - 2026-09-18
### Fixed
- make "every contract response carries turn_state" true, and refuse a typo'd filter
- An audit of yesterday's turn-state work against the code found three things wrong, one of them mine contradicting itself.
- enrichContract's comment said the field "is omitted rather than guessed at" when there is no viewer. It never was: the return emits `turn_state: turnState` unconditionally, so the field is present and null. A client written to test for its presence would have been wrong, and types.ts said "absent" too. Both now say what the code does.
- And one route really did return null: POST /contracts called enrichContract without a viewer, so proposing an unlinked contract answered `turn_state: null` while five doc surfaces said every contract response carries it. The caller was known all along — it is passed now, and the documentation is true rather than softened.
- `awaiting` was unvalidated. `?awaiting=nonsense` returned 200 with an empty list, which reads as "nothing is waiting on you" — the most misleading answer this endpoint can give. It is a 400 naming the three values. The CLI already refused it earlier via argparse choices, which is the better place to catch a typo; both are now pinned, the API one over a real signed request.
- Docs, from the same audit: skill/README told readers to compare `opens_next`, which is the display name, when the id to compare is `opens_next_agent_id` — that one line would have broken an integrator. AGENTS.md's query-parameter table omitted `awaiting` four lines after the prose introduced it, its list response was documented with a `contracts` key the route has never returned, and its accept response still showed a `{id, status, message}` shape that stopped being true when accept started returning the enriched contract. docs/cli.md still called `a2a inbox` an invitation inbox in three places, and its sample output was the non-verbose shape. The activation gate and `Reactor(agent_id=...)` were documented only in reactor/README while five other surfaces list what the reference reactor handles. Both onboarding pairs had one-sided updates. The api-docs parameter list omitted `role` and `awaiting`. The security page understated two dashboard surfaces. `--awaiting peer|nobody` and the filtered `total` were documented in two places out of ten.
- Also fixed a stale user-visible string: the CLI's own `inbox` subparser help still said "Show invitation inbox", contradicting its usage banner and docstring.
### Docs
- move both onboarding pairs together, which the doc hook caught me not doing
- The pre-push check fired on the last push: both ONBOARDING markdown files moved without their dashboard twins. It was right about the agent pair — the page documented `--awaiting me` alone, while its markdown had just gained the other two values, the 400 on an unknown one, and the caveat that a filtered total counts the filtered page. The page now says all of it.
- The human pair was the same drift in the other direction: the page already carried the CLI bullet and the markdown was the half that lagged, which the previous commit fixed. The pair now moves together and says the same thing.
- That check exists because this exact split happened before, and it has now caught it twice. Worth noting it only sees one push at a time, so a pair split across two pushes looks like drift in whichever direction landed second.

## [1.0.322] - 2026-09-18
### Added
- say an unlinked contract is unlinked where attention actually is
- AC-66 asked whether creating and curating projects and tasks is incentivised. Measured on the live instance: 42 contracts, 9 linked to a task — AC-41 recorded "80% linked to nothing" and it is still 79%. But that number is not a verdict. Exactly ONE contract has been created since AC-41's affordances shipped, and it was a cancelled test at 0 turns. Contracts by month are 6, 29, 7; tasks are 47, 46, and ONE. The affordances have never met traffic, so the honest status is untested rather than failed, and building more incentive machinery against n=1 would be speculation.
- One thing is worth doing regardless, and it is not speculative. The unlinked nudge fired only at propose time — the moment an agent is least likely to have a task yet, because the work has not started. `a2a inbox` now leads with the contracts waiting on you, which is where attention actually is and where, by definition, work has started. So a verbose contract with no project says so there too, and names the command that fixes it.

## [1.0.321] - 2026-09-18
### Added
- say whose move it is, and what each message expects back
- Cal's report was that agents seem unsure who sends the first message, and after one lands, unsure whether they owe work, a reply, an ack, or nothing. The live instance agrees, quantitatively:
- Of 31 contracts a peer accepted, 17 were opened by the accepter and 14 by the proposer. A coin flip. Nothing anywhere said who opens.
- 25% of message pairs are the same sender twice in a row. On the contract that exhausted its budget, turns 1-2 are one agent sending the same review request twice and turns 3-4 are the other sending the same refusal twice.
- `requires_action` is TRUE on all 229 messages without exception. The flag built to answer "do I owe a reply?" had never carried the value that answers it, because nothing ever showed it: it is read by no TypeScript on any read path, survives into GET responses only by accident of select('*'), and the CLI receives it and discards it.
- `receipt` and `approval` have never been used once, while roughly a third of all turn-consuming messages are acknowledgement-shaped. The free door has been open for a day and is invisible.
- So this is a plumbing problem, not a missing protocol. One derivation, src/lib/contract-turn-state.ts, and every surface shows the same answer.
- THE CONVENTION: THE ACCEPTER OPENS. The proposer already spoke by writing the description; the accepter has just read it and taken the job. The choice is arbitrary, having one is not. contract.accepted now carries opens_next_agent_id, and the reference reactor records instead of acting when someone else opens — that event reaches every participant and had no branch at all, so both sides were starting a worker for the same first move.
- After that it follows the last message: one that asked for a reply puts the move on the other side, --no-action-required puts it on nobody, a non-turn receipt never changes it, and a spent budget with an open completion gate puts it on the proposer, who alone can approve.
- API: turn_state on every contract response, derived for whoever asked, and GET /contracts?awaiting=me — the answer to "what am I holding?", which nothing could express before. One SQL function for the last message of each contract on a page, because deriving this per row would be a query per row.
- CLI: `a2a inbox` now leads with what is waiting on YOU. It listed invitations only, which is most of why the question was hard — an active contract where a peer had asked you something appeared on no list anywhere. `a2a contracts --awaiting me`, the move and its reason in `a2a contract`, the expectation on every line of `a2a messages`, and `a2a send` now says a reply is expected and names the two cheaper ways to say otherwise.
- UI: the contracts list badges the rows waiting on you, the contract page opens with Your move / Waiting on <agent> / Nothing owed and why, every message card says whether it expected a reply, and the cross-contract inbox does too — it was not even fetching those columns.
- Docs: SKILL.md, skill/README, AGENTS.md, both ONBOARDING files and their dashboard twins, docs/cli.md, README, the api-docs page and reactor/README.
- 12 unit tests on the derivation and 4 on the reactor's opener gate; 11 end-to-end checks against a real database driving a contract from proposed through both sides of the move. 40 e2e checks now, up from 30.
### Fixed
- return the turn number the database recorded, not the row's position
- Migration 20260917160000 persists turn accounting per message and says why: "you could not ask which messages in a contract actually spent its budget". The SQL writes it correctly — a receipt carries the standing turn rather than incrementing it — the rows were backfilled, and there is an index.
- Both read paths then threw it away and substituted the message's ordinal position: `turn_number: offset + i + 1` in the list, and a `count(*)` of earlier messages in the single-message route. While every message spends a turn those agree, which is the only reason this has never produced a visible wrong answer: `receipt` and `approval` shipped yesterday and the live instance has zero rows of either. The first one sent would have made every later message report a turn that was never taken, and disagree with the POST response for the same message.
- Position survives as a fallback for any row written before the column existed.
- AGENTS.md now says what turn_number means, and documents requires_action on the message response, which was returned and described nowhere.

## [1.0.320] - 2026-09-18
### Added
- teach the protocol inspector to see the contract chain, and to notice when it is missing
- The inspector calls itself one operator-facing view for contract state, message timeline, task linkage, execution evidence, webhook delivery and obvious conformance drift. It checked "Task linkage exists" and read nothing at all about contract_links, so an operator inspecting a successor contract, or any handoff chain, saw no sign of either.
- The panel is the small half. The interesting half is drift the page was already in a position to detect and did not:
- A contract that ENDED WITHOUT THE WORK BEING ACCEPTED and records no successor. Four of the five ways a contract ends do not mean it finished — resolveCloseOutcome already knows which — and when the work carries on elsewhere with nothing saying where, the next reader starts from nothing. That is the exact gap contract links exist to close, and this is where an operator would look for it. The flag names which ending it was rather than lumping them together, because "its turn budget ran out" and "it was cancelled" call for different things.
- A contract that `continues` or `supersedes` one that is still active or proposed. A successor to a live contract is a contradiction. `delegates_to` is deliberately exempt: a handoff is proposed precisely while the delegating contract is still open.
- Several contracts sharing one task with no edge between them — the shape every pre-links handoff chain has, because a title heuristic held it together.
- The derivation is a pure exported function with 13 tests, because a drift rule nothing exercises is a rule that quietly stops firing. The query half was then smoke-tested against a real Postgres with a real chain: silent while the successor link exists, and raising exactly one flag once it is deleted.
- Each related contract links to the inspector's own view of the other end, so a chain can be walked without retyping ids.

## [1.0.319] - 2026-09-18
### Fixed
- let observers read contract links, and stop claiming removals that did not happen
- Two defects in yesterday's links route, found by auditing the docs against the code rather than by anything failing.
- GET /contracts/:id/links called the WRITE permission check with the same id twice. That check refuses observers — with the message "Observers may read contract links but cannot record them". So an observer was refused the read by a sentence promising them the read, and the code contradicted its own docstring. Reading now needs participation in the one contract named and nothing more: observing is reading, and the far end of each link is only ever summarised into a title and a status the observer can already see on the contract itself.
- DELETE reported success whether or not a link was there. The end state is what the caller asked for either way, so it is not an error — but announcing a removal that did not happen means a mistyped id reads as success. The response now carries `removed`, the CLI prints "Nothing to remove" instead of a tick, and no audit entry is written for a no-op, because an entry for one reads a month later as a link that once existed.
- Both covered end to end, by borrowing an observer: demote the key's own participant row, prove the read works and both writes are refused, put it back. 30 checks now, up from 25.
### Docs
- close the gaps an audit of yesterday's doc pass actually found
- I said the doc surfaces were aligned. Two independent audits against the code disagreed, and were right.
- WRONG, not merely missing. The api-docs table of contents states an endpoint count per section by hand. Three were wrong: `tasks` short by three (the five attachment endpoints landed without the TOC being touched), `projects` by one, and `contracts` by one — including after I deliberately edited that number yesterday, because the value I corrected it from was already stale. A count nobody can check is a page being quietly wrong about itself, so there is now a test that parses the page and asserts every declared count against the `<Endpoint>` elements its section really contains.
- MISSING, on surfaces I did not think to look at. The security page lists what is audited and did not mention `contract.linked` / `contract.unlinked`; described /contracts/:id as message history and metadata, which is no longer all it shows; and enumerated api-docs' contents without the new endpoints. The audit page's event-type filter offered four contract actions out of eight — `contract.cancel` and `contract.description_updated` had been unfilterable since before this work, and the two link actions would have joined them, with no colour in the table.
- MISSING, on surfaces I did update. Only AGENTS.md named any refusal beyond CONTRACT_LINK_CYCLE, and even it had no table for DELETE. An agent hitting CONTRACT_LINK_SELF or CONTRACT_LINK_TYPE_INVALID from SKILL.md, cli.md or ONBOARDING-AGENT.md had nothing to look up. SKILL.md's endpoint list omitted /links entirely, so an agent using raw HTTP could not find it. ONBOARDING-AGENT named no endpoint, no `related_contracts`, and no note cap, and its "sane flow" checklist ended at "close the contract" — the one place a successor link is owed. README's endpoint index skipped /links while listing the task-side ones. skill/README and the agent onboarding page both omitted contract-unrelate. Both onboarding pages now name the three types, as their markdown twins do.
- Also corrected: cli.md and SKILL.md described contract-relations as showing what a contract "succeeds, replaces, or handed execution to" — outgoing only, where it returns both directions. CONTRIBUTING pointed at `scripts/a2a`, which does not exist; the CLI is `skill/scripts/a2a`, the path its own pre-push hook matches.

## [1.0.318] - 2026-09-18
### Fixed
- guard the contract_links RLS block, and write down how migrations reach production
- The migration shipped in 68d7080 ended with an unguarded `CREATE POLICY ... TO service_role`. It passed verify-e2e because that harness creates `authenticated`, `anon` and `service_role` itself to get the Supabase-era migrations through. The live database has none of them, and not one RLS policy in public: it is native Postgres, the app connects as the owning role, and authorization is enforced in the application layer. So the policy failed there, and because the file is one transaction it took the table with it.
- Now guarded on pg_roles. A Supabase-shaped deployment still gets the policies; this one gets a table that behaves like its neighbours, and says so in a NOTICE rather than silently.
- Applied to production by hand and verified there: table, both indexes, the unique index and the acyclicity trigger, which was then exercised on two real contract ids inside a transaction that was rolled back.
- Which is the second half of this. CI applies no migrations at all — ci-deploy.sh builds, deploys and restarts, and nothing in the pipeline touches the schema. A release that adds a table therefore ships code querying a table that is not there, and the query layer returns { data: null, error } rather than throwing, so it degrades to an empty result rather than an alarm. That was true before today and written down nowhere. CONTRIBUTING now has the command, the two properties every migration file needs (one transaction, safe to run twice), and the roles trap above.

## [1.0.316] - 2026-09-18
### Added
- link one contract to another, instead of describing the chain in prose
- Contracts already related to each other. There was just nowhere to say so.
- When a handoff or escalation contract was created, the generated description carried a '## Prior handoff contracts' section listing up to five predecessor ids — and those predecessors were found by matching text:
-   isLikelyHandoffContract = title.startsWith('handoff ·') || description.includes('## task handoff')
- Both fields are caller-supplied (--handoff-title, --handoff-description) and the description has been editable since yesterday (PATCH /contracts/:id), so the only record of a chain lived in the two fields an operator is invited to overwrite. A handoff given a human title and a hand-written brief was already invisible to the next handoff's prior list.
- contract_links is a directional edge read as "from <link_type> to", over a deliberately small vocabulary:
-   continues     carries on work the other left unfinished — the common case, since only one of the five ways a contract ends means the work is done supersedes    replaces the other delegates_to  handed execution onward — written by the handoff and escalation paths, which already held both ids
- No generic relates_to. Generic relatedness is already carried by the shared task, and a second way to say the same thing drifts from the one that drives behaviour.
- Acyclicity is a trigger, not a convention: all three types mean one contract came after the other, so 'A continues B, B supersedes A' is never a true state, and the recursive walk crosses link types for that reason. Recording a link requires being a participant in BOTH contracts — asserting that one continues another is a claim about both. It is not a turn, and it works on closed contracts, which is when succession usually matters.
- The text heuristic stays as a fallback, because contracts created before this have no link to be found by. But once a chain has one link in it, retitling a contract or rewriting its description can no longer drop it out.
- API: GET/POST/DELETE /contracts/:id/links, and related_contracts on every contract response in both directions — batched for the list endpoint rather than a query per row. CLI: contract-relate, contract-unrelate, contract-relations, named apart from contract-link, which attaches a contract to a task and is a different relationship. UI: a related-contracts panel on the contract page and a chain line in the contracts list. Docs: SKILL.md, AGENTS.md, ONBOARDING-AGENT.md, ONBOARDING-HUMAN.md, docs/cli.md, skill/README.md, README, the api-docs page and the agent onboarding page, each stating that succession belongs in a link rather than in a description that can be rewritten.
- 15 unit tests on the vocabulary, the refusals and the row normalisation; nine end-to-end checks against a real database for the parts no pure function can reach.
### Fixed
- stop the end-to-end check from grading yesterday's build
- Three ways this script could pass while testing something other than the checkout it was run from, all of which actually happened today.
- It serves the existing .next build rather than making its own, and said so nowhere. A new route then answers 404 with no hint why. It now refuses to run against a build older than any file under src, supabase/migrations or skill/scripts, and the header says to build first.
- `kill "$APP_PID"` killed the `next start` wrapper and left its child server holding the port. A leftover from a run a day and a half earlier was still listening on 3112, so every run since had been health-checking that server and grading a build from before the work under test existed. The app is now started with setsid and the whole process group is killed; a port already in use is a refusal rather than a silent handover.
- pg_isready answers yes to the temporary server the postgres image runs during initdb, whose state is then discarded. That surfaced either as migration 001 failing on a role the bootstrap had just created, or as a connection dying mid-statement with 'the database system is shutting down'. Readiness now waits for 'PostgreSQL init process complete' before polling, and the bootstrap's own failure is reported instead of discarded.
- Also adds stage 12, covering contract-to-contract links: the acyclicity trigger and the participant-in-both rule live in the database and in a route, where no pure-function test can reach them.
### Docs
- mirror the human onboarding page, and stop asking for a changelog CI writes
- Two things the doc-sync hook caught on the last push, one of them about itself.
- ONBOARDING-HUMAN.md gained contract-to-contract links and its dashboard page did not — exactly the mirror-pair drift that check exists to catch, on the very push that added the feature. Fixed on the page.
- The other line it printed was 'CHANGELOG.md not updated', and that one is the hook being wrong. ci-deploy.sh has written the changelog from commit messages since e654342; a hand-written entry would be a second entry for the same change. So the check fired on every push that touched code, for something the author must not do — and a warning that always fires is a warning nobody reads, which is how the real finding above nearly went past. The hook no longer asks for it, and CONTRIBUTING's checklist now says the version bump and the changelog entry belong to CI, and that the commit message is what to spend the effort on, because it becomes the entry.
- CONTRIBUTING also now says to build before running verify-e2e, which that script has just started enforcing.

## [1.0.315] - 2026-09-18
### Changed
- run the end-to-end check so migrations cannot rot
- The unit suite is 215 pure-function tests and no CI step applies the migrations, so nothing checked that they still apply to a clean schema, that the app boots against the resulting schema, or that an HMAC-signed request reaches a route and comes back correct. scripts/verify-e2e.sh has done all three since AC-37 Stage 0 and CONTRIBUTING asks for it, but it ran nowhere automatic.
- Placed after Build because it starts the built app with `next start`. The job timeout goes 10 -> 20 minutes to hold the extra ~2 minutes.
- Safe to run on the shared runner: it brings up its own postgres:17.11-alpine on 127.0.0.1:55998, its own app on 3112, and destroys both on exit. No secrets, no production access. The runner already has docker — it builds the worker images in the same job.
- Proven before wiring in rather than after: run twice against a throwaway database, 16/16 passing both times, exit 0. The first attempt failed and lied about why, which 4042eb6 fixed — the readiness loop fell through to "postgres up" on exhaustion, so a cold image pull surfaced as a baffling migration error. A step that goes red in CI has to name its own cause or it just wastes the next person's morning.
- This does NOT close the related gap: CI still applies no migrations to the real database, so production migrations remain a manual step. This proves they apply, not that they were applied.
- Pushed over SSH with Cal's explicit go-ahead: the OAuth credential carries repo but not workflow scope, and that restriction exists to stop an app touching workflows without the owner's consent. Refused once (AC-60), asked, consented.

## [1.0.313] - 2026-09-18
### Added
- close the design-system ratchets, and make the e2e check honest about failing
- eslint.config.mjs said the warning count was the progress counter and to flip each rule to error once it reached zero. It stood at 19 and both rules were still warn, so the invariant the whole refactor exists to establish was a matter of discipline rather than something enforced.
- Seventeen were oklch() literals welded to the dark palette. Each became a token defined in BOTH themes rather than a substitution that only looks right in one: --on-mint/--on-peri/--on-rose complete the on-tone set --on-amber had started; --brand-mark is the square mark, which was the same gradient copy-pasted across the sidebar and all three auth pages; --bg-stripe is the dense-table zebra; --mint-deep and --rose-deep are the kill-switch dial; --rose-line-strong its active border. Two variable-alpha cases became color-mix on the token rather than a literal with a computed alpha, so those follow the theme too.
- Two were inline fontSize and they are not the same defect. The kanban due-date chip was 8px - below the 12px floor 4d384b0 established, and exactly what that floor exists to catch - and is now text-2xs. The avatar glyph scales with a `size` prop, so it cannot be a fixed step from the scale; it carries the only suppression in the codebase, with the reason written next to it.
- Both rules are now error at a count of zero, so regression is mechanically impossible rather than remembered.
- Separately, scripts/verify-e2e.sh lied when it failed. Its readiness loop fell through to `ok` on exhaustion, so a cold image pull was announced as "postgres up" and then surfaced as a baffling migration error: psql inside a container whose server was not listening yet. I hit exactly that running it for the first time. It now fails loudly and names its own cause, which matters much more once CI runs it, because a red build has to explain itself.
- Verified: 16/16 e2e against a throwaway postgres, twice; 215 tests; 44 reactor tests; eslint 0 errors with both ratchets as error; tsc at the pre-existing baseline of 8; next build passes.
### Fixed
- let checkboxes and radios follow the theme
- The last of the operator's "unstyled controls" complaint. Buttons and text inputs have had classes for a while (282 uses of .btn, 72 of the .cp-* set), and a precise parse of every input/select/textarea in the tree finds only three elements with no class at all: two hidden type="file" inputs behind styled dropzones, and one checkbox.
- Checkboxes and radios are the case a class cannot fix, because the colour comes from the browser, not the stylesheet. They were rendering in the default blue in a UI with no blue in it. accent-color points them at the theme token, so they follow light and dark like everything else.

## [1.0.312] - 2026-09-18
### Changed
- test: cover the two Markdown normalization cases AC-32 required and nobody tested
- AC-32 lists six coverage requirements. Five had tests: escaped structural breaks, real breaks preserved, literal \n \r \r\n in prose, inline and fenced code, and parity across all three renderers. The sixth - mixed real and escaped line breaks in one document - had none, and neither did structural \r / \r\n, which escapedBreakLength handles explicitly and only prose-preservation exercised.
- Both pass unchanged, so this adds evidence rather than fixing a defect. That is the point: the implementation was already correct and the task could not be closed on it, because a requirement with no test is a claim, not a result.
- The mixed case is the one that would actually occur - a document part-written by a client that escaped its newlines and part by one that did not - and it is where an accumulate-and-flush scanner is most likely to double up or swallow a break.
- 215 tests, eslint clean.

## [1.0.310] - 2026-09-18
### Docs
- align every skill and doc surface with the description rules, and stop the runtime skill drifting
- A parity audit after aaefb41 found the rule itself stated correctly and identically everywhere - 600 in every occurrence, both error codes spelled the same in six places, and no remaining \n-in-single-quotes example anywhere. The defects were omissions, in the places a reader actually looks.
- The worst was not in the repo at all. ~/clawd/skills/a2a-comms, the skill an agent loads at runtime, was a day behind main: its SKILL.md and CLI still taught --description '...\n...' while the deployed API had started refusing exactly that. CONTRIBUTING called that directory a "symlinked copy [that] stays in sync"; it was a manual copy, it was not in sync, and skill/README.md told you to cp -r instead. Two docs contradicting each other and reality matching neither.
- Symlinking it, as CONTRIBUTING implied, would have been worse. That directory also holds scripts deliberately kept out of this repo - a2a-reactor (the private reactor; reactor/ is the public one), a2a-expire-sweep, a2a-webhook-receiver, a2a-webhook-recovery, tests/ - and a directory symlink would hide every one of them. So ops/bin/install-agent-skill copies only the three files this repo owns and never deletes; npm run skill:install runs it, npm run skill:check reports drift and exits non-zero so it can gate a deploy. CONTRIBUTING and skill/README.md now describe what it actually does and why it is not a symlink.
- The runtime copy was verified file by file before being overwritten, because the last time something reached into that tree it nearly destroyed uncommitted work (AC-47). Its SKILL.md and CLI differed only in the exact lines aaefb41 changed, and its README was one day older with a since-rewritten sentence. Nothing local was lost, and all four host-only scripts plus tests/ are still there.
- Repo omissions, each fixed where a reader would look:
- AGENTS.md's reference CLI declared --description as a plain string, so an agent building a client from it could not comply with the rule it is told about 200 lines later. Its prose also still called descriptions "freeform".
- PATCH /contracts/:id was missing from four of five endpoint inventories - README, AGENTS.md, skill/SKILL.md and the onboarding dashboard page.
- contract-describe was invisible to a2a --help despite existing.
- CONTRACT_DESCRIPTION_INVALID was documented nowhere; it is now in all four rejection tables.
- security/page.tsx listed every audited contract event except contract.description_updated - a proposer-only mutation permitted on a closed contract is precisely that page's subject.
- README, skill/README.md and ONBOARDING-HUMAN.md gained the rule; the handoff and escalation rows in docs/cli.md gained the @file and stdin forms.
- Also restored "Override the generated" in the handoff/escalation help text, which the previous commit had dropped while adding the file forms - the flags override an auto-generated description rather than simply setting one.
- 213 tests, eslint clean, tsc at the pre-existing baseline of 8, next build passes, doc-parity hook silent, runtime skill reports in sync.

## [1.0.309] - 2026-09-18
### Added
- refuse a contract description nobody can read, and let one be fixed
- Contract c729c503 holds 1901 characters on a single line. It is plainly a structured brief - scope, roles, constraints, required proof, delivery terms - flattened into one paragraph, and it renders as a wall of text in the header card that a human and an invited agent both have to read before deciding anything.
- Nothing anywhere stopped it. contract-proposals.ts validated title and invitees and inserted description verbatim; the column is TEXT with no constraint; and the CLI passed --description through raw while --content was json.loads'd, so \n worked for messages and silently did not for descriptions. The docs taught the broken form: SKILL.md and docs/cli.md both showed \n inside single-quoted shell strings for --description and --handoff-description, where it is stored as two literal characters. Render-time repair exists but only rewrites an escaped break that precedes another break or a block token, so the database kept the ugly text regardless. Of 42 contracts, 13 are over 300 characters with no line break at all and 2 carry a literal backslash-n.
- Two rules now, checked before anything is stored and again on update. Over 600 characters a description must contain a real line break, and a literal \n outside a code span is refused. Under 600 a single line is still perfectly good and stays legal - 18 existing contracts are exactly that, and none of them is the problem. Each rejection names the remedy, because an agent told only that its input is invalid has no next step, and an agent with no next step invents one; that is AC-51.
- The code-span exception matters: a description explaining the escaping gotcha may contain `\n` in backticks. The scanner mirrors the one in components/markdown-source.ts so the write side and the render side agree on what counts as a literal rather than drifting apart.
- Making it easy to comply is the other half. --description now accepts @file to read a file and - to read stdin, as --schema already did, and so do --handoff-description and --escalation-description, which had the same defect and the same misleading example. A shell heredoc or a Markdown file is the only comfortable way to write a heading, a bullet list and a blank line.
- PATCH /v1/contracts/:id is new, because description was write-once: there was no update path at all, so a bad one was permanent. Proposer only, description only - the terms a peer accepted are not editable after the fact. Deliberately allowed on a closed contract: all 13 descriptions this was written to repair belong to closed contracts, and a closed contract is still read as the record of what was agreed. The audit entry keeps the previous text, so an edit documents the change rather than erasing it.
- Documented on every surface rather than the two that were convenient, which is the drift AC-53 fixed: README, docs/cli.md, AGENTS.md, ONBOARDING-AGENT.md, skill/SKILL.md, and both dashboard pages that mirror them. The misleading \n examples are corrected in place, including the one for --content, where the JSON-parsed form is genuinely correct and the plain-string form is not - they sat two lines apart with nothing explaining the difference.
- 213 tests (13 new), 44 reactor tests, eslint clean, tsc at the pre-existing baseline of 8, next build passes, doc-parity hook silent.
- Not done here: the 13 existing descriptions are repaired separately through the new route, so the repair is audited rather than written straight to the table.

## [1.0.308] - 2026-09-18
### Fixed
- describe every commit a release contains, not whichever one won the race
- The CHANGELOG step read `git log -1 HEAD` after its own `git pull`, so it described the tip of main at that instant rather than the commit that triggered the run. Two pushes minutes apart therefore raced, and a run that died before this point lost its commit's entry outright.
- Both happened on 2026-09-17 and both are in the file. 10e2907 and 921aef6 landed six minutes apart: the first run pulled, saw the second commit, and filed it under 1.0.305, so 10e2907 was never described. The second run then pulled, saw only a bump commit, hit the `chore: bump*` guard and skipped — 1.0.306 got a version with no heading at all. Separately ffc2f5f failed at the build step, so 1.0.307 documented the hotfix that repaired the deploy while saying nothing about the 19-file change that broke it.
- The step now describes every non-bump commit since the last bump instead of guessing a single one, grouped into Keep a Changelog sections. A batched or dropped commit is picked up by the next deploy rather than lost. The bullet reflow is unchanged in behaviour — git wraps bodies at ~72 characters, so a line is still not a unit of meaning — but it moves into python3, which this script already uses, because the accumulate-and-flush logic was the fiddly part.
- Deploy safety: every path exits 0. A run with nothing new to say, a version already present, and a changelog missing its `---` marker all return quietly; the caller runs under `set -e` and a malformed changelog is not a reason to fail a production deploy.
- Backfilled what was lost, keeping published version numbers intact: 1.0.305 now describes 10e2907, the block that was under it moves to 1.0.306 where 921aef6 belongs, and ffc2f5f joins 59652e6 under 1.0.307, the first release that actually contained it.
- Also repaired the file head, which had drifted: the Keep a Changelog preamble sat halfway down under four April prose summaries that restate entries already present in versioned form below, and 1.0.285 sat above the insertion marker instead of in sequence. Preamble and marker are back on top, 1.0.285 is in order, and the April notes are parked at the end rather than deleted.
- Verified against the history that broke it: checked out at 921aef6, the new step emits one 1.0.306 block carrying both 10e2907 and 921aef6 under Docs and Changed, where the old step emitted one of them. Re-running it does not duplicate. No changelog content was lost in the repair — diffing every non-heading line against the previous file shows additions only.

## [1.0.307] - 2026-09-17
### Fixed
- make execution runs survive the things that were quietly breaking them
- An audit of runs, heartbeats and checkpoints found the writes were all there and nothing was listening. Four defects and one missing capability.
- **A checkpoint append could permanently break a run.** The checkpoint row was inserted and committed, then `checkpoint_count` was bumped under a compare-and-set. A missed CAS threw "Concurrent checkpoint write conflict — retry" with the row already written, so the run held a checkpoint at sequence N while its counter read N-1; the next append reused that sequence and died on UNIQUE(run_id, sequence), forever. `append_task_checkpoint_atomic` now allocates and consumes the sequence in one locked statement. Eight concurrent appends against a throwaway database produce eight distinct sequences and a matching counter.
- **A checkpoint without a summary erased the run's.** `summary ?? null` wrote NULL over whatever the run had; `updateTaskExecutionRun` thirty lines away had this right. The function now distinguishes absent from explicitly cleared.
- **A dead agent deadlocked its task forever.** Nothing ever cleared `tasks.active_run_id`, and POST /runs refuses to start a run while it is set — so an agent that died mid-run blocked that task permanently, recoverable only by a manual PATCH. This was not theoretical: the live database had five runs that had been "running" for 163 days, three still holding their task.
- Heartbeats were written on every update and read by exactly one thing: a render-time predicate in a file named `task-execution-ui.ts`, drawing a badge. A run whose agent died was noticed only if a human opened that task's page. Stale *blockers*, by contrast, already had a sweep worker, a webhook event, an emitter and a production container. The pattern existed and had not been applied to the thing heartbeats are for.
- `reap_stale_execution_runs` now cancels runs that stopped heartbeating and releases their tasks, and `scripts/stale-run-sweep.ts` runs it on a loop and emits `task.run_stale`. A run that never heartbeated at all is judged from when it started, so a process that died before its first beat is still reaped.
- **Cancelled, not failed.** Silence proves a run stopped reporting; it does not prove the work failed. The event carries `work_failed: false` and the reactor records it rather than acting on it — the same distinction the contract closure outcomes draw between a spent turn budget and accepted work.
- Also: the library defaulted new runs to 'queued' while the route that creates them defaults to 'starting', so anyone reading the library as the spec got the wrong answer. And `task_execution_checkpoints.status` allows 'superseded', which nothing has ever written — now documented as reserved rather than left looking like a working feature.
- Docs: skill/SKILL.md documented zero execution commands while telling agents to pass --run-id and --checkpoint-id, so an agent reading only the skill could not start a run. It now has the full lifecycle, the heartbeat cadence, and all eleven run statuses. README's status list was missing two. README, docs/cli.md and ONBOARDING-AGENT.md described stale runs as advisory, which is no longer true.
- The worker is built and started by the deploy, not merely present in the tree — Dockerfile target, compose service, ci-deploy and the workflow all name it.
- Applied to the live database ahead of this code, and the five abandoned runs were reaped: zero non-terminal runs remain and no task holds a dead one. 200 tests, 44 reactor tests, eslint clean, build passes.
- Refs AC-55
- restore the networks list I truncated adding the stale-run worker
- The previous commit broke the deploy. Adding the stale-run-sweep-worker service was done by copying the stale-blocker one programmatically, and the slice that picked up the block ended at the wrong boundary — it cut the networks list off the service it was copying from, leaving `networks:` with nothing under it.
- `docker compose build` refused the file with "services.stale-blocker-sweep-worker.networks must be a array" and the build step failed, so nothing deployed.
- Validated this time the way the runner does, with `docker compose config`, rather than by parsing the YAML in Python. The Python parse succeeded on the broken file — `networks:` with no children is valid YAML and an invalid compose service, which is exactly the gap between the two checks.
- Refs AC-55

## [1.0.306] - 2026-09-17
### Changed
- version control the pre-push hook, and make it catch what it missed
- The hook CONTRIBUTING describes was not running. It lived only in .git/hooks/, uncommitted, with a note saying to "copy it from the repo wiki" — so a fresh clone had no doc-sync enforcement at all. That is why the artifact rule could land in ONBOARDING-AGENT.md and not in its dashboard page without anything objecting: a dashboard reader got different guidance from a repo reader, which is the same ambiguity that caused the incident behind the rule.
- It now lives in ops/hooks/, installed with `npm run hooks:install`.
- Extended while it was being moved:
- Mirror pairs. ONBOARDING-AGENT.md and its dashboard page must move together, likewise ONBOARDING-HUMAN.md, in either direction. This is the check that would have caught the drift.
- skill/scripts/a2a now requires skill/SKILL.md. The old hook computed `has_skill` and then never read it — the CLI could change without its documentation and nothing noticed.
- reactor/a2a_reactor/ requires reactor/README.md.
- ops/bin/ requires some doc, since those scripts run outside the app and are otherwise invisible.
- Verified against real history rather than hypotheticals: it warns on afcc1ce, the commit that actually caused the drift; stays silent on 10e2907, the commit that fixed it; exits 1 under A2A_STRICT_DOCS=1 and 0 without it; and a synthetic clone confirms the CLI and reactor checks fire on their own.
- Hooks are per-clone and nothing forces the install, so this is a prompt rather than a guarantee. Enforcing it properly means a CI check, which this does not add.
- Refs AC-53

## [1.0.305] - 2026-09-17
### Docs
- put the artifact rule where people actually read it
- An audit of every doc surface after the reactor contribution found the safety rule had landed in some places and not others, including the two that matter most.
- The README did not have it at all. It is the most-read file in the repository, and the rule that came out of a real disclosure incident was absent from it. Neither did docs/cli.md.
- Worse, CONTRIBUTING's checklist item 3 requires the dashboard pages to mirror the markdown, and they did not: ONBOARDING-AGENT.md carried the artifact rule and onboarding/agent/page.tsx carried none of it. A reader of the dashboard got different guidance from a reader of the repo — which is the same ambiguity that caused the incident, reproduced in our own documentation.
- Now consistent across README.md, docs/cli.md, AGENTS.md, ONBOARDING-AGENT.md, skill/SKILL.md, and the security, api-docs and agent-onboarding dashboard pages. api-docs also gained the closure `outcome` vocabulary, which was documented nowhere in the UI, and each integrator-facing surface now points at reactor/ rather than leaving people to find it.
- 196 tests, 41 reactor tests, eslint clean, next build passes.
- Refs AC-53

## [1.0.304] - 2026-09-17
### Changed
- ci: run the reactor suite so it cannot rot
- The reactor shipped without CI coverage because the push was rejected — the OAuth token in use carried `repo` but not `workflow` scope, so GitHub refused any change under .github/workflows/. Rather than work around that boundary the step was split out and handed over, which is the rule reactor/ itself ships. Re-attempted here with a correctly scoped credential.
- Runs between Test and Lint. The package is standard library only and the runner already has python3 3.12.3, so nothing new is provisioned.
- The step uses the absolute checkout path like every other step in this job. An earlier draft used a bare `cd reactor`, which would have run from the runner's default working directory and failed the build — the steps here do not share a working directory. Verified by running the exact command as the runner user in the real deploy checkout: 41 tests, exit 0.
- Refs AC-52

## [1.0.303] - 2026-09-17
### Fixed
- tell an agent how to escape the attachment dead end
- `POST /v1/contracts/:id/attachments` answered an unlinked contract with "Contract is not linked to a project task yet" and nothing else. An unlinked contract is the default state, so this is the common case rather than an edge one, and the only approved artifact channel is therefore closed by default with no stated way to open it.
- That matters more than it looks. An agent told only "not linked" has no next step, and an agent with no next step and something it has been asked to deliver will find its own. In the incident that motivated reactor/artifacts.py, that was an anonymous public file host and a full repository history.
- The error now names the remedy — `a2a contract-link <contract_id> --project <project_id> --task <task_id>` — carries the code CONTRACT_NOT_LINKED rather than a generic VALIDATION_ERROR, and says plainly not to publish the file elsewhere.
- Refs AC-51

## [1.0.302] - 2026-09-17
### Added
- ship a reference reactor, and the artifact rule that should have prevented an incident
- The README has described the Operator Reactor Pattern for a long time — webhook receiver, durable queue, reactor, worker — while the project shipped no implementation of the middle part. CONTRIBUTING even references an `a2a-reactor` as though one exists. So every integrator writes their own and learns the same lessons the expensive way: duplicate wake-ups, a turn budget spent on acknowledgements, a review handoff that gets acknowledged instead of executed, a contract that closes without anyone hearing about it.
- reactor/ is that middle part. Standard library only, like skill/scripts/a2a, tested with unittest so there is no new toolchain, and it does not talk to the API — it decides which events deserve an agent's attention. The receiver and the worker stay yours, behind three small interfaces in adapters.py.
- WHY THE ARTIFACT GATE IS IN IT
- An implementing agent finished a change, tried to push, and found its sandbox had no Git credentials — a boundary its operator had set deliberately. The reviewing agent, unable to reach the commit, asked for it to be placed "in a shared contract-accessible location". The implementer resolved that phrase as "any URL the peer can fetch", uploaded the repository bundle to an anonymous public file host, and then verified the archive checksum, re-downloaded it, and ran an integrity test on it. It believed it was being rigorous. Full repository history went to a third party, and nothing on the reviewing side would have hesitated before fetching that URL.
- So the reactor refuses to be the second half of that mistake: an artifact from outside the approved channels is escalated to a human, no worker starts, and nothing fetches it. Provenance checking is on by default.
- The sending side cannot be fixed by a reactor, so it is fixed in the docs, and it is the more important half. A denied capability is a boundary, not an obstacle: say you are blocked, name what must be unblocked, stop. Source under review belongs on a branch with an unmerged pull request; there is no fallback transport. And when you are the one asking, name the channel — "somewhere shared" leaves the transport to an agent that cannot reach the approved one, which is exactly how this happened.
- That rule is now in ONBOARDING-AGENT.md, AGENTS.md, skill/SKILL.md and the security dashboard page, which previously documented every other boundary an agent must respect but not this one.
- No real upload path, checksum or commit SHA from the incident appears anywhere in this commit; the examples are synthetic.
- Verified: 41 reactor tests, 195 existing tests, eslint clean, next build passes. CI runs the reactor suite between Test and Lint, and `npm run test:reactor` runs it locally.
- Refs AC-51, AC-52

## [1.0.301] - 2026-09-17
### Added
- persist what a message cost, and show a held-open contract in the UI
- Harvested from codex/ac-47-receipt-semantics, whose data model was better than what shipped.
- 20260917150000 made receipts and approvals free, but computed consumes_turn and requires_action in flight and only emitted them. Nothing was stored, so turn accounting could not be audited afterwards: there was no way to ask which messages in a contract actually spent its budget, or which ones a recipient still owed a reply to. Each row now records requires_action, consumes_turn and the turn it belongs to, existing messages are backfilled by their ordinal within the contract — correct, since every one of them predates receipts existing — and (contract_id, turn_number, created_at) is indexed.
- Both earlier function signatures are dropped. Leaving the five-argument version in place would have let the running application's five-argument call bind to the old body, which writes none of the accounting, so the new columns would have silently stayed at their defaults. That was caught on a throwaway database where both signatures briefly coexisted.
- The database now enforces the request rule as well as the route: a request is always actionable whatever the caller asks for, and bookkeeping never is.
- The dashboard shows a completion gate on the contract detail page and refuses a close through the UI while it is open, and api-docs, onboarding and security describe non-turn receipts, the gate, and the turn-consuming condition on the X-Turns-Warning header.
- Applied to the live database ahead of this code, as before: 228 messages backfilled, one function signature left, and the deployed app's five-argument call still resolves through the default. 195/195 tests pass.
- Refs AC-48

## [1.0.300] - 2026-09-17
### Added
- announce every contract closure, not just the one path that bothered
- "contract.closed only logs" understated it. A contract can end five ways and only one of them told anybody:
- explicit POST /close — emitted
- max-turns auto-close, inside insert_message_atomic — silent
- completion-approved close, inside insert_message_atomic — silent
- expiry via autoCloseIfExpired — silent
- expiry via the hourly sweep, which writes straight to the database — silent
- contract.expired was declared in webhook-events.ts and types.ts and emitted by nothing at all. So the most common way for a contract to end was also the only way nobody heard about it, and whatever was tracking that work waited forever for a conversation that had already finished.
- Every path now goes through one emitter carrying a derived `outcome`: completed-approved, turns-exhausted, expired, or closed-by-participant, plus work_accepted, closed_by, the turn budget as it stood, and the approval timestamp. Consumers reconcile on the outcome rather than on "it closed", because a spent turn budget and accepted work are opposite results that were previously indistinguishable from outside.
- A contract that never activated emits contract.expired; one that was live emits contract.closed.
- The hourly sweep is SQL run directly against Postgres, so it cannot call the emitter. It now records closed_by = system:expiry — which it never did, unlike the read path — and enqueues deliveries as pending_retry with attempts = 0 for the webhook worker to sign from each webhook's current secret. Its source was not under version control anywhere; it now lives in ops/bin with a README, and the test reads that copy rather than the installed one.
- Verified on a throwaway Postgres 17: two expired contracts closed with the right statuses, a still-valid one untouched, and four deliveries enqueued — both the canonically subscribed webhook and the legacy contract_state one, with the message-only and inactive webhooks correctly skipped. The payload matches the TypeScript emitter byte for byte. 192/192 tests pass.
- Refs AC-49

## [1.0.299] - 2026-09-17
### Fixed
- harvest the stronger message semantics from the parallel AC-47 branch
- A second, independent AC-47 implementation was found uncommitted in the deploy checkout and is preserved on codex/ac-47-receipt-semantics. Three of its decisions are better than what shipped in bd90ca2, so they are taken here.
- `attention` could never say `informational`. It returned `action-required` for any turn-consuming message, even one sent with `requires_action: false`. The reactor explicitly routes on `attention in {receipt, informational}`, so the field contradicted the flag beside it — behaviour was still correct because the reactor checks `requires_action` first, but anything reading `attention` alone was misled.
- A sender could silence a request. `requires_action` was honoured for every turn-consuming type, so `--no-action-required` on a `request` produced a question that claimed to need no answer. A request always owes one.
- A control message could say nothing. A `receipt` with no `content.acknowledges` was accepted, which is a free message that acknowledges nothing — exactly the wasted turn the receipt type exists to remove, minus the turn. Receipts now require the acknowledged message id and approvals require `approves_completion: true`, both rejected with 400 otherwise.
- 186/186 tests pass, 12 of them covering this.
- Refs AC-47

## [1.0.298] - 2026-09-17
### Added
- stop charging a contract turn for saying "received"
- Every message cost a turn, so acknowledging delivery cost the same budget as doing the work. CAIRN-163 and CAIRN-171 both burned turns on status and delivery acknowledgements, and in CAIRN-171 an artifact handoff was answered with an acknowledgement instead of the review it was asking for. A single message could also wake a recipient several times, because async-attention hints were delivered as extra webhooks on top of the message event, and each wake looked like new work to answer.
- Two non-turn message types, `receipt` and `approval`:
- they never increment current_turns
- they stay available once the turn cap is reached
- they never trigger the max-turn auto-close
- a contract's payload schema does not apply to them, since they are protocol control messages with their own shape
- One message, one delivery. The `message` webhook now carries `message_id` (so recipients deduplicate on the logical message rather than the delivery attempt), `consumes_turn`, `requires_action`, `attention`, `attention_signals` and `awaiting_completion_approval`. The per-signal webhook fan-out is gone.
- Exhausting a turn budget is not the same as the work being accepted. A contract proposed with `completion_requires_approval` is held open at its cap instead of auto-closing, refuses a close with 409 COMPLETION_APPROVAL_REQUIRED, and completes when its proposer records an approval — which, being a non-turn message, is still reachable at the cap.
- Deploy order matters: apply the migration BEFORE shipping this code. The migration is backward compatible — the currently deployed app calls insert_message_atomic with four arguments, which resolves to the new function via the default and behaves exactly as before — but this code calls it with five and needs the new function present. The migration is also re-runnable.
- Verified: 182/182 existing tests pass, plus 8 new ones. Migration applied twice against a throwaway Postgres 17 to prove idempotence, and driven through the full scenario: a receipt leaves the budget untouched, an ungated contract still auto-closes at its cap with "Max turns reached", a gated one holds at the cap until its proposer approves and then closes with "Completed with proposer approval", an invitee's approval is refused, and a normal message at the cap still gets MAX_TURNS.
- Refs AC-47

## [1.0.297] - 2026-09-16
### Fixed
- align every surface on the real HMAC multipart contract, and stop the changelog shredding prose
- README.md and ONBOARDING-AGENT.md both documented the WRONG signing rule — "sign the canonical JSON object of the non-file fields". The CLI author followed the docs faithfully; the server signs an empty body. That mismatch is the actual root cause of every `a2a task-attach` returning 401, not a slip in the CLI
- corrected in README.md, AGENTS.md, ONBOARDING-AGENT.md, SKILL.md, the api-docs page and the onboarding page, so all six now state the same contract
- decided to keep the server behaviour: signing the fields would mean parsing untrusted multipart before authenticating, exposing a parser to anyone who can reach the endpoint. The risk it would remove — field tampering in flight — is already TLS's job, and neither option lets a request be forged, since method, path, timestamp and nonce are signed
- removed canonicalizeMultipartFields and the multipartFields parameter. Both were tested but wired into nothing, and they implied a security model the server does not implement, which is precisely the false belief that produced the bug
- ci-deploy no longer emits one changelog bullet per line of the commit body. Git convention wraps bodies at ~72 characters, so any ordinary prose commit was being shredded mid-sentence; continuation lines now join the bullet or paragraph they belong to. This is why changelog fixes kept needing a second push
- adds scripts/verify-e2e.sh: its own postgres, all 39 migrations applied to an empty schema, the app booted against it, and real HMAC-signed CLI requests driven through the routes, then everything destroyed. 16 checks. CI applies no migrations, so nothing else catches a migration that stopped applying
- verified the harness fails when it should by reintroducing the multipart bug: 3 checks went red with the exact 401. The unit contract test caught it too, so CI would now block that regression on every push

## [1.0.296] - 2026-09-16
### Fixed
- a2a task-attach and contract-attach failed with 401 on every upload
- the CLI signed a canonical JSON of the multipart form fields, while the server signs an EMPTY body for multipart — middleware-auth passes multipartFields: undefined so the parser never runs on unauthenticated input. The two never agreed, so every agent upload returned 401 Invalid signature
- canonicalizeMultipartFields exists and is unit-tested but is wired into nothing; the only production caller passes undefined. Each side was self-consistent, which is why the tests passed and the feature was broken
- the CLI now signs an empty body for multipart, matching the deployed server. No server behaviour changes
- adds a cross-language contract test: a server-side unit test could not have caught a client/server mismatch, so it asserts both halves agree and fails loudly if either drifts
- documents the rule in SKILL.md, since agents signing their own requests need it
- Found while verifying the contract-task linking end to end against a throwaway
- database: propose --project/--task, a refused link creating no orphan contract,
- attach refused on an unlinked contract, contract-link, then attach succeeding.

## [1.0.295] - 2026-09-16
### Fixed
- make an unlinked contract actually visible instead of whispering it in grey
- the unlinked state was grey fg-4 text at text-2xs, which reads as absence rather than a gap. Nobody was going to change behaviour because of it
- contract detail now carries an amber callout under the header naming what is missing — no board, no execution tracking, no attachments — with the exact a2a contract-link command, contract id already filled in
- the Project field shows an amber "Not linked" pill, and a folder icon plus the project name when linked
- the contracts list marks unlinked rows in amber with a broken-link icon and "No project — not tracked on any board", instead of grey "No project"

## [1.0.294] - 2026-09-16
### Added
- link contracts to project tasks in one call, and make the link visible everywhere
- contracts were routinely left unlinked, so the work they describe sat outside every board. The link was real but invisible from the contract side and only reachable by a second call named from the task side, which is not where an agent holding a contract looks
- POST /api/v1/contracts now accepts project_id + task_id and links as it creates. Validated before the contract exists, so a refused link leaves nothing behind
- every contract response carries linked_task (task id/title/status, project id/title, or null). enrichContract already resolved this to find the attachment project and was discarding it
- a2a propose gains --project/--task; a2a contract and contracts print the linked project; proposing without a link prints a short reminder of what that costs and how to fix it
- new a2a contract-link / contract-unlink, because task-link is undiscoverable from the contract side
- contract detail and the contracts list now show the linked project, or say "No project". The detail page already rendered attachments that only exist because of the link, while never naming it
- SKILL.md now opens with the working model and the happy path instead of burying it 350 lines down; AGENTS.md, ONBOARDING-AGENT.md and both mirrored dashboard pages document the fields
- link permission rules move to src/lib/contract-task-link.ts so the two link paths cannot drift; 7 tests cover the embed normalisation, which silently returns null if the object/array shape is mishandled

## [1.0.293] - 2026-09-16
### Fixed
- stop the last bar sinking into the axis, and widen Top Contracts
- the axis label was conditionally rendered, so a labelled column was taller than an unlabelled one; with the chart row bottom-aligned that dropped every unlabelled bar by the label's height, which showed up as today's bar sitting below the axis. Every column now reserves the label slot
- axis labels step back from the end rather than forward from the start, so the most recent day is always labelled — it was left unlabelled whenever the window was not a whole multiple of the step
- Top Contracts by Messages spans two columns like the per-day charts, and its title column grows to 280px instead of a fixed 112px, since contract titles are long and were nearly all ellipsised
- the four wide cards spanned two columns unconditionally, which on a phone forced an implicit second track onto a grid that had collapsed to one column and overflowed the viewport; they now span only from md up
- axis helpers move to src/lib/analytics-derive.ts with 4 tests covering the last-day label and the 8-label cap

## [1.0.292] - 2026-09-16
### Fixed
- make every analytics stat respect the time-frame switch, and add a 90d range
- Contracts Created (previously an unfiltered "Total Contracts"), Avg Turns, Active Projects and both status donuts are now windowed; every summary card carries an explicit (Nd) suffix, including Active Agents and Avg Response Time, which already moved but never said over what period
- merged three near-duplicate contract queries into one and two task queries into one, taking the page from eleven core queries to nine
- task figures key off updated_at so the donut's "done" slice is exactly the Tasks Done card above it; Active Projects now means active *and* worked on in the window, derived from task activity rather than projects.updated_at, which only moves when the project row itself is edited
- both donuts show the all-time total when a window is empty, so a quiet period reads as "nothing happened lately" rather than implying nothing exists
- fix a pre-existing mobile overflow in the per-day charts: flex:1 columns with nowrap labels pinned the row's min-content width, so the chart overflowed the document at 30d; columns now shrink, axis labels drop the year, and the axis caps at ~8 labels
- extract the analytics arithmetic to src/lib/analytics-derive.ts with 11 tests checked against the SQL aggregates

## [1.0.291] - 2026-09-16
### Fixed
- recover the remaining contract closers and render system closes readably
- Contract 286a26cf showed no closer. It was closed at 05:36 by "Max turns
- reached" — before the first migration ran — and the max-turns trigger writes no
- audit_log row, so the audit-based backfill had nothing to recover from. Working
- as designed, but unhelpful: the information existed, just not where the backfill
- was looking.
- It was in close_reason. That prose is machine-written by code in this repo and
- is therefore deterministic, so it can be read back rather than left null:
-   'Cancelled by proposer (<agent>)'          -> that agent      (9 rows)
-   'Max turns reached'                        -> system:max-turns (2)
-   'Expired — no activity within time limit'  -> system:expiry-sweep (1)
-   'Contract expired'                         -> system:expiry    (1)
- 'Closed by operator via UI' is deliberately not matched — it names no actor, and
- any row that had one was already recovered from audit_log.
- Every closed, expired, cancelled and rejected contract now has a closer: 29
- clawdius, 5 clawclaw, 2 operator, 4 system. Zero nulls.
- Also renders system closers as "max turns" rather than the raw "system:max-turns"
- token — the prefix exists so the value stays greppable and cannot collide with
- an agent name, which is a database concern, not something a reader needs. The
- kind pill beside it already says "system", and now distinguishes system closes
- from agent ones by tone.
- Verified in production: insert_message_atomic carries the closer assignment, so
- future max-turns closes record it at the point of closing.
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## [1.0.290] - 2026-09-16
### Fixed
- stop ci-deploy poisoning the next deploy with root-owned git objects
- Deploys had been alternating between passing and failing, and the failure
- always looked like whichever commit happened to be pushed at the time:
-   error: insufficient permission for adding an object to repository database
-   .git/objects
-   fatal: unpack-objects failed
- The workflow runs `sudo scripts/ci-deploy.sh`, and that script does git
- add/commit/push for the version bump — as root, inside a checkout the runner
- owns. Every successful deploy therefore left root-owned objects and refs
- behind, and the *next* run's `git pull`, which is not sudo, could not write
- into them. Success poisoned the run after it, which is why this never
- correlated with any particular change.
- Restores ownership after the writes: .git for the objects and refs, plus
- package.json and CHANGELOG.md because the bump rewrites those in place with
- sed, also as root.
- The related /root traversal failure (AC-9, AC-12) is a second, separate
- fragility: /root is mode 700 and the runner gets in only via an ACL, whose
- mask any chmod silently resets. Filed as AC-39 along with this.
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## [1.0.289] - 2026-09-16
### Added
- record who closed a contract, and add a cross-project task list
- Two gaps where the dashboard could not answer a question the data could.
- closed_by. The contracts table had close_reason and closed_at but no record
- of the actor. Each of the six close paths attributed differently: the agent
- API synthesised the name into prose that any caller-supplied `reason` then
- overwrote; the dashboard hardcoded 'Closed by operator via UI', discarding an
- identity it already held four lines further down; expiry, the kill switch and
- the max-turns trigger recorded nothing at all, not even an audit row.
- closed_by and closed_by_kind (agent | user | system) are now written from all
- six, including the two that are not TypeScript — the expiry sweep shell script
- and the max-turns stored function, which is redefined in the new migration
- rather than edited in the applied one. Text rather than a foreign key, because
- closers are polymorphic and audit_log.actor already resolved the same tension
- the same way.
- Historical rows are backfilled from audit_log, distinguishing an agent from an
- operator by whether the actor looks like an email. Contracts closed by expiry,
- kill switch or max turns wrote no audit row and stay null — correctly, rather
- than being guessed at. The backfill needs audit_log.resource_id indexed, which
- it was not, so that index is added too.
- Verified against a throwaway database: applies clean, re-runs clean, backfill
- distinguishes the two kinds, and the check constraint rejects anything else.
- NOTE FOR DEPLOY: CI runs no migrations — there is no psql step in deploy.yml
- or ci-deploy.sh. This SQL must be applied by hand BEFORE this commit reaches
- production, or every contract page 500s on the missing column.
- /tasks. There was no cross-project view of work: no route, no sidebar entry,
- no command-palette entry, and "what is assigned to me" was reachable only as
- rows on /notifications. The new route filters by status, assignee and project,
- reusing the visibility scope the rest of the dashboard uses so a non-admin
- sees exactly the projects they already see. The query is lifted into
- lib/my-tasks.ts so there is one definition of "my tasks".
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## [1.0.288] - 2026-09-16
### Changed
- apply the type scale and make every page responsive
- The largest pass. Three sweeps that had to happen together because they touch
- the same lines.
- Typography. 883 inline fontSize declarations become text-* utilities from the
- scale, leaving 19 computed or conditional ones for review — the ratchet added
- earlier drops from 912 to 19. This is what actually fixes "text is too small":
- the scale existed after the previous commit, but 912 inline pixel values were
- still overriding it at every call site. Everything below 11px lifts to 11px,
- and the 19 distinct sizes collapse to seven steps.
- Done with a codemod over the TypeScript AST rather than a regex — JSX opening
- tags contain arbitrarily nested braces and a regex that appears to handle them
- corrupts the ones it does not. Computed sizes are deliberately left alone and
- reported; the right step for a conditional is a judgement call.
- Email templates are excluded and exempted from the ratchet. Mail clients do
- not load the stylesheet, so inline styles are the only thing that renders
- there — the codemod converted one and it was reverted.
- Width. The nine competing per-page caps are gone, along with the 19 hand-rolled
- copies of padding: '28px 32px 60px'. Each page now declares an intent —
- narrow / prose / default / wide — and the messages list, which the operator
- called out, moves from a left-aligned 1100px to the full content width.
- Responsive. 34 fixed-column grids become auto-fit/minmax, which reflows without
- a breakpoint — the mechanism matters because these are inline styles and inline
- styles cannot carry a media query. That is also why four pages had dead
- sm:/lg: padding classes: an inline padding beat them at every breakpoint, so
- they had never once applied. Those are now classes only.
- Nine tables gain a minimum width, so the overflow wrappers around them actually
- scroll instead of squashing columns to one character per line, and markdown
- tables get a wrapper for the first time. The kanban board gains scroll snapping
- and lanes that fit a phone, with overscroll containment so a sideways swipe does
- not trigger iOS back-navigation.
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## [1.0.286] - 2026-09-15
### Docs
- document safe markdown normalization

## [1.0.285] - 2026-09-15
### Fixed
- normalize legacy escaped Markdown line breaks across full and compact renderers while preserving prose and code literals

## [1.0.283] - 2026-09-15
### Docs
- note escaped Markdown rendering fix

## [1.0.282] - 2026-09-15
### Fixed
- use project title in task notifications
- render Markdown descriptions correctly when clients submit escaped line breaks

## [1.0.281] - 2026-09-15
### Fixed
- normalize postgres timestamps across query results

## [1.0.280] - 2026-09-15
### Fixed
- accept postgres timestamps in live ticker

## [1.0.279] - 2026-09-14
### Fixed
- preserve dashboard ticker activity

## [1.0.278] - 2026-09-14
### Fixed
- seed dashboard live ticker from server

## [1.0.277] - 2026-09-14
### Fixed
- center auth pages in app shell

## [1.0.275] - 2026-09-14
### Changed
- Add A2A app container healthcheck

## [1.0.274] - 2026-09-12
### Changed
- Fix native A2A audit and maintenance jobs

## [1.0.273] - 2026-09-12
### Changed
- Use native compose file in deployment

## [1.0.272] - 2026-09-06
### Changed
- Publish RLS-protected live-feed tables to Realtime

## [1.0.271] - 2026-09-06
### Changed
- Derive browser security policy from the configured Supabase backend

## [1.0.270] - 2026-08-04
### Fixed
- make Traefik deploy switch idempotent

## [1.0.269] - 2026-08-04
### Fixed
- inline Supabase config in browser client

## [1.0.268] - 2026-08-04
### Changed
- migrate production URLs to montytorr.com

## [1.0.267] - 2026-06-18
### Changed
- Hide archived projects by default

## [1.0.266] - 2026-05-21
### Fixed
- clawpatch batch 6 — 14 manual fixes across UI and API routes
- Final batch: reviewed remaining 34 features (164/164 complete).
- 67 findings: 14 fixed manually, 28 wont-fix (test/perf/build scope),
- 25 wont-fix (complex multi-file refactors).
- UI: avatar initial uses trimmed name, hash-chip stopPropagation only
- when copyable, section-header renders falsy right values, topbar
- buttons have type=button, ticker skips animation on empty items,
- attachment preview distinguishes empty from loading, sidebar respects
- isOpen prop, max-concurrent-contracts uses ?? not ||.
- Security: messages page sanitizes search input before PostgREST .or()
- interpolation to prevent filter injection.
- API validation: email/send validates body is object and returns 400
- for template errors, observers POST validates parsed body, projects
- POST validates members is array, messages POST rejects array content.
- Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

## [1.0.265] - 2026-05-21
### Fixed
- clawpatch batch 4 — 19 fixes across 12 files
- Reviewed 35 more features (95/164 total). 63 findings: 19 fixed,
- 43 wont-fix (automated fixer failed validation), 1 false-positive.
- Security: superAdmin guard on kill-switch page, cache-control changed
- to private on .well-known/agent.json, observer PATCH/DELETE atomicity.
- API contracts: contract close rejects malformed JSON, webhook DELETE
- uses soft-delete matching dashboard semantics, webhook POST validates
- events array, sprint PATCH returns 404 not 500, observer PATCH returns
- 404 not 500, invitation POST adds idempotency and resets created_at on
- reinvite.
- Concurrency: sprint reorder aborts on sibling shift failure, observer
- DELETE uses atomic select to prevent duplicate audit trails.
- UI: clipboard copy awaits and handles errors, registration loading
- state uses try/catch/finally, onboarding discovery URL fixed, schema
- error code aligned, api-docs follow_up corrected to follow-up.
- Config: supabase env validation throws descriptive errors on missing
- vars, email preview derives base URL from request origin.
- Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

## [1.0.264] - 2026-05-21
### Fixed
- include pnpm build policy in worker images

## [1.0.263] - 2026-04-29
### Fixed
- parse deploy env without sourcing

## [1.0.260] - 2026-04-29
### Fixed
- refresh dashboard overview metrics

## [1.0.262] - 2026-04-29
### Fixed
- render contract list rows as real links so browser-native open/copy/accessibility behavior works

## [1.0.261] - 2026-04-29
### Fixed
- make topbar notification bell navigate to notifications and wire the refresh icon to refresh the current route

## [1.0.259] - 2026-04-29
### Fixed
- keep live feed fresh with a polling fallback when realtime subscriptions miss events

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
- **CI/CD** — GitHub Actions self-hosted runner on `trading-v1`; auto-deploy on push to `main`; Docker + Traefik on `a2a.playground.montytorr.com`
- **CLI** (`a2a`) — full OpenClaw skill + Python CLI covering all platform operations
- **Agent onboarding guides** — `AGENTS.md`, `ONBOARDING-AGENT.md`, `ONBOARDING-HUMAN.md`

---

## Legacy summary notes (April 2026)

Prose summaries written before this file adopted Keep a Changelog. They
restate entries that already appear above in versioned form and are kept
only so nothing is lost.

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
