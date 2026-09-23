"""A reference reactor for Holloway (formerly A2A Comms).

The project README describes the Operator Reactor Pattern — webhook receiver,
durable queue, reactor, worker — but ships no implementation of the middle
part, so every integrator writes their own and learns the same lessons the
expensive way. This package is that middle part.

It has no dependencies beyond the standard library, and it does not talk to the
Holloway API: it decides which events deserve an agent's attention. The receiver and
the worker remain yours.

    from a2a_reactor import Reactor

    result = Reactor(worker=MyWorkerRuntime()).drain("events.jsonl")
    print(result.summary())

What it knows that a first implementation usually does not:

- receipts and approvals never consume a contract turn, and must not wake a worker
- a redelivered webhook is the same logical message and must not wake one twice
- a turn budget should be visible before it runs out, not after
- a contract closing is not the same as its work being accepted
- the invitee that accepts opens, and unfinished work continues in a contract
  linked with --continues, not a fresh unlinked one
- an artifact arriving from outside the approved channels is a question for a
  human, not a URL to fetch

That last one is not hypothetical. See ``artifacts.py``.
"""

from __future__ import annotations

from .adapters import (
    AlertSink,
    NullTaskTracker,
    NullWorkerRuntime,
    StderrAlertSink,
    TaskTracker,
    WorkerRuntime,
)
from .artifacts import (
    DEFAULT_APPROVED_HOSTS,
    DEFAULT_DENIED_HOSTS,
    ArtifactPolicy,
    ArtifactReference,
    ArtifactVerdict,
    extract_artifact_references,
)
from .closure import SUCCESSION_OUTCOMES, CloseOutcome, read_close_outcome, work_was_accepted
from .events import (
    NON_TURN_MESSAGE_TYPES,
    Disposition,
    Triage,
    consumes_turn,
    is_stale,
    requires_action,
    semantic_key,
    triage_event,
)
from .guidance import successor_guidance, worker_guidance
from .lease import LeaseBusy, reactor_lease
from .outcomes import LEGACY_MARKERS, MARKERS, WorkerOutcome, classify_worker_output
from .queue import append_event, read_queue, write_queue
from .reactor import CONTRACT_MARKER_PREFIX, Reactor, ReactorResult
from .turns import LOW_BUDGET_THRESHOLD, TurnBudget, read_turn_budget

__version__ = "0.1.0"

__all__ = [
    "WorkerOutcome",
    "MARKERS",
    "LEGACY_MARKERS",
    "classify_worker_output",
    "__version__",
    # loop
    "Reactor",
    "ReactorResult",
    "CONTRACT_MARKER_PREFIX",
    # triage
    "Disposition",
    "Triage",
    "triage_event",
    "requires_action",
    "consumes_turn",
    "semantic_key",
    "is_stale",
    "NON_TURN_MESSAGE_TYPES",
    # artifacts
    "ArtifactPolicy",
    "ArtifactReference",
    "ArtifactVerdict",
    "extract_artifact_references",
    "DEFAULT_APPROVED_HOSTS",
    "DEFAULT_DENIED_HOSTS",
    # turns
    "TurnBudget",
    "read_turn_budget",
    "LOW_BUDGET_THRESHOLD",
    # closure
    "CloseOutcome",
    "read_close_outcome",
    "work_was_accepted",
    "SUCCESSION_OUTCOMES",
    # guidance
    "worker_guidance",
    "successor_guidance",
    # plumbing
    "reactor_lease",
    "LeaseBusy",
    "read_queue",
    "write_queue",
    "append_event",
    # adapters
    "TaskTracker",
    "WorkerRuntime",
    "AlertSink",
    "NullTaskTracker",
    "NullWorkerRuntime",
    "StderrAlertSink",
]
