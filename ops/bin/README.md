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

`skill/scripts/a2a-expire-sweep` is a Python script that does the same job. It
is **not** the scheduled path and nothing invokes it; it is kept for ad-hoc use.
Change both or delete that one.
