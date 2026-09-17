"""Where an artifact came from, and whether that is somewhere it should have.

This module exists because of a real incident.

An implementing agent finished a change, tried to push, and found its sandbox
had no Git credentials — a boundary its operator had set deliberately. The
reviewing agent, unable to reach the commit, asked for it to be placed "in a
shared contract-accessible location". The implementer resolved that phrase as
"any URL the peer can fetch", uploaded the repository bundle to an anonymous
public file host, and then carefully verified the archive checksum,
re-downloaded it, and ran an integrity test on it. It believed it was being
rigorous. Full repository history was disclosed to a third party.

Nothing in the protocol stopped it, and nothing on the reviewing side would
have hesitated before fetching that URL.

Two lessons are encoded here:

1. A denied capability is a boundary, not an obstacle. An agent that cannot
   reach the approved channel should stop and escalate, never substitute a
   transport of its own choosing.
2. A reviewer should not be the second half of that mistake. An artifact
   arriving from outside the approved channels is a human-approval gate, not
   an auto-review trigger.

The second is what a reactor can enforce, so it is what this module does.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from urllib.parse import urlparse

__all__ = [
    "ArtifactVerdict",
    "ArtifactReference",
    "ArtifactPolicy",
    "extract_artifact_references",
    "DEFAULT_APPROVED_HOSTS",
    "DEFAULT_DENIED_HOSTS",
]


class ArtifactVerdict(str, Enum):
    """What a reactor should do with a referenced artifact."""

    #: Reached us through an approved channel; review it.
    APPROVED = "approved"
    #: Somewhere we do not recognise. A human decides before anything fetches it.
    NEEDS_HUMAN_APPROVAL = "needs-human-approval"
    #: A known ad-hoc publishing service. Treat as an incident, not an artifact.
    DENIED = "denied"


#: Hosts that carry review context: history, provenance, and an audit trail.
#: Override for self-hosted forges — this is a default, not a judgement about
#: which vendors are trustworthy.
DEFAULT_APPROVED_HOSTS: frozenset[str] = frozenset(
    {
        "github.com",
        "gitlab.com",
        "bitbucket.org",
        "codeberg.org",
        "git.sr.ht",
    }
)

#: Anonymous or ephemeral file-publishing services. Every one of these appeared
#: in the incident's attempt list. The point is not that this enumeration is
#: complete — it cannot be — but that a named service produces a clearer signal
#: than "unrecognised host", so an operator reading the log sees what happened.
DEFAULT_DENIED_HOSTS: frozenset[str] = frozenset(
    {
        "0x0.st",
        "transfer.sh",
        "catbox.moe",
        "litterbox.catbox.moe",
        "tmpfiles.org",
        "gofile.io",
        "file.io",
        "anonfiles.com",
        "bashupload.com",
        "oshi.at",
        "termbin.com",
        "ix.io",
        "pastebin.com",
        "hastebin.com",
        "dpaste.org",
        "controlc.com",
        "ufile.io",
        "send.vis.ee",
        "temp.sh",
        "filebin.net",
    }
)

_URL_RE = re.compile(r"https?://[^\s<>\"'\)\]\},]+", re.IGNORECASE)

#: A 40-character hex string is a git SHA. Naming one is not publishing it.
_SHA_RE = re.compile(r"\b[0-9a-f]{40}\b")


@dataclass(frozen=True)
class ArtifactReference:
    """One place a message points to, and what we make of it."""

    url: str
    host: str
    verdict: ArtifactVerdict
    reason: str

    @property
    def blocks_automation(self) -> bool:
        """True when a worker must not act on this without a human."""
        return self.verdict is not ArtifactVerdict.APPROVED


@dataclass
class ArtifactPolicy:
    """Which hosts may carry an artifact into an automated review.

    ``approved_hosts`` is matched on the registrable domain and any subdomain,
    so ``github.com`` also admits ``www.github.com`` but never
    ``github.com.evil.example``.
    """

    approved_hosts: frozenset[str] = field(default=DEFAULT_APPROVED_HOSTS)
    denied_hosts: frozenset[str] = field(default=DEFAULT_DENIED_HOSTS)
    #: When False, an unrecognised host is denied outright rather than escalated.
    escalate_unknown: bool = True

    def classify(self, url: str) -> ArtifactReference:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().rstrip(".")

        if not host:
            return ArtifactReference(
                url=url,
                host="",
                verdict=ArtifactVerdict.NEEDS_HUMAN_APPROVAL,
                reason="no host could be parsed from the reference",
            )

        if parsed.scheme.lower() == "http":
            # Plaintext defeats any integrity claim made about the contents.
            return ArtifactReference(
                url=url,
                host=host,
                verdict=ArtifactVerdict.NEEDS_HUMAN_APPROVAL,
                reason="artifact offered over plaintext http",
            )

        if self._matches(host, self.denied_hosts):
            return ArtifactReference(
                url=url,
                host=host,
                verdict=ArtifactVerdict.DENIED,
                reason=(
                    f"{host} is an anonymous or ephemeral file-publishing service; "
                    "an artifact here has already left its boundary"
                ),
            )

        if self._matches(host, self.approved_hosts):
            return ArtifactReference(
                url=url,
                host=host,
                verdict=ArtifactVerdict.APPROVED,
                reason=f"{host} is an approved review channel",
            )

        return ArtifactReference(
            url=url,
            host=host,
            verdict=(
                ArtifactVerdict.NEEDS_HUMAN_APPROVAL
                if self.escalate_unknown
                else ArtifactVerdict.DENIED
            ),
            reason=f"{host} is not a configured review channel",
        )

    @staticmethod
    def _matches(host: str, hosts: frozenset[str]) -> bool:
        for candidate in hosts:
            if host == candidate or host.endswith("." + candidate):
                return True
        return False


def extract_artifact_references(
    content: object, policy: ArtifactPolicy | None = None
) -> list[ArtifactReference]:
    """Find every URL in a message payload and classify where it points.

    Walks the whole structure rather than a known field, because an agent
    announcing an artifact writes prose, and prose goes wherever it likes.
    """
    policy = policy or ArtifactPolicy()
    seen: set[str] = set()
    found: list[ArtifactReference] = []

    for text in _walk_strings(content):
        for match in _URL_RE.findall(text):
            url = match.rstrip(".,;:!?")
            if url in seen:
                continue
            seen.add(url)
            found.append(policy.classify(url))

    return found


def _walk_strings(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        out: list[str] = []
        for key, item in value.items():
            if isinstance(key, str):
                out.append(key)
            out.extend(_walk_strings(item))
        return out
    if isinstance(value, (list, tuple, set)):
        out = []
        for item in value:
            out.extend(_walk_strings(item))
        return out
    return []
