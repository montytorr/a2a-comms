"""How a worker run ended, and how to tell from what it printed.

`WorkerRuntime.spawn` returns a bool, which collapses three different endings
into one word. In the reactor this package was extracted from, that collapse
cost a day of retries every time it happened: a worker that stopped and said it
was blocked printed neither sanctioned marker, was read as a failure, and was
respawned every fifteen minutes for twenty-four hours. Being stuck was
indistinguishable from crashing, and the explanation survived only as truncated
log text.

So there are four endings, not two:

  ACTED           the worker did the thing and said so
  NO_ACTION       the worker triaged it and there was nothing to do
  NEEDS_HUMAN     the worker stopped and asked a person. NOT a failure: the
                  event is done being retried, and a person now owes an answer
  FAILED          it crashed, timed out, or finished without deciding anything

A runtime that still returns a bool keeps working - `from_bool` maps it - but a
runtime that can tell the difference should.
"""

from __future__ import annotations

from enum import Enum

__all__ = ["WorkerOutcome", "MARKERS", "LEGACY_MARKERS", "classify_worker_output"]


class WorkerOutcome(Enum):
    ACTED = "acted"
    NO_ACTION = "no-action"
    NEEDS_HUMAN = "needs-human"
    FAILED = "failed"

    @property
    def handled(self) -> bool:
        """Is the event finished with, whatever the worker concluded?

        NEEDS_HUMAN is handled. Retrying it would spawn a second worker to ask
        the same question, and nothing about the reason it stopped has changed.
        """
        return self is not WorkerOutcome.FAILED

    @classmethod
    def from_bool(cls, ok: bool) -> "WorkerOutcome":
        return cls.ACTED if ok else cls.FAILED


# What a worker's prompt should ask it to print.
MARKERS = {
    WorkerOutcome.ACTED: "HOLLOWAY_ACTION_CONFIRMED",
    WorkerOutcome.NO_ACTION: "HOLLOWAY_NO_ACTION_REQUIRED",
    WorkerOutcome.NEEDS_HUMAN: "HOLLOWAY_NEEDS_HUMAN",
}

# The spellings from before the rename to Holloway. Still accepted, so a worker
# running on an old prompt - or a model that remembers the old word - is not
# read as having decided nothing and retried for a day.
LEGACY_MARKERS = {
    WorkerOutcome.ACTED: "A2A_ACTION_CONFIRMED",
    WorkerOutcome.NO_ACTION: "A2A_NO_ACTION_REQUIRED",
    WorkerOutcome.NEEDS_HUMAN: "A2A_NEEDS_HUMAN",
}


def classify_worker_output(output: str, returncode: int = 0) -> WorkerOutcome:
    """Read a worker's decision out of what it printed.

    A marker counts only ON ITS OWN LINE. A substring test is not safe: the
    worker's own prompt has to name every marker in order to ask for one, so a
    worker that echoes its instructions - or quotes them while explaining what
    it is about to do - would be read as having decided. That was survivable
    while both markers meant "done". It is not once one of them means "stop
    retrying, a person has been alerted".

    A non-zero exit is a failure whatever was printed: a worker that claims it
    acted and then crashes has not demonstrated anything.
    """
    if returncode != 0:
        return WorkerOutcome.FAILED

    lines = {line.strip() for line in output.splitlines()}
    # Checked in order of consequence. A worker that both acted and then hit
    # something it cannot resolve has still acted, and the question it raised
    # is recorded on the contract either way.
    for outcome in (WorkerOutcome.ACTED, WorkerOutcome.NO_ACTION, WorkerOutcome.NEEDS_HUMAN):
        if MARKERS[outcome] in lines or LEGACY_MARKERS[outcome] in lines:
            return outcome

    # Exited cleanly having decided nothing. This is the case the bool hid: it
    # is not success, and it is not a crash either.
    return WorkerOutcome.FAILED
