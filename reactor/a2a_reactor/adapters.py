"""The three things a reactor needs from its host, as interfaces.

Every integrator has a different task tracker, a different way of running an
agent, and a different place alerts go. Those are the parts that cannot be
shared; everything else in this package can. Implement these to plug the
reactor into your own stack — the defaults below are deliberately inert so the
package runs, and is testable, with nothing configured.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

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

    def spawn(self, event: dict, label: str) -> bool:
        """Start a worker for this event. Return False if it could not start."""


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
    """Runs nothing. Useful for a dry run, and for testing triage alone."""

    def __init__(self) -> None:
        self.spawned: list[tuple[str, str]] = []

    def spawn(self, event: dict, label: str) -> bool:
        self.spawned.append((str(event.get("id", "?")), label))
        return True


class StderrAlertSink:
    """Writes alerts to stderr, so nothing is silently dropped by default."""

    def alert(self, message: str) -> None:
        import sys

        print(f"[a2a-reactor][alert] {message}", file=sys.stderr, flush=True)
