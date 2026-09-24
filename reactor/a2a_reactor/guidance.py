"""What to tell a worker, event by event.

A worker woken with nothing but the raw event re-derives the protocol from
scratch, and gets the same things wrong every time: it accepts an invitation
and stops, so both sides wait on each other; it opens a follow-up to a contract
whose turns ran out without saying so, so the new contract has no task and no
history; it narrates on the last two turns instead of handing over.

These are the instructions a worker needs for the event in front of it. Put
them in the worker's prompt. The platform's own hints (`next_action`,
`successor_hint`) are quoted when an event carries them, because the platform
knows the specific contract and this module only knows the protocol.
"""

from __future__ import annotations

from .closure import SUCCESSION_OUTCOMES, CloseOutcome, read_close_outcome
from .turns import read_turn_budget

__all__ = ["worker_guidance", "successor_guidance", "FORMAT_RULE", "HUMAN_RULE"]


def successor_guidance(contract_id: str) -> str:
    """How to carry unfinished work on past the end of a contract."""
    return (
        "If the work continues, propose the follow-up linked to this contract: "
        f'holloway propose "<title>" --to <agent> --continues {contract_id} '
        "(it inherits the task). Never open a continuation without --continues."
    )


def _platform_hint(data: dict, *keys: str) -> list[str]:
    return [f"Platform says: {data[key]}" for key in keys if isinstance(data.get(key), str) and data[key].strip()]


def _invitation(contract_id: str, data: dict) -> list[str]:
    lines = [
        f"You were invited to contract {contract_id}"
        + (f" — \"{data['title']}\"" if data.get("title") else "")
        + (f" by {data['proposer']}" if data.get("proposer") else "")
        + ".",
        f"1. Read it first: holloway contract {contract_id} (description, linked task, related contracts).",
    ]
    task = data.get("linked_task") if isinstance(data.get("linked_task"), dict) else None
    if task:
        lines.append(
            f"   Linked task: {task.get('title') or task.get('task_id')} "
            f"(holloway task {task.get('project_id')} {task.get('task_id')})."
        )
    elif data.get("unlinked_reason"):
        lines.append(f"   Unlinked on purpose: {data['unlinked_reason']}")
    related = [r for r in (data.get("related_contracts") or []) if isinstance(r, dict)]
    for rel in related:
        lines.append(f"   {rel.get('link_type', 'related')}: {rel.get('title', '?')} ({rel.get('id')}).")
    likely = [p for p in (data.get("likely_predecessors") or []) if isinstance(p, dict)]
    for prior in likely:
        lines.append(
            f"   Possibly continues: {prior.get('title', '?')} ({prior.get('id')}, "
            f"{prior.get('status', '?')}, {prior.get('current_turns', '?')}/{prior.get('max_turns', '?')} turns)."
        )
    lines += [
        f"2. Decide: holloway accept {contract_id} or holloway reject {contract_id}.",
        "3. If you accept, YOU OPEN: send the first message in this same run "
        f'(holloway send {contract_id} --content "..."). Accepting and stopping leaves both sides waiting.',
    ]
    if not task:
        lines.append(
            "Also: it has no task. If you know which task it serves, link it: "
            f"holloway contract-link {contract_id} --project <project_id> --task <task_id>."
        )
    if likely and not related:
        lines.append(
            "Also: it looks like a continuation but is not related. If it picks up earlier work, relate it: "
            f"holloway contract-relate {contract_id} --to "
            f"{likely[0].get('id') if len(likely) == 1 else '<earlier_contract_id>'} --type continues."
        )
    if data.get("completion_requires_approval"):
        lines.append("Completion is gated: only the proposer's approve-completion accepts the work.")
    return lines + _platform_hint(data, "next_action")


