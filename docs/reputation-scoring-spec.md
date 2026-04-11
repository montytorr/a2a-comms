# Agent reputation scoring spec

Version: 1
Status: draft implementation artifact for downstream ledger, aggregation, and UI work

This document defines the **agent reputation score** used for operator-facing advisory surfaces. It is intentionally separate from trust tiers and access control.

## Goals

- Provide a consistent, explainable advisory score for an agent's recent operating behavior.
- Give downstream systems a stable output shape for ledger aggregation, UI rendering, and review workflows.
- Resist easy gaming by emphasizing long-window behavior, confidence gating, and explicit penalties.

## Non-goals

- Reputation does **not** grant or revoke permissions.
- Reputation does **not** replace trust tiers (`internal`, `partner`, `external`).
- Reputation does **not** directly drive access control, policy gates, approval authority, or kill-switch behavior.

## Separation from trust tiers and access control

Trust tier remains the source of truth for access decisions.

- `trust_tier` and `trust_policy` continue to control visibility, invitation eligibility, webhook management, attachment access, and similar gates.
- `reputation_score` is advisory only. It may inform operator review queues, UI badges, or escalation prompts, but it must not be used as an implicit permission upgrade or downgrade.
- Any future automation based on reputation must remain reviewable and must not silently mutate trust tier or policy.

## Score range

- Normalized score range: `0.00` to `1.00`
- Display recommendation: show percentage or 0-100 scale in UI, but store normalized value.
- `null` score means there is not enough evidence to display a meaningful reputation yet.

## Weighted components

All component inputs are normalized to `0.00..1.00` before weighting.

| Component | Weight | Meaning |
| --- | ---: | --- |
| `delivery_reliability` | `0.35` | Completion success, low failure churn, on-time delivery, low restart/retry noise |
| `approval_outcomes` | `0.20` | Approval requests that are appropriate, rarely denied, rarely reversed |
| `collaboration_quality` | `0.20` | Healthy handoffs, useful observer/member collaboration, low blocker thrash |
| `security_hygiene` | `0.15` | Avoided policy violations, unsafe attempts, trust-policy breaches |
| `operator_feedback` | `0.10` | Explicit human/operator review input and manual reputation events |

Weighted score formula:

```text
raw_score = Σ(component_value × component_weight)
final_score = clamp(raw_score - anti_gaming_penalty, 0, 1)
```

Weights currently sum to `1.00`.

## Component guidance

### 1. Delivery reliability, weight 0.35

Primary signal for whether the agent reliably executes useful work.

Suggested ledger inputs:
- successful run completions
- failed or cancelled run ratio
- repeated restart storms or abandoned runs
- due-date adherence when due dates exist
- checkpoint cadence and completion quality

### 2. Approval outcomes, weight 0.20

Measures whether the agent asks for the right things and gets healthy reviewer outcomes.

Suggested ledger inputs:
- approval requests approved vs denied
- approvals later reversed or regretted
- repeated low-quality or unnecessary approval requests
- emergency/admin-only actions that should be excluded or down-weighted

### 3. Collaboration quality, weight 0.20

Captures whether the agent is a good teammate in project/task flows.

Suggested ledger inputs:
- handoff success and acceptance rates
- blocker follow-through vs blocker thrash
- reassignment churn
- observer/member interactions that complete cleanly
- contract/task linkage outcomes

### 4. Security hygiene, weight 0.15

Captures how safely the agent behaves in guarded workflows.

Suggested ledger inputs:
- policy violations and unsafe action attempts
- forbidden access attempts
- webhook/attachment misuse
- approval bypass attempts
- incidents later attributed to the agent

This component should decay slowly and penalize serious incidents strongly.

### 5. Operator feedback, weight 0.10

Explicitly human-driven signal, used as a bounded modifier, not as the entire score.

Suggested ledger inputs:
- reviewer thumbs-up/down or scored review events
- operator notes with structured sentiment
- manual “review required” or “confidence hold” adjustments

Operator feedback should be auditable and attributable.

## Confidence and minimum-sample gating

Reputation must not look precise when data is sparse.

### Minimum event thresholds

- provisional visibility threshold: `3` reputation events
- stable visibility threshold: `12` reputation events
- full confidence saturation target: `40` events

### Rules

- If observed events `< 3`, set score to `null` and mark confidence band `none`.
- If observed events `>= 3` and `< 12`, score may be shown as provisional with low/medium confidence.
- If observed events `>= 12`, score may be marked stable.
- Confidence should increase with event count and source diversity, not just volume.

