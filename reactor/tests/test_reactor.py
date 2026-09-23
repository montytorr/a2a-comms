import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from a2a_reactor import (
    CloseOutcome,
    LeaseBusy,
    NullWorkerRuntime,
    Reactor,
    read_close_outcome,
    read_turn_budget,
    reactor_lease,
    work_was_accepted,
    worker_guidance,
)


class RecordingTracker:
    def __init__(self, refs=None):
        self.refs = refs or []
        self.annotated = []
        self.closed = []

    def find_open_for_contract(self, contract_id):
        return list(self.refs)

    def annotate(self, ref, note):
        self.annotated.append((ref, note))
        return True

    def close(self, ref, resolution):
        self.closed.append((ref, resolution))
        return True


class RecordingAlerts:
    def __init__(self):
        self.messages = []

    def alert(self, message):
        self.messages.append(message)


def write_queue_file(events):
    handle = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8")
    with handle:
        for event in events:
            handle.write(json.dumps(event) + "\n")
    return handle.name


def message_event(event_id="e1", **data):
    base = {"message_id": f"m-{event_id}", "sender": "peer", "message_type": "message",
            "turn": 3, "max_turns": 50, "turns_remaining": 47,
            "consumes_turn": True, "requires_action": True}
    base.update(data)
    return {"id": event_id, "event": "message", "payload": {"contract_id": "c-1", "data": base}}


class TurnBudgetTest(unittest.TestCase):
    def test_a_receipt_reports_as_free(self):
        budget = read_turn_budget({"consumes_turn": False, "turns_remaining": 40, "turn": 5, "max_turns": 50})
        self.assertIn("cost=non-turn", budget.describe())
        self.assertFalse(budget.is_low)

    def test_a_thin_budget_says_so(self):
        budget = read_turn_budget({"consumes_turn": True, "turns_remaining": 2, "turn": 48, "max_turns": 50})
        self.assertTrue(budget.is_low)
        self.assertIn("LOW_BUDGET", budget.describe())

    def test_a_thin_budget_points_at_a_linked_follow_up(self):
        budget = read_turn_budget({"consumes_turn": True, "turns_remaining": 1, "turn": 9, "max_turns": 10})
        self.assertIn("--continues", budget.describe())

    def test_a_legacy_event_is_assumed_to_have_cost_a_turn(self):
        self.assertIn("cost=turn", read_turn_budget({"turn": 3, "max_turns": 10}).describe())


class CloseOutcomeTest(unittest.TestCase):
    def test_only_an_approved_completion_means_the_work_was_accepted(self):
        self.assertTrue(work_was_accepted(CloseOutcome.COMPLETED_APPROVED))
        for outcome in (CloseOutcome.TURNS_EXHAUSTED, CloseOutcome.EXPIRED,
                        CloseOutcome.CLOSED_BY_PARTICIPANT, CloseOutcome.CLOSED_UNAPPROVED):
            with self.subTest(outcome=outcome):
                self.assertFalse(work_was_accepted(outcome))

    def test_outcomes_are_inferred_for_older_events(self):
        self.assertEqual(read_close_outcome({"closed_by": "system:max-turns"}), CloseOutcome.TURNS_EXHAUSTED)
        self.assertEqual(read_close_outcome({"closed_by": "system:expiry"}), CloseOutcome.EXPIRED)
        self.assertEqual(read_close_outcome({"closed_by": "alice"}), CloseOutcome.CLOSED_BY_PARTICIPANT)

    def test_a_declared_unapproved_close_is_read(self):
        self.assertEqual(read_close_outcome({"outcome": "closed-unapproved"}), CloseOutcome.CLOSED_UNAPPROVED)

    def test_a_gated_contract_closed_by_a_participant_without_approval_is_unapproved(self):
        self.assertEqual(
            read_close_outcome({"closed_by": "alice", "completion_requires_approval": True}),
            CloseOutcome.CLOSED_UNAPPROVED,
        )

    def test_a_gated_contract_approved_at_its_cap_completed(self):
        self.assertEqual(
            read_close_outcome({"closed_by": "system:max-turns", "completion_approved_at": "2026-01-01T00:00:00Z"}),
            CloseOutcome.COMPLETED_APPROVED,
        )


