"""The loop: drain the queue, decide, act, and reconcile what ended.

This is the implementation of the Operator Reactor Pattern described in the
project README — webhook receiver, queue, reactor, worker. The receiver and the
worker belong to you; this is the part in the middle that decides which events
deserve an agent's attention and which only deserve a record.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable

from .adapters import (
    AlertSink,
    NullTaskTracker,
    NullWorkerRuntime,
    StderrAlertSink,
    TaskTracker,
    WorkerRuntime,
)
from .artifacts import ArtifactPolicy
from .closure import CloseOutcome, read_close_outcome, work_was_accepted
from .events import Disposition, Triage, triage_event
from .queue import read_queue, write_queue
from .turns import read_turn_budget

__all__ = ["Reactor", "ReactorResult", "CONTRACT_MARKER_PREFIX"]

#: Stamp this on any tracked item opened for contract work, so the contract's
#: ending can find it. Without a link there is nothing to reconcile, and the
#: item is silently orphaned when the contract closes.
CONTRACT_MARKER_PREFIX = "a2a-contract:"


@dataclass
class ReactorResult:
    """What one pass did, in terms an operator can act on."""

    acted: int = 0
    recorded: int = 0
    duplicates: int = 0
    stale: int = 0
    escalated: int = 0
    failed: int = 0
    notes: list[str] = field(default_factory=list)

    @property
    def processed(self) -> int:
        return self.acted + self.recorded + self.duplicates + self.stale + self.escalated

    def summary(self) -> str:
        return (
            f"acted={self.acted} recorded={self.recorded} duplicates={self.duplicates} "
            f"stale={self.stale} escalated={self.escalated} failed={self.failed}"
        )


class Reactor:
    """Drains a queue of A2A webhook events and decides what deserves a worker.

    Nothing here talks to the A2A API. The reactor's job is to decide; the
    worker you supply is what acts.
    """

    def __init__(
        self,
        *,
        tracker: TaskTracker | None = None,
        worker: WorkerRuntime | None = None,
        alerts: AlertSink | None = None,
        artifact_policy: ArtifactPolicy | None = None,
        max_age_hours: float = 24.0,
        agent_id: str | None = None,
        log: Callable[[str], None] | None = None,
    ) -> None:
        self.tracker: TaskTracker = tracker or NullTaskTracker()
        self.worker: WorkerRuntime = worker or NullWorkerRuntime()
        self.alerts: AlertSink = alerts or StderrAlertSink()
        #: Default to enforcing provenance. An integrator who genuinely wants
        #: to auto-fetch from anywhere has to say so.
        self.artifact_policy = artifact_policy or ArtifactPolicy()
        self.max_age_hours = max_age_hours
        #: Your own agent id. Supplying it lets the reactor skip an activation
        #: the other participant is expected to open, instead of both sides
        #: starting a worker for the same first move.
        self.agent_id = agent_id
        self._log = log or (lambda message: None)

    # -- one pass ---------------------------------------------------------

    def drain(self, queue_path: str, *, now: datetime | None = None, dry_run: bool = False) -> ReactorResult:
        """Process every queued event once, then rewrite what remains.

        An event that could not be handled stays queued. An event that was
        handled — including one deliberately left for a human — does not, so a
        failing worker retries while an escalation does not loop.
        """
        events = read_queue(queue_path)
        result = ReactorResult()
        seen: set[str] = set()
        retained: list[dict] = []

        for event in events:
            triage = triage_event(
                event,
                seen_keys=seen,
                max_age_hours=self.max_age_hours,
                now=now,
                artifact_policy=self.artifact_policy,
                self_agent_id=self.agent_id,
            )
            handled = self._apply(event, triage, result, dry_run=dry_run)
            if not handled:
                retained.append(event)

        if not dry_run:
            write_queue(queue_path, retained)
        return result

    # -- one event --------------------------------------------------------

    def _apply(self, event: dict, triage: Triage, result: ReactorResult, *, dry_run: bool) -> bool:
        event_id = event.get("id", "?")
        payload = event.get("payload") or {}
        data = payload.get("data") or {}
        contract_id = payload.get("contract_id", "?")

        if triage.disposition is Disposition.DUPLICATE:
            result.duplicates += 1
            self._log(f"{event_id}: duplicate — {triage.reason}")
            return True

        if triage.disposition is Disposition.STALE:
            result.stale += 1
            self._log(f"{event_id}: stale — {triage.reason}")
            return True

        if triage.disposition is Disposition.ESCALATE:
            result.escalated += 1
            message = (
                f"Contract {contract_id}: {triage.reason}. "
                "No worker was started and nothing fetched it. A human must decide."
            )
            self._log(f"{event_id}: escalated — {triage.reason}")
            if not dry_run:
                self.alerts.alert(message)
            result.notes.append(message)
            return True

        if triage.disposition is Disposition.RECORD:
            result.recorded += 1
            budget = read_turn_budget(data)
            self._log(f"{event_id}: recorded — {triage.reason} [{budget.describe()}]")
            return True

        # Anything that ends a contract reconciles rather than waking a worker.
        if event.get("event") in {"contract.closed", "contract.expired"}:
            result.acted += 1
            return self._reconcile_closure(contract_id, data, result, dry_run=dry_run)

        budget = read_turn_budget(data)
        self._log(f"{event_id}: action required [{budget.describe()}]")
        if dry_run:
            result.acted += 1
            return True

        label = f"A2A {event.get('event', 'event')} on contract {contract_id}"
        if self.worker.spawn(event, label):
            result.acted += 1
            return True

        result.failed += 1
        self._log(f"{event_id}: worker failed to start; event retained for retry")
        return False

    # -- closure ----------------------------------------------------------

    def _reconcile_closure(self, contract_id: str, data: dict, result: ReactorResult, *, dry_run: bool) -> bool:
        """Bring tracked work into line with how the contract ended.

        Only an accepted outcome closes anything. A spent turn budget, an
        expiry, or a participant deciding they are finished all mean the
        conversation stopped with the work's status unknown — closing on those
        marks unfinished work done.
        """
        outcome = read_close_outcome(data)
        accepted = work_was_accepted(outcome)
        turns = f"{data.get('current_turns', '?')}/{data.get('max_turns', '?')}"
        summary = (
            f"Contract {contract_id} ended: outcome={outcome.value} "
            f"closed_by={data.get('closed_by') or 'unknown'} turns={turns}"
        )
        self._log(summary)

        if dry_run:
            return True

        refs = self.tracker.find_open_for_contract(contract_id)
        if not refs:
            return True

        for ref in refs:
            note = summary + (
                ". The proposer recorded approval, so this is closed with it."
                if accepted
                else ". This is how the conversation ended, not evidence the work "
                     "was accepted, so it stays open and needs a decision."
            )
            if not self.tracker.annotate(ref, note):
                result.failed += 1
                continue
            if accepted and not self.tracker.close(ref, summary):
                result.failed += 1
        return True
