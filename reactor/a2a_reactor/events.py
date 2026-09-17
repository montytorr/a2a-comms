"""Deciding whether an inbound event is work, a record, or noise.

A reactor that wakes an agent for every delivery burns the contract's turn
budget on acknowledgements, and a reactor that deduplicates on the delivery
attempt wakes it again for every retry of the same message. Both are cheap to
get wrong and expensive to run.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

__all__ = [
    "Disposition",
    "Triage",
    "NON_TURN_MESSAGE_TYPES",
    "consumes_turn",
    "requires_action",
    "semantic_key",
    "is_stale",
    "triage_event",
]


class Disposition(str, Enum):
    """What the reactor should do with an event."""

    #: Wake a worker. Something is owed.
    ACT = "act"
    #: Record it and move on. Nothing is owed.
    RECORD = "record"
    #: Already seen, under a different delivery. Drop it.
    DUPLICATE = "duplicate"
    #: Too old to act on safely.
    STALE = "stale"
    #: Needs a person before anything automated touches it.
    ESCALATE = "escalate"


#: Bookkeeping about a conversation rather than a move within it. These never
#: consume a contract turn and never require a reply.
NON_TURN_MESSAGE_TYPES: frozenset[str] = frozenset({"receipt", "approval"})


def consumes_turn(message_type: str | None) -> bool:
    return (message_type or "message") not in NON_TURN_MESSAGE_TYPES


def requires_action(data: dict) -> bool:
    """Whether this message owes the recipient a reply.

    Explicit protocol metadata wins. Events predating that metadata are treated
    as actionable, because the cost of waking unnecessarily is a wasted turn
    while the cost of staying asleep is a contract that stalls.
    """
    if not consumes_turn(data.get("message_type")):
        return False
    if data.get("requires_action") is False:
        return False
    if data.get("attention") in {"receipt", "informational"}:
        return False
    return True


def semantic_key(event: dict) -> str | None:
    """Identity of the logical message, independent of delivery attempt.

    Webhooks retry, and a single message can arrive under several delivery ids.
    Keying on the delivery makes each one look like new work.
    """
    payload = event.get("payload") or {}
    data = payload.get("data") or {}
    contract_id = payload.get("contract_id")
    if event.get("event") != "message" or not contract_id:
        return None

    message_id = data.get("message_id")
    if message_id:
        return f"message:{contract_id}:{message_id}"

    # Older deliveries carry no message id. Within one contract a turn belongs
    # to exactly one sender, which is enough to collapse repeats.
    turn = data.get("turn")
    sender = data.get("sender")
    if turn is not None and sender:
        return f"message-legacy:{contract_id}:{sender}:{turn}"
    return None


def is_stale(event: dict, *, max_age_hours: float = 24.0, now: datetime | None = None) -> bool:
    """Whether an event is too old to act on.

    An unparseable or absent timestamp is treated as fresh: refusing to act on
    an event we cannot date would silently drop real work.
    """
    raw = event.get("timestamp") or (event.get("payload") or {}).get("timestamp")
    if not isinstance(raw, str):
        return False
    try:
        stamped = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return False
    if stamped.tzinfo is None:
        stamped = stamped.replace(tzinfo=timezone.utc)
    reference = now or datetime.now(timezone.utc)
    return (reference - stamped).total_seconds() > max_age_hours * 3600


@dataclass(frozen=True)
class Triage:
    """The reactor's decision about one event, and why."""

    disposition: Disposition
    reason: str
    semantic_key: str | None = None

    @property
    def should_wake_worker(self) -> bool:
        return self.disposition is Disposition.ACT


def triage_event(
    event: dict,
    *,
    seen_keys: set[str] | None = None,
    max_age_hours: float = 24.0,
    now: datetime | None = None,
    artifact_policy: object | None = None,
) -> Triage:
    """Classify one event.

    ``seen_keys`` is the set of semantic keys already handled in this pass; it
    is mutated as events are accepted so a batch collapses its own repeats.
    """
    key = semantic_key(event)

    if seen_keys is not None and key and key in seen_keys:
        return Triage(Disposition.DUPLICATE, "same logical message already handled", key)

    if is_stale(event, max_age_hours=max_age_hours, now=now):
        return Triage(Disposition.STALE, f"older than {max_age_hours}h", key)

    payload = event.get("payload") or {}
    data = payload.get("data") or {}

    # An artifact from somewhere unapproved must reach a person before any
    # worker fetches it. See artifacts.py for why this is not hypothetical.
    if artifact_policy is not None:
        from .artifacts import extract_artifact_references

        blocking = [
            ref
            for ref in extract_artifact_references(data, artifact_policy)  # type: ignore[arg-type]
            if ref.blocks_automation
        ]
        if blocking:
            worst = blocking[0]
            if seen_keys is not None and key:
                seen_keys.add(key)
            return Triage(
                Disposition.ESCALATE,
                f"artifact outside approved channels: {worst.reason}",
                key,
            )

    if event.get("event") == "message" and not requires_action(data):
        if seen_keys is not None and key:
            seen_keys.add(key)
        return Triage(
            Disposition.RECORD,
            f"{data.get('message_type', 'message')} is explicitly non-actionable",
            key,
        )

    if seen_keys is not None and key:
        seen_keys.add(key)
    return Triage(Disposition.ACT, "actionable event", key)