class ReactorLoopTest(unittest.TestCase):
    def test_actionable_events_reach_the_worker_and_leave_the_queue(self):
        path = write_queue_file([message_event("e1")])
        worker = NullWorkerRuntime()
        result = Reactor(worker=worker).drain(path)
        self.assertEqual(result.acted, 1)
        self.assertEqual(len(worker.spawned), 1)
        self.assertEqual(Path(path).read_text().strip(), "")

    def test_a_receipt_never_reaches_the_worker(self):
        path = write_queue_file([message_event("e1", message_type="receipt",
                                               consumes_turn=False, requires_action=False)])
        worker = NullWorkerRuntime()
        result = Reactor(worker=worker).drain(path)
        self.assertEqual(result.recorded, 1)
        self.assertEqual(worker.spawned, [])

    def test_an_unapproved_artifact_alerts_a_human_and_starts_nothing(self):
        path = write_queue_file([message_event("e1", markdown="Bundle: https://tmpfiles.org/dl/1/x.zip")])
        worker, alerts = NullWorkerRuntime(), RecordingAlerts()
        result = Reactor(worker=worker, alerts=alerts).drain(path)
        self.assertEqual(result.escalated, 1)
        self.assertEqual(worker.spawned, [], "nothing may fetch an unapproved artifact")
        self.assertEqual(len(alerts.messages), 1)
        self.assertIn("A human must decide", alerts.messages[0])

    def test_a_failed_worker_leaves_its_event_queued_for_retry(self):
        class FailingWorker:
            def spawn(self, event, label):
                return False

        path = write_queue_file([message_event("e1")])
        result = Reactor(worker=FailingWorker()).drain(path)
        self.assertEqual(result.failed, 1)
        self.assertEqual(len(Path(path).read_text().strip().splitlines()), 1)

    def test_an_escalation_does_not_loop(self):
        path = write_queue_file([message_event("e1", markdown="https://tmpfiles.org/dl/1/x.zip")])
        Reactor(worker=NullWorkerRuntime(), alerts=RecordingAlerts()).drain(path)
        self.assertEqual(Path(path).read_text().strip(), "", "a human-gated event must not requeue")

    def test_an_approved_closure_closes_tracked_work(self):
        event = {"id": "e1", "event": "contract.closed", "payload": {"contract_id": "c-1", "data": {
            "outcome": "completed-approved", "closed_by": "system:completion-approved",
            "current_turns": 7, "max_turns": 20}}}
        tracker = RecordingTracker(["TASK-1"])
        Reactor(tracker=tracker, worker=NullWorkerRuntime()).drain(write_queue_file([event]))
        self.assertEqual(len(tracker.closed), 1)

    def test_a_spent_budget_annotates_but_never_closes(self):
        event = {"id": "e1", "event": "contract.closed", "payload": {"contract_id": "c-1", "data": {
            "outcome": "turns-exhausted", "closed_by": "system:max-turns",
            "current_turns": 50, "max_turns": 50}}}
        tracker = RecordingTracker(["TASK-1"])
        Reactor(tracker=tracker, worker=NullWorkerRuntime()).drain(write_queue_file([event]))
        self.assertEqual(tracker.closed, [], "a spent budget is not evidence of acceptance")
        self.assertEqual(len(tracker.annotated), 1)
        self.assertIn("needs a decision", tracker.annotated[0][1])

    def test_an_unapproved_close_stays_open_and_points_at_a_linked_follow_up(self):
        event = {"id": "e1", "event": "contract.closed", "payload": {"contract_id": "c-1", "data": {
            "outcome": "closed-unapproved", "closed_by": "alice", "current_turns": 10, "max_turns": 10,
            "successor_hint": "Propose the follow-up with continues: c-1."}}}
        tracker = RecordingTracker(["TASK-1"])
        Reactor(tracker=tracker, worker=NullWorkerRuntime()).drain(write_queue_file([event]))
        self.assertEqual(tracker.closed, [], "closing without approval is not acceptance")
        note = tracker.annotated[0][1]
        self.assertIn("without accepting", note)
        self.assertIn("--continues c-1", note)
        self.assertIn("Platform says: Propose the follow-up", note)

    def test_a_spent_budget_points_at_a_linked_follow_up(self):
        event = {"id": "e1", "event": "contract.closed", "payload": {"contract_id": "c-1", "data": {
            "outcome": "turns-exhausted", "closed_by": "system:max-turns"}}}
        tracker = RecordingTracker(["TASK-1"])
        Reactor(tracker=tracker, worker=NullWorkerRuntime()).drain(write_queue_file([event]))
        self.assertIn("--continues c-1", tracker.annotated[0][1])

    def test_an_approved_closure_suggests_no_successor(self):
        event = {"id": "e1", "event": "contract.closed", "payload": {"contract_id": "c-1", "data": {
            "outcome": "completed-approved"}}}
        tracker = RecordingTracker(["TASK-1"])
        Reactor(tracker=tracker, worker=NullWorkerRuntime()).drain(write_queue_file([event]))
        self.assertNotIn("--continues", tracker.annotated[0][1])

    def test_the_worker_receives_guidance_with_the_event(self):
        class CapturingWorker:
            def __init__(self):
                self.events = []

            def spawn(self, event, label):
                self.events.append(event)
                return True

        path = write_queue_file([{"id": "i1", "event": "invitation", "payload": {
            "contract_id": "c-2", "data": {"title": "Review", "proposer": "alice"}}}])
        worker = CapturingWorker()
        Reactor(worker=worker).drain(path)
        self.assertIn("YOU OPEN", worker.events[0]["worker_guidance"])

    def test_a_dry_run_changes_nothing(self):
        path = write_queue_file([message_event("e1")])
        worker = NullWorkerRuntime()
        Reactor(worker=worker).drain(path, dry_run=True)
        self.assertEqual(worker.spawned, [])
        self.assertEqual(len(Path(path).read_text().strip().splitlines()), 1)

    def test_a_corrupt_line_costs_one_event_not_the_queue(self):
        path = write_queue_file([message_event("e1")])
        with open(path, "a", encoding="utf-8") as handle:
            handle.write("{not json\n")
        result = Reactor(worker=NullWorkerRuntime()).drain(path)
        self.assertEqual(result.acted, 1)


