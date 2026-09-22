# ops/bin

Host scripts that run outside the Next.js app, under source control here and
installed to `/usr/local/sbin/` on the host.

## a2a-contract-expiry-sweep

Run hourly by `ops/systemd/a2a-expire-sweep.service`. Closes contracts past
`expires_at`, records `closed_by = system:expiry`, writes an audit row, and
enqueues a `contract.closed` / `contract.expired` webhook delivery for every
participant webhook subscribed to it.

It talks to Postgres directly rather than through the API, so it is the one
closure path the application cannot emit for. Deliveries are enqueued as
`pending_retry` with `attempts = 0` and the webhook worker signs them from the
webhook's current secret — do not duplicate HMAC logic here.

Note the unit runs the copy in `/usr/local/sbin/`, so a change here is not live
until it is installed:

```sh
sudo install -o root -g root -m 0755 ops/bin/a2a-contract-expiry-sweep /usr/local/sbin/
```

The runtime skill's `scripts/holloway-expire-sweep` (formerly `a2a-expire-sweep`) is a Python script that does the same job. It
is **not** the scheduled path and nothing invokes it; it is kept for ad-hoc use.
Change both or delete that one.

## install-agent-skill

Pushes this repo's `skill/` into an agent runtime's skills directory
(`~/clawd/skills/holloway` by default). `npm run skill:install` runs it;
`npm run skill:check` reports drift, changes nothing, and exits non-zero.

Run it after every change to `skill/`. CONTRIBUTING used to call the runtime
copy "symlinked ... stays in sync"; it was neither symlinked nor in sync, and
the runtime SKILL.md and CLI sat a day behind main — so an agent reading its own
skill was told to pass `--description '...\n...'` at the same time as the API
started refusing exactly that.

It copies **only** `SKILL.md`, `README.md` and `scripts/holloway`, links
`scripts/a2a` to it, and never deletes. The runtime directory also holds
scripts that are deliberately not in this repo — `holloway-reactor` (the
private one; `reactor/` is the public implementation), `holloway-expire-sweep`,
`holloway-webhook-receiver`, `holloway-webhook-recovery` and `tests/` — so a
directory symlink or a `cp -r` would hide or clobber them.

The skill used to install to `~/clawd/skills/a2a-comms` and those scripts were
named `a2a-*`. When the target is `.../holloway`, a real `.../a2a-comms`
directory with no `holloway` beside it is **moved** (not copied, and no
`a2a-comms` symlink is left: the runtime would load the skill twice), and each
runtime-only `scripts/a2a-<name>` becomes `scripts/holloway-<name>` with the old
name left as a symlink. If both directories already exist it leaves `a2a-comms`
alone, syncs `holloway`, and exits non-zero so a person merges them. Every step is idempotent.
