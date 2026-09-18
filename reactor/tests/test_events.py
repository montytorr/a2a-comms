import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from a2a_reactor import Disposition, requires_action, semantic_key, triage_event


def message_event(event_id="e1", **data):
    base = {
        "message_id": "m-1", "sender": "peer", "message_type": "message",
        "turn": 3, "max_turns": 50, "turns_remaining": 47,
        "consumes_turn": True, "requires_action": True, "attention": "action-required",
    }
    base.update(data)
    return {"id": event_id, "event": "message", "payload": {"contract_id": "c-1", "data": base}}


def accepted_event(event_id="a1", **data):
    base = {"status": "active", "accepted_by": "beta", "opens_next": "beta", "opens_next_agent_id": "agent-beta"}
    base.update(data)
    return {"id": event_id, "event": "contract.accepted", "payload": {"contract_id": "c-1", "data": base}}


class ActivationOpenerTest(unittest.TestCase):
    """A contract activating is delivered to everyone; only one side opens."""

    def test_the_opener_acts(self):
        triage = triage_event(accepted_event(), self_agent_id="agent-beta")
        self.assertEqual(triage.disposition, Disposition.ACT)

    def test_the_other_side_records_instead_of_starting_a_worker(self):
        triage = triage_event(accepted_event(), self_agent_id="agent-alpha")
        self.assertEqual(triage.disposition, Disposition.RECORD)
        self.assertIn("beta", triage.reason)

    def test_not_knowing_who_we_are_keeps_the_old_behaviour(self):
        # An integrator who has not supplied an agent id must not silently
        # stop reacting to activations.
        self.assertEqual(triage_event(accepted_event()).disposition, Disposition.ACT)

    def test_an_activation_with_no_named_opener_still_acts(self):
        # More than one invitee accepted, so the platform names nobody.
        triage = triage_event(
            accepted_event(opens_next=None, opens_next_agent_id=None), self_agent_id="agent-alpha"
        )
        self.assertEqual(triage.disposition, Disposition.ACT)


class ActionabilityTest(unittest.TestCase):
    def test_a_substantive_message_is_work(self):
        self.assertTrue(requires_action(message_event()["payload"]["data"]))

    def test_receipts_and_approvals_are_never_work(self):
        for message_type in ("receipt", "approval"):
            with self.subTest(message_type=message_type):
                self.assertFalse(requires_action({"message_type": message_type}))

    def test_an_explicitly_informational_message_is_not_work(self):
        self.assertFalse(requires_action({"message_type": "update", "requires_action": False}))
        self.assertFalse(requires_action({"message_type": "update", "attention": "informational"}))

    def test_an_event_predating_the_metadata_is_assumed_actionable(self):
        # Staying asleep stalls a contract; waking needlessly costs one turn.
        self.assertTrue(requires_action({"sender": "peer"}))


class DeduplicationTest(unittest.TestCase):
    def test_the_same_message_under_two_deliveries_collapses(self):
        first = message_event("e1")
        second = message_event("e2")
        self.assertEqual(semantic_key(first), semantic_key(second))

    def test_legacy_events_fall_back_to_contract_sender_turn(self):
        event = message_event()
        del event["payload"]["data"]["message_id"]
        self.assertEqual(semantic_key(event), "message-legacy:c-1:peer:3")

    def test_a_batch_collapses_its_own_repeats(self):
        seen = set()
        first = triage_event(message_event("e1"), seen_keys=seen)
        second = triage_event(message_event("e2"), seen_keys=seen)
        self.assertEqual(first.disposition, Disposition.ACT)
        self.assertEqual(second.disposition, Disposition.DUPLICATE)


class StalenessTest(unittest.TestCase):
    def test_an_old_event_is_not_acted_on(self):
        now = datetime.now(timezone.utc)
        event = message_event()
        event["timestamp"] = (now - timedelta(hours=48)).isoformat()
        self.assertEqual(triage_event(event, now=now).disposition, Disposition.STALE)

    def test_an_undateable_event_is_treated_as_fresh(self):
        # Dropping work we cannot date would lose it silently.
        event = message_event()
        event["timestamp"] = "not-a-date"
        self.assertEqual(triage_event(event).disposition, Disposition.ACT)


class TriageTest(unittest.TestCase):
    def test_a_receipt_is_recorded_without_waking_a_worker(self):
        triage = triage_event(
            message_event(message_type="receipt", consumes_turn=False,
                          requires_action=False, attention="receipt")
        )
        self.assertEqual(triage.disposition, Disposition.RECORD)
        self.assertFalse(triage.should_wake_worker)

    def test_an_artifact_outside_approved_channels_escalates(self):
        from a2a_reactor import ArtifactPolicy

        triage = triage_event(
            message_event(markdown="Bundle: https://tmpfiles.org/dl/1/x.zip"),
            artifact_policy=ArtifactPolicy(),
        )
        self.assertEqual(triage.disposition, Disposition.ESCALATE)
        self.assertFalse(triage.should_wake_worker)

    def test_a_pull_request_handoff_still_wakes_a_worker(self):
        from a2a_reactor import ArtifactPolicy

        triage = triage_event(
            message_event(markdown="Review https://github.com/acme/w/pull/5"),
            artifact_policy=ArtifactPolicy(),
        )
        self.assertEqual(triage.disposition, Disposition.ACT)


if __name__ == "__main__":
    unittest.main()


class StaleRunTest(unittest.TestCase):
    """A run that went silent is news, not work."""

    def _event(self, **over):
        data = {
            "run_id": "r-1", "task_id": "t-1", "project_id": "p-1",
            "previous_status": "running", "status": "cancelled",
            "silent_minutes": 42, "task_released": True, "work_failed": False,
        }
        data.update(over)
        return {"id": "e1", "event": "task.run_stale",
                "payload": {"contract_id": "t-1", "data": data}}

    def test_a_stale_run_is_recorded_not_acted_on(self):
        mod_triage = triage_event(self._event())
        self.assertEqual(mod_triage.disposition, Disposition.RECORD)
        self.assertFalse(mod_triage.should_wake_worker)

    def test_the_reason_names_the_run_and_how_long_it_was_silent(self):
        reason = triage_event(self._event()).reason
        self.assertIn("r-1", reason)
        self.assertIn("42", reason)
        self.assertIn("released", reason)

    def test_it_does_not_claim_the_work_failed(self):
        # Silence proves the run stopped reporting, not that the work failed.
        self.assertFalse(self._event()["payload"]["data"]["work_failed"])
        self.assertNotIn("failed", triage_event(self._event()).reason)
