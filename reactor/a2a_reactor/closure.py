"""Why a contract ended, which is not the same as whether its work finished.

A contract can close because the work was accepted, because its turn budget ran
out, because it expired, or because a participant decided they were done. Only
the first says anything about the work. A consumer that reconciles on "it
closed" will mark unfinished work complete on the strength of a spent budget.
"""

from __future__ import annotations

from enum import Enum

__all__ = ["CloseOutcome", "read_close_outcome", "work_was_accepted"]


class CloseOutcome(str, Enum):
    #: The proposer recorded approval. The only outcome that asserts acceptance.
    COMPLETED_APPROVED = "completed-approved"
    #: The turn budget ran out with no approval recorded.
    TURNS_EXHAUSTED = "turns-exhausted"
    #: Nobody acted before the deadline.
    EXPIRED = "expired"
    #: A participant closed it; their reason may or may not mean completion.
    CLOSED_BY_PARTICIPANT = "closed-by-participant"


def read_close_outcome(data: dict) -> CloseOutcome:
    """Name the outcome, inferring it for events that predate the field."""
    declared = data.get("outcome")
    if declared:
        for outcome in CloseOutcome:
            if outcome.value == declared:
                return outcome

    closed_by = str(data.get("closed_by") or "")
    if closed_by == "system:completion-approved":
        return CloseOutcome.COMPLETED_APPROVED
    if closed_by == "system:max-turns":
        # A gated contract only auto-closes on max turns once its approval is
        # recorded, so an approved one that lands here did complete.
        return (
            CloseOutcome.COMPLETED_APPROVED
            if data.get("completion_approved_at")
            else CloseOutcome.TURNS_EXHAUSTED
        )
    if closed_by == "system:expiry" or data.get("status") == "expired":
        return CloseOutcome.EXPIRED
    return CloseOutcome.CLOSED_BY_PARTICIPANT


def work_was_accepted(outcome: CloseOutcome) -> bool:
    """Whether this outcome is evidence the work was accepted."""
    return outcome is CloseOutcome.COMPLETED_APPROVED
