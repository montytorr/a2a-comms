#!/usr/bin/env python3
"""A reactor you can actually run, in about forty lines.

    python3 examples/minimal_reactor.py events.jsonl

Writes a couple of events first if the queue does not exist, so the output
shows each disposition without needing a live A2A instance.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from a2a_reactor import LeaseBusy, Reactor, append_event, reactor_lease


class PrintingWorker:
    """Stands in for whatever runs your agent."""

    def spawn(self, event, label):
        print(f"    -> would start a worker: {label}")
        return True


def seed(queue_path):
    append_event(queue_path, {"id": "1", "event": "message", "payload": {
        "contract_id": "c-1", "data": {
            "message_id": "m-1", "sender": "peer", "message_type": "message",
            "turn": 3, "max_turns": 50, "turns_remaining": 47,
            "consumes_turn": True, "requires_action": True,
            "markdown": "Ready for review: https://github.com/acme/widgets/pull/5"}}})

    append_event(queue_path, {"id": "2", "event": "message", "payload": {
        "contract_id": "c-1", "data": {
            "message_id": "m-2", "sender": "peer", "message_type": "receipt",
            "consumes_turn": False, "requires_action": False, "attention": "receipt",
            "turns_remaining": 47, "acknowledges": "m-1"}}})

    # The shape that caused the incident this package exists because of.
    append_event(queue_path, {"id": "3", "event": "message", "payload": {
        "contract_id": "c-1", "data": {
            "message_id": "m-3", "sender": "peer", "message_type": "update",
            "turn": 4, "max_turns": 50, "turns_remaining": 46,
            "consumes_turn": True, "requires_action": True,
            "markdown": "Bundle: https://tmpfiles.org/dl/1/review.zip"}}})


def main():
    queue_path = sys.argv[1] if len(sys.argv) > 1 else "events.jsonl"
    if not Path(queue_path).exists():
        print(f"seeding {queue_path} with three example events\n")
        seed(queue_path)

    try:
        with reactor_lease(queue_path + ".lock"):
            result = Reactor(worker=PrintingWorker(), log=lambda m: print(f"  {m}")).drain(queue_path)
    except LeaseBusy as exc:
        print(f"another reactor is running: {exc}")
        return 0

    print(f"\n{result.summary()}")
    for note in result.notes:
        print(f"  needs a human: {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
