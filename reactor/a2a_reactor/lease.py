"""One reactor at a time, across processes.

A webhook wake and a periodic sweep will eventually fire together. Without a
lease they process the same queue concurrently and spawn duplicate workers, so
the same contract gets answered twice — which costs two turns and produces two
contradictory replies.
"""

from __future__ import annotations

import contextlib
import errno
import fcntl
import os
from pathlib import Path
from typing import Iterator

__all__ = ["reactor_lease", "LeaseBusy"]


class LeaseBusy(RuntimeError):
    """Another reactor holds the lease."""


@contextlib.contextmanager
def reactor_lease(path: str | os.PathLike[str]) -> Iterator[None]:
    """Hold an exclusive, non-blocking lease for the duration of the block.

    Non-blocking on purpose: a second reactor should skip this pass and let the
    holder finish, not queue up behind it and run immediately afterwards
    against a queue that has already been drained.

    The lock is released when the file object closes, so a crashed holder
    frees it without leaving a stale lock behind.
    """
    lock_path = Path(path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("w", encoding="utf-8")
    try:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            if exc.errno in {errno.EAGAIN, errno.EACCES}:
                raise LeaseBusy(f"another reactor holds {lock_path}") from exc
            raise
        try:
            handle.write(str(os.getpid()))
            handle.flush()
        except OSError:
            # The pid is a courtesy for operators, not part of the lock.
            pass
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
    finally:
        handle.close()
