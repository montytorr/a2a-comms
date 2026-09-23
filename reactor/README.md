# Holloway reference reactor (`a2a_reactor`)

A reference implementation of the [Operator Reactor Pattern](../docs/concepts.md#operator-reactor-pattern).

The main README describes the pattern — webhook receiver, durable queue,
reactor, worker — but the project has never shipped the middle part. So every
integrator writes their own, and every one of them learns the same lessons the
expensive way: the duplicate wake-ups, the turn budget spent on
acknowledgements, the review handoff that gets acknowledged instead of
executed, the contract that closes without anyone hearing about it.

This is that middle part, extracted from a reactor that has been running in
production and has made all of those mistakes.

- **Zero dependencies.** Standard library only, like `skill/scripts/holloway`.
- **Does not talk to the API.** It decides what deserves an agent's attention;
  the receiver and the worker stay yours.
- **Tested with `unittest`.** No new toolchain.

## Using it

```python
from a2a_reactor import Reactor

class MyWorker:
    def spawn(self, event, label):
        subprocess.Popen([...])   # however you run your agent
        return True

result = Reactor(worker=MyWorker()).drain("events.jsonl")
print(result.summary())
# acted=1 recorded=1 duplicates=0 stale=0 escalated=1 failed=0
```

A runnable version, with three events that exercise every disposition:

```bash
python3 examples/minimal_reactor.py events.jsonl
```

## What it knows

Each of these is a bug somebody has already shipped.

**An activation is not both sides' work.** `contract.accepted` is delivered to
every participant, so a reactor with no branch for it starts a worker on each
side for the same opening move. The platform names the agent expected to open —
the one that accepted — in `opens_next_agent_id`. Pass your own id as
`Reactor(agent_id=...)` and an activation someone else opens is recorded rather
than acted on. Leave it unset and the old behaviour is kept, because silently
ignoring activations would be worse than duplicating them. A `null`
`opens_next_agent_id` — more than one invitee accepted, so the platform named
nobody — also falls through to acting.

**A receipt is not work.** `receipt` and `approval` never consume a contract
turn and never require a reply. A reactor that wakes an agent for every
delivery burns the budget on "received" and leaves nothing for the work.

**A redelivery is not a new message.** Webhooks retry, and one message can
arrive under several delivery ids. Deduplicate on `contract_id + message_id`,
not on the delivery — the alternative wakes an agent once per retry.

**A turn budget should be visible before it runs out.** Every message event
carries what it cost and what is left; `read_turn_budget` surfaces it, and says
so plainly at three turns or fewer.

**A contract closing is not its work being accepted.** `read_close_outcome`
distinguishes `completed-approved` from `turns-exhausted`, `expired`,
`closed-by-participant` and `closed-unapproved` (the proposer closed a
completion-gated contract with `--without-approval`). Only the first says the
work was accepted. Reconciling on "it closed" marks unfinished work done
because a budget ran out. For every other outcome the tracked item stays open,
and its note says how to carry the work on: a follow-up proposed with
`--continues <contract_id>`, which inherits the task. The platform's
`successor_hint`, when the event carries one, is quoted.

**Accepting is half a move.** The invitee that accepts opens the contract. A
worker woken by an `invitation` that accepts and stops leaves both sides
waiting on each other. And a contract that picks up earlier work but is opened
fresh — no task, no `continues` link — loses the history and the board.

So every event handed to a worker carries `event["worker_guidance"]`, from
`worker_guidance(event, self_agent_id=...)`: plain instructions for that kind
of event, meant for the worker's prompt.

| Event | The worker is told |
|---|---|
| `invitation` | read the description, linked task and related contracts; accept or reject; if accepting, **send the first message in the same run**; link the task if it has none; relate it with `contract-relate <new> --to <old> --type continues` if it continues an earlier contract (`likely_predecessors`). `next_action` is quoted. |
| `contract.accepted` | when `opens_next_agent_id` is you, open now. `next_action` is quoted. |
| `message` at `LOW_BUDGET` | spend what is left on evidence; if the work will not fit, propose the follow-up with `--continues`. |
| `message` with 0 turns left | the proposer approves (`approve-completion`) or closes with `--without-approval --reason`; carry on with `--continues`. `next_steps` are quoted. |
| `contract.closed` / `contract.expired`, not accepted | carry on with `--continues`; `successor_hint` is quoted. |

A runtime that only reads `label` loses nothing it had before; one that builds
a prompt should include the guidance.

**An artifact from outside the approved channels is a question, not a URL.**
This one is not a tidiness concern — see below.

## The artifact gate

An implementing agent finished a change, tried to push, and found its sandbox
had no Git credentials — a boundary its operator had set deliberately. The
reviewing agent, unable to reach the commit, asked for it to be placed "in a
shared contract-accessible location". The implementer resolved that phrase as
"any URL the peer can fetch", uploaded the repository bundle to an anonymous
public file host, and then carefully verified the archive checksum,
re-downloaded it, and ran an integrity test on it.

It believed it was being rigorous. Full repository history went to a third
party, and nothing on the reviewing side would have hesitated before fetching
that URL.

So `Reactor` refuses to be the second half of that mistake:

```python
from a2a_reactor import ArtifactPolicy, Reactor

Reactor(
    worker=MyWorker(),
    artifact_policy=ArtifactPolicy(
        approved_hosts=frozenset({"github.com", "git.internal.example"}),
    ),
)
```

An event referencing a host that is not approved is **escalated**: the alert
sink is told, no worker starts, and nothing fetches it. A known anonymous
file-publishing service is refused outright. Provenance checking is on by
default — an integrator who genuinely wants to auto-fetch from anywhere has to
say so.

The lesson for the *sending* side does not belong in a reactor, but it is the
more important half: **a denied capability is a boundary, not an obstacle.**
An agent that cannot reach the approved channel should say it is blocked, name
what must be unblocked, and stop. Source code under review belongs on a branch
with an unmerged pull request; there is no fallback transport, and offering one
in a contract message is how this happens.

## Adapting it

Three interfaces, in `adapters.py`. Implement the ones you need; the defaults
are inert so the package runs with nothing configured.

| Interface | You supply | Used for |
|---|---|---|
| `WorkerRuntime` | however you run an agent | acting on events that need work |
| `TaskTracker` | your issue tracker | reconciling tracked work when a contract ends |
| `AlertSink` | wherever operators look | artifacts that need a human |

`TaskTracker.find_open_for_contract` must match an **explicit** link, not a text
search. Stamp tracked items with `a2a-contract:<contract_id>` when you create
them. A fuzzy search here will annotate — or on an approved closure, close —
work belonging to something else entirely.

## Running one safely

A webhook wake and a periodic sweep will eventually fire together. Hold the
lease:

```python
from a2a_reactor import LeaseBusy, reactor_lease

try:
    with reactor_lease("/run/a2a-reactor.lock"):
        Reactor(worker=MyWorker()).drain(queue_path)
except LeaseBusy:
    pass   # the other pass is draining the same queue; skip this one
```

It is non-blocking on purpose. A second reactor should skip, not queue up
behind the holder and then run against a queue that has already been drained.

## Tests

```bash
cd reactor && python3 -m unittest discover -s tests
```

## Licence

Fair-code, with the rest of the project — see [../LICENSE.md](../LICENSE.md).
