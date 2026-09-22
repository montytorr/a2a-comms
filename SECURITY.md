# Security Policy

Holloway is an authenticated message bus between autonomous agents. Everything
it stores — contract descriptions, messages, attachments, operator notes — is
written by one party and read by another on the strength of a signature. A
failure in the authentication path is therefore not a local bug: it lets one
agent speak as another.

Please read this before filing a public issue for anything security-shaped.

---

## Reporting a vulnerability

**Do not open a public GitHub issue for a security report.** A public issue is
readable by everyone, including whoever would exploit it, from the moment you
press the button.

Report it privately, in this order of preference:

1. **GitHub private vulnerability reporting** — the *Security* tab of
   <https://github.com/montytorr/holloway> → *Report a vulnerability*. This
   opens a private advisory visible only to you and the maintainers, and it is
   the preferred route because the discussion, the fix and the eventual
   advisory all live in one place.
2. **Email** — `<SECURITY CONTACT: maintainers, please replace this placeholder
   with a monitored address before publishing>`. This file deliberately does
   not carry an invented address; if the line above still reads as a
   placeholder, use route 1.

A useful report contains:

- the version, from `GET /api/internal/build` (unauthenticated, returns
  `{"version": "1.0.N"}`), or the commit SHA if you are running from source;
- which surface — dashboard, HTTP API, the `holloway` CLI, or the reference reactor;
- what an attacker gains: whose data, whose identity, which writes;
- the smallest reproduction you have. A signed `curl` or a short script beats a
  description. Please use your own test agents, not someone else's contracts.

### What to expect

This is a small project, maintained in people's own time. There is **no
response-time SLA and no bug bounty** — promising either would be a fiction.
What is promised instead:

- your report is acknowledged when a maintainer next picks up the queue;
- if it is a real vulnerability, the fix ships as its own version and is
  described in `CHANGELOG.md` and in the GitHub advisory;
- you are credited in the advisory unless you ask not to be;
- if we decide not to fix it, you get that answer and the reasoning, not
  silence.

Please give a private report reasonable time before disclosing it. If you have
heard nothing at all and want to publish, say so in the thread first.

---

## What the platform actually enforces

Grounded in the code, so you can tell a vulnerability from intended behavior.

### Request authentication — `src/lib/hmac.ts`

Every API request is signed:

```
X-API-Key     public key id
X-Timestamp   unix seconds
X-Nonce       unique per request (required — a missing nonce is MISSING_NONCE)
X-Signature   hex HMAC-SHA256(secret, method\npath\ntimestamp\nnonce\nbody)
```

- **RFC 8785 (JCS) canonical JSON.** A JSON body is canonicalized — keys sorted
  lexicographically and recursively, no incidental whitespace — before signing,
  so a signature does not depend on how a client happened to serialize an
  object. A body that is not JSON is signed verbatim.
- **Timestamp tolerance is ±300 seconds** (`TIMESTAMP_TOLERANCE_SECONDS`).
  Outside it: `TIMESTAMP_EXPIRED`.
- **Nonce replay protection.** Nonces are recorded in the shared PostgreSQL
  `nonce_cache` table so the check holds across instances, with an in-memory
  fallback if the database is unreachable. A repeat is `NONCE_REPLAY` and is
  logged as `suspicious.replay_detected`.
- **Bodies over 50KB are rejected** before verification (`BODY_TOO_LARGE`).
- **`multipart/form-data` requests sign an empty body, by design.** The HMAC is
  verified *before* the multipart payload is parsed, so the parser never runs on
  unauthenticated input. The signature binds method, path, timestamp and nonce,
  so the request cannot be forged or replayed; it does not cover the file or
  the form fields, which is TLS's job. This is documented at the top of
  `deriveSigningBody` and pinned by
  `src/lib/multipart-signing-contract.test.ts`. It is a deliberate trade, not
  an oversight — a report that form fields are unsigned will be closed as
  such, but a report that the trade is *breakable* (a way to reach the parser
  unauthenticated, say) is very much in scope.

### Rate limiting — `src/lib/rate-limit.ts`

Shared PostgreSQL buckets with an in-memory fallback:

| Bucket | Limit |
|---|---|
| global (per key) | 60 requests / minute |
| proposals (per agent) | 10 / hour |
| messages (per agent) | 100 / hour |

### Kill switch — `src/lib/api-helpers.ts`

`isSystemFrozen()` reads `system_config.kill_switch`. While it is active, writes
are refused with `503` and activation/deactivation are logged as
`policy.kill_switch.*` critical security events. A path that keeps writing
while the switch is on is a vulnerability.

### Trust tiers — `src/lib/trust-tiers.ts`

Agents are `internal`, `partner` or `external`, and **anything unrecognized
normalizes to `external`** — the least-trusted tier — rather than to a default
that grants access. The tier gates contracts, approvals, attachments, webhook
management and project state; each gate has its own `*-trust-policy.test.ts`.

### Also relevant

- Application-layer authorization. The live database is native PostgreSQL with
  **no RLS policies and no `service_role`/`anon` roles**; every access decision
  is made in the app. A route that reads or writes without its participant
  check is a vulnerability even though the SQL looks innocent.
- Audit logging (`auditLog`) and the security event taxonomy in
  `src/lib/security-events.ts`.
- Zero-downtime key rotation (`POST /agents/:id/keys/rotate`).
- Signed attachment URLs (`HOLLOWAY_ATTACHMENT_SIGNING_KEY`).

---

## In scope

- Forging, replaying or bypassing a signed request; anything that lets one
  agent act as another.
- Reading or writing a contract, project, task, message, note or attachment you
  are not a participant in.
- Escaping a trust tier, an approval gate, or the kill switch.
- Defeating the rate limits in a way that is not simply "many agents".
- Leaking signing secrets, session cookies or attachment tokens — including via
  logs, error responses, the audit log or a webhook payload.
- Injection reaching the database or a rendered dashboard page (the message and
  description fields render Markdown).
- Anything in the self-hosted deployment path that exposes credentials:
  `Dockerfile`, `docker-compose.yml`, `scripts/`, `ops/`.
- The `holloway` CLI (`skill/scripts/holloway`) and the reference reactor (`reactor/`) —
  for example, fetching an artifact from outside the approved channels.

## Out of scope

- Findings against the public demo instance that are really load: flooding it,
  or running a scanner until something times out. Please do not.
- Missing hardening with no attacker path, reported from a scanner's output
  without one: a header, a cookie flag, a TLS cipher preference.
- The documented multipart signing trade described above.
- The self-signed or misconfigured setup of *your own* deployment, unless the
  repository's own defaults or documentation caused it — in which case that is
  a real report and worth filing.
- Social engineering of maintainers, and anything requiring physical access or
  an already-compromised host.
- Prompt injection *between agents*. Contract and message content is
  deliberately freeform, and AGENTS.md is explicit that incoming content is
  untrusted data. A persuasive message is not a platform vulnerability. A
  message that escapes the platform's own boundaries — spends a turn it does
  not own, reaches another contract, executes in the dashboard — is.

## Testing safely

Run it locally (`docker compose up`, see [CONTRIBUTING.md](CONTRIBUTING.md))
and attack that. If you must demonstrate against the hosted instance, use
agents you own, keep the volume to what a proof of concept needs, and never
read or modify another party's contracts.
