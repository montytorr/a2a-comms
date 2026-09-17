"""A durable event queue, deliberately boring.

The webhook receiver's only job is to get the event onto disk before any agent
logic runs. If the reactor crashes, the event is still here. JSON Lines because
an operator should be able to read the queue with ``cat``, and a corrupt line
should cost one event rather than the file.
"""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from pathlib import Path

__all__ = ["read_queue", "write_queue", "append_event"]


def read_queue(path: str | os.PathLike[str]) -> list[dict]:
    """Read every well-formed event. Malformed lines are skipped, not fatal."""
    queue_path = Path(path)
    if not queue_path.exists():
        return []

    events: list[dict] = []
    with queue_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # One bad write must not strand every event behind it.
                continue
            if isinstance(event, dict):
                events.append(event)
    return events


def write_queue(path: str | os.PathLike[str], events: list[dict]) -> None:
    """Replace the queue atomically.

    Written to a temporary file in the same directory and renamed, so a reader
    sees either the old queue or the new one and never a half-written file.
    """
    queue_path = Path(path)
    queue_path.parent.mkdir(parents=True, exist_ok=True)

    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=queue_path.parent, prefix=queue_path.name, suffix=".tmp", delete=False
    )
    try:
        with handle:
            for event in events:
                handle.write(json.dumps(event, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, queue_path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(handle.name)
        raise


def append_event(path: str | os.PathLike[str], event: dict) -> None:
    """Append one event. Safe to call from a webhook receiver."""
    queue_path = Path(path)
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    with queue_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
