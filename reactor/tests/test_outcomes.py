import unittest

from a2a_reactor import LEGACY_MARKERS, MARKERS, WorkerOutcome, classify_worker_output
from a2a_reactor.adapters import NullTaskTracker, StderrAlertSink
from a2a_reactor.reactor import Reactor, ReactorResult


class ClassifyWorkerOutput(unittest.TestCase):
    def test_a_marker_on_its_own_line_is_a_decision(self):
        self.assertIs(classify_worker_output("did the thing\nHOLLOWAY_ACTION_CONFIRMED\n"), WorkerOutcome.ACTED)
        self.assertIs(classify_worker_output("  HOLLOWAY_NO_ACTION_REQUIRED  "), WorkerOutcome.NO_ACTION)
        self.assertIs(classify_worker_output("asked\nHOLLOWAY_NEEDS_HUMAN"), WorkerOutcome.NEEDS_HUMAN)

    def test_the_pre_rename_a2a_spelling_is_still_a_decision(self):
        # Workers on prompts written before the rename still print A2A_*.
        self.assertIs(classify_worker_output("did the thing\nA2A_ACTION_CONFIRMED\n"), WorkerOutcome.ACTED)
        self.assertIs(classify_worker_output("  A2A_NO_ACTION_REQUIRED  "), WorkerOutcome.NO_ACTION)
        self.assertIs(classify_worker_output("asked\nA2A_NEEDS_HUMAN"), WorkerOutcome.NEEDS_HUMAN)

    def test_either_spelling_obeys_the_same_order_of_consequence(self):
        self.assertIs(
            classify_worker_output("A2A_NEEDS_HUMAN\nHOLLOWAY_ACTION_CONFIRMED"), WorkerOutcome.ACTED
        )
        self.assertIs(
            classify_worker_output("HOLLOWAY_NEEDS_HUMAN\nA2A_ACTION_CONFIRMED"), WorkerOutcome.ACTED
        )

    def test_a_marker_quoted_mid_sentence_decides_nothing(self):
        # The prompt has to name every marker in order to ask for one, so a
        # worker echoing its instructions must not be read as having decided.
        self.assertIs(
            classify_worker_output("I was told to print HOLLOWAY_ACTION_CONFIRMED when done."),
            WorkerOutcome.FAILED,
        )
        self.assertIs(
            classify_worker_output("I was told to print A2A_ACTION_CONFIRMED when done."),
            WorkerOutcome.FAILED,
        )

    def test_a_crash_overrides_anything_it_printed(self):
        # Claiming to have acted and then exiting non-zero demonstrates nothing.
        self.assertIs(classify_worker_output("HOLLOWAY_ACTION_CONFIRMED", returncode=1), WorkerOutcome.FAILED)
        self.assertIs(classify_worker_output("A2A_ACTION_CONFIRMED", returncode=1), WorkerOutcome.FAILED)

    def test_exiting_cleanly_with_no_decision_is_a_failure(self):
        self.assertIs(classify_worker_output("I had a look around.\n"), WorkerOutcome.FAILED)
        self.assertIs(classify_worker_output(""), WorkerOutcome.FAILED)

    def test_needs_human_is_handled_and_failure_is_not(self):
        self.assertTrue(WorkerOutcome.NEEDS_HUMAN.handled)
        self.assertTrue(WorkerOutcome.ACTED.handled)
        self.assertTrue(WorkerOutcome.NO_ACTION.handled)
        self.assertFalse(WorkerOutcome.FAILED.handled)

    def test_a_bool_still_means_acted_or_failed(self):
        self.assertIs(WorkerOutcome.from_bool(True), WorkerOutcome.ACTED)
        self.assertIs(WorkerOutcome.from_bool(False), WorkerOutcome.FAILED)

    def test_every_decidable_outcome_has_a_marker(self):
        for outcome in WorkerOutcome:
            if outcome is WorkerOutcome.FAILED:
                continue
            self.assertIn(outcome, MARKERS)
            self.assertTrue(MARKERS[outcome].startswith("HOLLOWAY_"))
            self.assertIn(outcome, LEGACY_MARKERS)
            self.assertEqual(LEGACY_MARKERS[outcome], "A2A_" + MARKERS[outcome][len("HOLLOWAY_"):])


class _Worker:
    def __init__(self, outcome):
        self.outcome = outcome
        self.spawns = 0

    def spawn(self, event, label):
        self.spawns += 1
        return self.outcome


class _Alerts:
    def __init__(self):
        self.messages = []

    def alert(self, message):
        self.messages.append(message)


def _event():
    return {
        "id": "evt-1",
        "event": "message",
        "payload": {"contract_id": "c-1", "data": {"requires_action": True, "message_type": "request"}},
    }


class ReactorHonoursOutcomes(unittest.TestCase):
    def _apply(self, outcome):
        alerts = _Alerts()
        worker = _Worker(outcome)
        reactor = Reactor(worker=worker, tracker=NullTaskTracker(), alerts=alerts)
        result = ReactorResult()
        from a2a_reactor.events import triage_event

        event = _event()
        handled = reactor._apply(event, triage_event(event), result, dry_run=False)
        return handled, result, alerts

    def test_a_worker_waiting_on_a_person_is_not_retried_and_alerts(self):
        handled, result, alerts = self._apply(WorkerOutcome.NEEDS_HUMAN)
        self.assertTrue(handled, "retrying would ask the same question again")
        self.assertEqual(result.awaiting_human, 1)
        self.assertEqual(result.acted, 0)
        self.assertEqual(result.failed, 0)
        self.assertTrue(alerts.messages, "a person has to be told they are the next step")
        self.assertIn("c-1", alerts.messages[0])

    def test_a_failure_is_retried_and_does_not_alert_here(self):
        handled, result, alerts = self._apply(WorkerOutcome.FAILED)
        self.assertFalse(handled)
        self.assertEqual(result.failed, 1)
        self.assertEqual(alerts.messages, [])

    def test_a_bool_returning_runtime_still_works(self):
        handled, result, _ = self._apply(True)
        self.assertTrue(handled)
        self.assertEqual(result.acted, 1)

    def test_awaiting_human_counts_as_processed_and_shows_in_the_summary(self):
        _, result, _ = self._apply(WorkerOutcome.NEEDS_HUMAN)
        self.assertEqual(result.processed, 1)
        self.assertIn("awaiting_human=1", result.summary())


if __name__ == "__main__":
    unittest.main()