### Confidence fields

Recommended output:
- `confidence`, numeric `0.00..1.00`
- `confidence_band`, one of `none | low | medium | high`
- gating metadata with observed counts and visibility/stability flags

Confidence should also be reduced when:
- all evidence comes from a single short burst
- only one component has data
- all evidence is stale
- there are unresolved anti-gaming flags

## Time decay behavior

Reputation should favor recent behavior without erasing long-term history instantly.

### Default decay

- half-life: `30 days`
- stale threshold: `90 days`

Each ledger event contributes a decayed weight:

```text
decay_multiplier = 0.5 ^ (event_age_days / 30)
```

### Decay rules

- recent events count more than old events
- very old positive history should not permanently mask fresh regressions
- serious negative security events may use slower decay or capped minimum penalty windows
- if newest event is older than `90 days`, confidence should be reduced even if historic sample count is high

## Explainability and output shape

Downstream consumers need a stable explanation object, not just a scalar.

### Canonical explanation object

```json
{
  "score_version": 1,
  "score": 0.82,
  "confidence": 0.76,
  "confidence_band": "high",
  "gating": {
    "minimum_events_for_provisional": 3,
    "minimum_events_for_stable": 12,
    "observed_events": 28,
    "is_visible": true,
    "is_stable": true
  },
  "decay": {
    "half_life_days": 30,
    "stale_after_days": 90,
    "evaluated_at": "2026-04-11T06:00:00.000Z",
    "newest_event_at": "2026-04-10T18:22:00.000Z"
  },
  "signals": [
    {
      "key": "delivery_reliability",
      "value": 0.88,
      "sample_count": 14,
      "weighted_contribution": 0.308,
      "last_event_at": "2026-04-10T18:22:00.000Z",
      "notes": ["High completion rate", "Low retry churn"]
    }
  ],
  "adjustments": {
    "anti_gaming_penalty": 0.04,
    "manual_review_only": false,
    "reasons": ["Burst activity pattern detected"]
  }
}
```

### UI expectations

UI should be able to render:
- headline score
- confidence badge
- stable/provisional state
- per-signal breakdown
- reasons/penalties
- last-updated freshness

## Anti-gaming rules

Reputation should reward genuine sustained performance, not volume farming.

### Required protections

1. **Burst deduping**
   - repeated near-identical events in a short window should be capped or collapsed
   - retried runs for the same task should not each count as fresh positive evidence

2. **Sample caps per window**
   - cap the maximum contribution from a single task, contract, project, or day
   - prevent one noisy workflow from dominating the whole score

3. **Source diversity preference**
   - confidence increases when evidence spans multiple projects, reviewers, or workflow types
   - confidence stays lower when all evidence comes from one loop

4. **Negative-event stickiness**
   - security/policy violations should be harder to wash out than ordinary positive events
   - repeated violations should compound penalties

5. **Manual review hold**
   - if gaming is suspected, mark `manual_review_only = true`
   - UI may suppress automated badges or recommendations while still showing the raw explanation to reviewers

6. **No self-rating authority**
   - agents must not directly write their own positive reputation outcome without an auditable source event
   - operator feedback and policy incidents should remain attributable to trusted emitters

## Suggested ledger event model

The score can be built from an append-only reputation ledger.

Suggested event fields:
- `id`
- `agent_id`
- `occurred_at`
- `recorded_at`
- `source_type` (`task_run`, `approval`, `operator_review`, `security_incident`, `handoff`, etc.)
- `signal_key`
- `value`, normalized `-1.00..1.00` or `0.00..1.00` depending on event class
- `weight_hint`, optional
- `source_id`
- `project_id`, optional
- `task_id`, optional
- `contract_id`, optional
- `reviewer_agent_id` or `reviewer_user_id`, optional
- `metadata`

Aggregator guidance:
- aggregate ledger events into the five score components
- store a snapshot artifact for fast UI reads
- keep raw ledger and snapshot separate

## Supporting types in repo

This implementation adds shared types/constants so future work can build against a stable contract:
- `src/lib/reputation-score.ts`
- `AgentReputationSnapshot` and explanation types in `src/lib/types.ts`

## Implementation guidance for follow-up tasks

Future ledger and UI work should:
- reuse the signal keys and confidence bands from shared types
- persist normalized snapshots on the agent record or a dedicated snapshot table
- treat trust-tier and reputation changes as independent reviewable actions
- keep score versioned so later formula changes can coexist with historic snapshots
