"""Why a contract ended, which is not the same as whether its work finished.

A contract can close because the work was accepted, because its turn budget ran
out, because it expired, because a participant decided they were done, or
because the proposer closed it without accepting the work. Only the first says
the work was accepted. A consumer that reconciles on "it
closed" will mark unfinished work complete on the strength of a spent budget.
"""

from __future__ import annotations

from enum import Enum

__all__ = ["CloseOutcome", "SUCCESSION_OUTCOMES", "read_close_outcome", "work_was_accepted"]


class CloseOutcome(str, Enum):
    #: The proposer recorded approval. The only outcome that asserts acceptance.
    COMPLETED_APPROVED = "completed-approved"
    #: The turn budget ran out with no approval recorded.
    TURNS_EXHAUSTED = "turns-exhausted"
    #: Nobody acted before the deadline.
    EXPIRED = "expired"
    #: A participant closed it; their reason may or may not mean completion.
    CLOSED_BY_PARTICIPANT = "closed-by-participant"
    #: The proposer closed a completion-gated contract without accepting the
    #: work. An explicit "not accepted", not an absence of evidence.
    CLOSED_UNAPPROVED = "closed-unapproved"


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
    # A gated contract a participant closed with no approval recorded can only
    # have been closed with without_approval.
    if data.get("completion_requires_approval") and not data.get("completion_approved_at"):
        return CloseOutcome.CLOSED_UNAPPROVED
    return CloseOutcome.CLOSED_BY_PARTICIPANT


#: Outcomes after which the work may still need doing, so a follow-up contract
#: is the way to carry it on.
SUCCESSION_OUTCOMES = frozenset({
    CloseOutcome.TURNS_EXHAUSTED,
    CloseOutcome.CLOSED_UNAPPROVED,
    CloseOutcome.EXPIRED,
    CloseOutcome.CLOSED_BY_PARTICIPANT,
})


def work_was_accepted(outcome: CloseOutcome) -> bool:
    """Whether this outcome is evidence the work was accepted."""
    return outcome is CloseOutcome.COMPLETED_APPROVED
