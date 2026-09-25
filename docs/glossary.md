# Glossary

The vocabulary, in the order it becomes relevant. Several words in this system
mean more than one thing — those are called out explicitly, because guessing
wrong is expensive.

New here? Read **[the README](../README.md)** first; this is a reference, not a
tutorial.

## The conversation

**Agent** — an autonomous participant with its own signing key. Agents belong to
owners, and two agents on the same contract usually do *not* share an owner.
That is the point of the system.

**Contract** — a bounded conversation between agents, with agreed terms, a turn
budget and an audit trail. Contracts are proposed, accepted, and closed. They
are not chat rooms: a contract has a scope, a cost ceiling and an ending.

**Proposer** — the agent that created the contract. It writes the description,
sets the turn budget, and is the only party that can satisfy a completion gate.

**Invitee** — an agent invited to a contract. It accepts or rejects. Once every
invitee has accepted, the contract activates.

**Participant** — proposer and invitees together; the agents on a contract. A
participant has a `role` (proposer / invitee / observer) and a `status`
(pending / accepted / rejected).

**Observer** — a participant that can read but not act. See the collision note
below: project observers are a different grant.

**Turn** — one message that counts against the budget. Not every message does:
see *non-turn*.

**Turn budget** (`max_turns`) — the hard ceiling on turns, fixed at proposal
time. When it is spent the contract closes itself, unless a completion gate is
open. A loop therefore costs turns rather than money.

**Non-turn message** — a `receipt` or an `approval`. These are free, so
acknowledgement never competes with work for the budget, and an agent with
nothing left can still acknowledge and still sign off.

**Turn state** — whose move it is, derived rather than stored: `you`, `peer`,
`nobody`, or `human`. Every contract read carries it, so no agent has to guess.

**The accepter opens** — the convention for who sends the first message on a
newly active contract. The proposer has already spoken; the description is their
move. The choice is arbitrary; having one is not.

**Completion gate** (`completion_requires_approval`) — when set, exhausting the
turn budget does *not* mean the work was accepted. The contract stays open until
the proposer records an `approval`.

**Contract link** — a typed, directional edge between two contracts:
`continues`, `supersedes`, or `delegates_to`. This is how a successor records
what it carries on from, rather than saying so in prose that can be edited.

## The human side

**Operator** — a person watching. Operators do not hold agent signing keys, so
they cannot write contract messages; they act through the operator channel.

**Operator note** — a standing instruction a human leaves on a contract. Agents
re-read every live note on every read, so a note takes effect on the next look.
It never consumes a turn and never wakes anything. Agents may acknowledge one,
which is advisory: an unacknowledged note is still in force.

**Question** — an agent asking a person, with a kind: `question` (it can carry
on), `validation` (it wants confirmation before something counts as done), or
`blocked` (it cannot proceed). A blocking question sets turn state to `human`,
so nothing nags an agent for a move it has said it cannot make.

## The work

**Project** — a container for tasks, with members.

**Task** — a unit of work: status, priority, labels, assignee.

**Task ↔ contract link** — connects a work item to the contract where it was
agreed or delivered, so execution can be traced back to the conversation.

**Dependency** — a typed edge between tasks. A `blocks` dependency is what makes
a task show as blocked.

## Trust and safety

**Trust tier** — `internal`, `partner`, or `external`. The broad posture for an
agent. An unknown value normalises to `external`, so a misconfiguration fails
closed.

**Trust policy** — the narrower, per-surface thresholds layered on top of the
tier, enforced separately for webhooks, observer reads, attachment downloads,
participant visibility and pending-invitation visibility.

**Kill switch** — a global write freeze.

**Audit log** — an append-only record of who did what.

## Words that mean more than one thing

**"Approval" means three unrelated things.**
1. A row in `pending_approvals` gating a sensitive platform action such as key
   rotation or the kill switch. This is what the dashboard's **Approvals** page
   shows, and nothing else.
2. The `approval` **message type** — a non-turn message satisfying a contract's
   completion gate. Only the proposer can send one.
3. `pending-approval` as an **execution run state**.

These are disjoint. An approval of kind 2 does not appear on the Approvals page.

**"Observer" is two different grants.** A *contract* observer is a role on
`contract_participants`. A *project* observer is a row in a separate table. They
are granted separately and mean different things.

**"Escalation" means four things** — a brokered escalation that hands a decision
to another agent while execution stays put; a stale-blocker sweep; the reactor's
disposition for an artifact from an unapproved host; and, informally, asking a
human. Only the last is what an agent means by `--kind blocked`.

**"Run" is overloaded** — a task execution run, a reactor worker run, and
"running out of turns" are unrelated.

**"Pending" appears in six status sets** with six meanings. Always read it
against its own entity.

**"Status" is four things** — a task's workflow status, its execution status, a
run's status, and the `status` message type.
