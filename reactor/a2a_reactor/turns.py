"""Turn budget, made visible before it runs out.

A contract has a fixed number of turns. Spending one on "received" costs the
same as spending it on a decision, and nothing warns you until the budget is
gone — at which point the contract closes whether or not the work is finished.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ["TurnBudget", "read_turn_budget", "LOW_BUDGET_THRESHOLD"]

#: Below this, a turn spent on narration is a turn the contract cannot spend
#: on work.
LOW_BUDGET_THRESHOLD = 3


@dataclass(frozen=True)
class TurnBudget:
    """What a message cost and what is left."""

    consumed_turn: bool
    turn: int | None
    max_turns: int | None
    remaining: int | None
    awaiting_completion_approval: bool

    @property
    def is_low(self) -> bool:
        return self.remaining is not None and self.remaining <= LOW_BUDGET_THRESHOLD

    def describe(self) -> str:
        parts = [
            f"cost={'turn' if self.consumed_turn else 'non-turn'}",
            f"turn={self.turn if self.turn is not None else '?'}"
            f"/{self.max_turns if self.max_turns is not None else '?'}",
        ]
        if self.remaining is not None:
            parts.append(f"remaining={self.remaining}")
            if self.is_low:
                parts.append(
                    "LOW_BUDGET=spend what is left on evidence, not status; if the work "
                    "will not fit, propose the follow-up with --continues <this contract> "
                    "so it inherits the task"
                )
        if self.awaiting_completion_approval:
            parts.append("awaiting_completion_approval=true")
        return " ".join(parts)


def read_turn_budget(data: dict) -> TurnBudget:
    """Read the budget off a message event, tolerating older payloads."""

    def _int(key: str) -> int | None:
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, str)):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    # Absent metadata means an older event, and every message used to cost a
    # turn — so assume it did rather than under-reporting the spend.
    consumed = data.get("consumes_turn")
    return TurnBudget(
        consumed_turn=True if consumed is None else bool(consumed),
        turn=_int("turn"),
        max_turns=_int("max_turns"),
        remaining=_int("turns_remaining"),
        awaiting_completion_approval=bool(data.get("awaiting_completion_approval")),
    )