def _accepted(contract_id: str, data: dict, self_agent_id: str | None) -> list[str]:
    opener = data.get("opens_next_agent_id")
    lines: list[str] = []
    if self_agent_id and opener == self_agent_id:
        lines.append(
            f"Contract {contract_id} is active and YOU OPEN. Read its messages first; "
            "if no substantive opening message exists, send one now "
            f'(holloway send {contract_id} --content "...").'
        )
    elif opener:
        lines.append(
            f"Contract {contract_id} is active. The named opener is "
            f"{data.get('opens_next') or opener}; verify your agent id before acting. "
            "If you are the opener, read messages and send only if no opening message exists."
        )
    elif opener is None:
        lines.append(
            f"Contract {contract_id} is active and no single opener was named; "
            "if you hold the context, read messages and send only if no opening message exists."
        )
    return lines + _platform_hint(data, "next_action")


def _message(contract_id: str, data: dict) -> list[str]:
    budget = read_turn_budget(data)
    lines: list[str] = []
    if budget.remaining == 0:
        lines.append(
            f"Contract {contract_id} has no turns left. The proposer approves "
            f"(holloway approve-completion {contract_id}) or, if the work is not accepted, closes it "
            f'(holloway close {contract_id} --without-approval --reason "...").'
        )
        lines.append(successor_guidance(contract_id))
    elif budget.is_low:
        lines.append(
            f"Only {budget.remaining} turn(s) left on {contract_id}: spend them on evidence, not status."
        )
        lines.append(successor_guidance(contract_id))
    for step in data.get("next_steps") or []:
        if isinstance(step, str) and step.strip():
            lines.append(f"Platform says: {step}")
    return lines


def _closed(contract_id: str, data: dict) -> list[str]:
    outcome = read_close_outcome(data)
    if outcome not in SUCCESSION_OUTCOMES:
        return []
    lines = []
    if outcome is CloseOutcome.CLOSED_UNAPPROVED:
        lines.append(f"The proposer closed {contract_id} without accepting the work.")
    elif outcome is CloseOutcome.TURNS_EXHAUSTED:
        lines.append(f"{contract_id} ran out of turns; that is not acceptance.")
    lines.append(successor_guidance(contract_id))
    return lines + _platform_hint(data, "successor_hint")


#: Appended wherever the worker may send a message. A fresh worker session does
#: not reliably read the skill, so the format has to travel with the event.
FORMAT_RULE = (
    "Write any substantive message as Markdown: a short `##` heading, "
    "**Status:** and **Next:** lines, bullets for evidence, and code spans for "
    "SHAs, paths and commands. Write it to a file and send it with "
    "`holloway send <id> --content @reply.md`. Plain text is for one-line "
    "receipts only; over 400 characters on one line the API refuses it "
    "(MESSAGE_UNSTRUCTURED)."
)

#: Contract 64345e47: both agents wrote "Next owner: Julien/Cal to authorize..."
#: as prose, three times. Nobody was asked, so nobody was notified, and each
#: such message woke the peer just to agree.
HUMAN_RULE = (
    "If the next move belongs to a person (authorization, scope, merge/deploy, "
    "a decision you cannot make), do not say so in prose: send with "
    '--needs-human "<the exact decision needed>" (or holloway ask <id> --kind blocked '
    '--body "..."). A message that only agrees with your peer that a person must '
    "decide wastes a turn: send nothing, or a receipt."
)


def worker_guidance(event: dict, *, self_agent_id: str | None = None) -> str:
    """Event-specific instructions for the worker, or "" when there are none."""
    payload = event.get("payload") or {}
    data = payload.get("data") or {}
    contract_id = payload.get("contract_id") or "<contract_id>"
    kind = event.get("event")

    if kind == "invitation":
        lines = _invitation(contract_id, data)
    elif kind == "contract.accepted":
        lines = _accepted(contract_id, data, self_agent_id)
    elif kind == "message":
        lines = _message(contract_id, data)
    elif kind in {"contract.closed", "contract.expired"}:
        lines = _closed(contract_id, data)
    else:
        lines = []
    if kind in {"invitation", "contract.accepted", "message"}:
        lines = [*lines, FORMAT_RULE, HUMAN_RULE]
    return "\n".join(lines)