class WorkerGuidanceTest(unittest.TestCase):
    def invitation(self, **data):
        return {"id": "i1", "event": "invitation", "payload": {"contract_id": "c-new", "data": data}}

    def test_an_invitation_says_accept_then_open_in_the_same_run(self):
        text = worker_guidance(self.invitation(title="Review", proposer="alice"))
        self.assertIn("holloway accept c-new", text)
        self.assertIn("YOU OPEN", text)
        self.assertIn("holloway send c-new", text)

    def test_an_unlinked_invitation_asks_for_the_task(self):
        self.assertIn("holloway contract-link c-new", worker_guidance(self.invitation()))
        linked = worker_guidance(self.invitation(linked_task={"project_id": "p", "task_id": "t", "title": "T"}))
        self.assertNotIn("contract-link", linked)
        self.assertIn("holloway task p t", linked)

    def test_an_unrelated_continuation_asks_for_the_relation(self):
        text = worker_guidance(self.invitation(likely_predecessors=[
            {"id": "c-old", "title": "Cairn PR 65", "status": "active", "current_turns": 10, "max_turns": 10}]))
        self.assertIn("holloway contract-relate c-new --to c-old --type continues", text)
        related = worker_guidance(self.invitation(
            likely_predecessors=[{"id": "c-old"}],
            related_contracts=[{"id": "c-old", "title": "Cairn PR 65", "link_type": "continues"}]))
        self.assertNotIn("contract-relate", related)

    def test_the_platform_next_action_is_quoted(self):
        text = worker_guidance(self.invitation(next_action="Accept, then send the first message."))
        self.assertIn("Platform says: Accept, then send the first message.", text)

    def test_the_opener_is_told_to_open(self):
        event = {"id": "a1", "event": "contract.accepted", "payload": {"contract_id": "c-1", "data": {
            "opens_next_agent_id": "me", "next_action": "Send the first message."}}}
        text = worker_guidance(event, self_agent_id="me")
        self.assertIn("YOU OPEN", text)
        self.assertIn("Platform says: Send the first message.", text)

    def test_a_low_budget_message_points_at_a_linked_follow_up(self):
        text = worker_guidance(message_event("e1", turns_remaining=2))
        self.assertIn("--continues c-1", text)
        self.assertNotIn("--continues", worker_guidance(message_event("e1")))

    def test_an_exhausted_budget_names_both_ways_to_end_it(self):
        text = worker_guidance(message_event("e1", turns_remaining=0,
                                             next_steps=["Proposer: approve or close without approval."]))
        self.assertIn("approve-completion c-1", text)
        self.assertIn("--without-approval", text)
        self.assertIn("Platform says: Proposer: approve", text)


class LeaseTest(unittest.TestCase):
    def test_a_second_reactor_skips_rather_than_queues(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock = Path(tmp) / "reactor.lock"
            with reactor_lease(lock):
                with self.assertRaises(LeaseBusy):
                    with reactor_lease(lock):
                        self.fail("two reactors held the lease at once")

    def test_the_lease_is_released_for_the_next_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock = Path(tmp) / "reactor.lock"
            with reactor_lease(lock):
                pass
            with reactor_lease(lock):
                pass


if __name__ == "__main__":
    unittest.main()


class FormatRuleTests(unittest.TestCase):
    def test_every_event_that_can_lead_to_a_send_carries_the_format_rule(self):
        for kind in ("invitation", "contract.accepted", "message"):
            event = {"event": kind, "payload": {"contract_id": "c1", "data": {}}}
            self.assertIn("MESSAGE_UNSTRUCTURED", worker_guidance(event), kind)

    def test_closures_do_not(self):
        event = {"event": "contract.closed", "payload": {"contract_id": "c1", "data": {}}}
        self.assertNotIn("MESSAGE_UNSTRUCTURED", worker_guidance(event))


class HumanRuleTests(unittest.TestCase):
    def test_every_event_that_can_lead_to_a_send_says_how_to_hand_to_a_person(self):
        for kind in ("invitation", "contract.accepted", "message"):
            event = {"event": kind, "payload": {"contract_id": "c1", "data": {}}}
            text = worker_guidance(event)
            self.assertIn("--needs-human", text, kind)
            self.assertIn("holloway ask", text, kind)
            self.assertIn("send nothing, or a receipt", text, kind)

    def test_the_format_rule_quotes_the_message_limit_not_the_description_one(self):
        event = {"event": "message", "payload": {"contract_id": "c1", "data": {}}}
        text = worker_guidance(event)
        self.assertIn("over 400 characters", text)
        self.assertNotIn("600", text)

    def test_closures_do_not_carry_it(self):
        event = {"event": "contract.closed", "payload": {"contract_id": "c1", "data": {}}}
        self.assertNotIn("--needs-human", worker_guidance(event))
