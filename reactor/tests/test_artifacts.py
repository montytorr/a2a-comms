import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from a2a_reactor import ArtifactPolicy, ArtifactVerdict, extract_artifact_references


class ArtifactProvenanceTest(unittest.TestCase):
    """The control that would have contained the incident in artifacts.py."""

    def test_the_incident_message_is_refused(self):
        # Verbatim shape of the turn that disclosed a repository bundle.
        content = {
            "markdown": (
                "## Shared review artifact available\n\n"
                "- **Download:** https://tmpfiles.org/dl/000000000.example/EXAMPLE/review.zip\n"
                "- **Archive SHA-256:** `" + "0" * 40 + "`\n"
                "- **Exact commit:** `" + "a" * 40 + "`\n"
            )
        }
        refs = extract_artifact_references(content)
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0].verdict, ArtifactVerdict.DENIED)
        self.assertTrue(refs[0].blocks_automation)
        self.assertIn("already left its boundary", refs[0].reason)

    def test_a_pull_request_is_the_approved_shape(self):
        content = {"text": "Ready for review: https://github.com/acme/widgets/pull/5 at abc1234"}
        refs = extract_artifact_references(content)
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0].verdict, ArtifactVerdict.APPROVED)
        self.assertFalse(refs[0].blocks_automation)

    def test_every_service_from_the_incident_is_refused(self):
        for host in [
            "0x0.st", "transfer.sh", "catbox.moe", "litterbox.catbox.moe",
            "tmpfiles.org", "gofile.io", "file.io",
        ]:
            with self.subTest(host=host):
                refs = extract_artifact_references({"t": f"https://{host}/x/bundle.zip"})
                self.assertEqual(refs[0].verdict, ArtifactVerdict.DENIED, host)

    def test_an_unrecognised_host_asks_a_human_rather_than_guessing(self):
        refs = extract_artifact_references({"t": "https://files.internal.example/b.zip"})
        self.assertEqual(refs[0].verdict, ArtifactVerdict.NEEDS_HUMAN_APPROVAL)

    def test_a_self_hosted_forge_can_be_approved_by_configuration(self):
        policy = ArtifactPolicy(approved_hosts=frozenset({"git.internal.example"}))
        refs = extract_artifact_references(
            {"t": "https://git.internal.example/acme/w/-/merge_requests/3"}, policy
        )
        self.assertEqual(refs[0].verdict, ArtifactVerdict.APPROVED)

    def test_a_lookalike_domain_does_not_inherit_approval(self):
        refs = extract_artifact_references({"t": "https://github.com.evil.example/acme/w/pull/5"})
        self.assertNotEqual(refs[0].verdict, ArtifactVerdict.APPROVED)

    def test_a_subdomain_of_an_approved_host_is_approved(self):
        refs = extract_artifact_references({"t": "https://www.github.com/acme/w/pull/5"})
        self.assertEqual(refs[0].verdict, ArtifactVerdict.APPROVED)

    def test_plaintext_defeats_any_integrity_claim(self):
        refs = extract_artifact_references({"t": "http://github.com/acme/w/pull/5"})
        self.assertEqual(refs[0].verdict, ArtifactVerdict.NEEDS_HUMAN_APPROVAL)
        self.assertIn("plaintext", refs[0].reason)

    def test_a_bare_commit_sha_is_not_a_published_artifact(self):
        refs = extract_artifact_references(
            {"t": "Committed " + "a" * 40 + " locally; push is blocked."}
        )
        self.assertEqual(refs, [])

    def test_urls_are_found_wherever_prose_puts_them(self):
        refs = extract_artifact_references(
            {"a": {"b": [{"c": "see https://tmpfiles.org/dl/1/x.zip"}]}, "d": "and https://github.com/a/b/pull/1"}
        )
        self.assertEqual({r.verdict for r in refs}, {ArtifactVerdict.DENIED, ArtifactVerdict.APPROVED})

    def test_trailing_punctuation_is_not_part_of_the_url(self):
        refs = extract_artifact_references({"t": "Bundle at https://tmpfiles.org/dl/1/x.zip."})
        self.assertTrue(refs[0].url.endswith(".zip"))

    def test_strict_mode_refuses_instead_of_escalating(self):
        policy = ArtifactPolicy(escalate_unknown=False)
        refs = extract_artifact_references({"t": "https://unknown.example/x.zip"}, policy)
        self.assertEqual(refs[0].verdict, ArtifactVerdict.DENIED)


if __name__ == "__main__":
    unittest.main()
