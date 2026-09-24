"""The three things a reactor needs from its host, as interfaces.

Every integrator has a different task tracker, a different way of running an
agent, and a different place alerts go. Those are the parts that cannot be
shared; everything else in this package can. Implement these to plug the
reactor into your own stack. The default worker is deliberately inert and
retains actionable events until a real runtime is configured.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .outcomes import WorkerOutcome

__all__ = ["TaskTracker", "WorkerRuntime", "AlertSink", "NullTaskTracker", "NullWorkerRuntime", "StderrAlertSink"]


@runtime_checkable
class TaskTracker(Protocol):
    """Whatever records the work a contract causes."""

    def find_open_for_contract(self, contract_id: str) -> list[str]:
        """Return references to open items linked to this contract.

        Implementations must match an explicit link, not a text search. A fuzzy
        match here will annotate — or on an approved closure, close — work that
        belongs to something else.
        """

    def annotate(self, ref: str, note: str) -> bool:
        """Record a note against one item. Return False on failure."""

    def close(self, ref: str, resolution: str) -> bool:
        """Close one item. Only ever called for an accepted outcome."""


@runtime_checkable
class WorkerRuntime(Protocol):
    """Whatever actually does the work when an event needs action."""

    def spawn(self, event: dict, label: str) -> "bool | WorkerOutcome":
        """Run a worker for this event and say how it ended.

        Report success only after the worker completed the required action, or
        after a durable runtime took ownership and can resume failures. Merely
        starting a process is not a claim: the reactor removes successful
        events from its queue, and a process can die before its first message.

        Return a `WorkerOutcome` when the runtime can tell the difference
        between acting, triaging, stopping to ask a person, and failing.
        `classify_worker_output` derives one from what the worker printed.

        A bool still works and means acted-or-failed. It is the weaker answer:
        it cannot express NEEDS_HUMAN, so a worker that stops and asks is read
        as a crash and retried behind its back until the event goes stale.
        """


@runtime_checkable
class AlertSink(Protocol):
    """Where an operator finds out something needs them."""

    def alert(self, message: str) -> None:
        ...


class NullTaskTracker:
    """Tracks nothing. The reactor still triages and still spawns workers."""

    def find_open_for_contract(self, contract_id: str) -> list[str]:
        return []

    def annotate(self, ref: str, note: str) -> bool:
        return True

    def close(self, ref: str, resolution: str) -> bool:
        return True


class NullWorkerRuntime:
    """Runs nothing and never claims an actionable event was handled.

    Returning success here would drain the queue while no worker ran. That
    makes an accepted contract look dispatched even though nobody opened it.
    """

    def __init__(self) -> None:
        self.spawned: list[tuple[str, str]] = []

    def spawn(self, event: dict, label: str) -> bool:
        self.spawned.append((str(event.get("id", "?")), label))
        return False


class StderrAlertSink:
    """Writes alerts to stderr, so nothing is silently dropped by default."""

    def alert(self, message: str) -> None:
        import sys

        print(f"[a2a-reactor][alert] {message}", file=sys.stderr, flush=True)
