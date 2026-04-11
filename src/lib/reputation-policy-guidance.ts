import type { AgentReputationDetail, ReputationPolicyGuidance, ReputationPolicyGuidanceItem } from '@/lib/types';

function pushItem(items: ReputationPolicyGuidanceItem[], item: ReputationPolicyGuidanceItem) {
  items.push(item);
}

export function buildReputationPolicyGuidance(reputation: Pick<AgentReputationDetail,
  'score'
  | 'confidence_band'
  | 'explanation'
>): ReputationPolicyGuidance {
  const stableEnough = reputation.explanation.gating.is_stable;
  const visibleScore = reputation.explanation.gating.is_visible;
  const score = reputation.score;
  const items: ReputationPolicyGuidanceItem[] = [];

  if (!visibleScore) {
    pushItem(items, {
      id: 'insufficient-evidence',
      severity: 'info',
      title: 'Wait for more evidence',
      summary: reputation.explanation.gating.reason || 'Not enough reputation evidence is available yet.',
      recommendation: 'Do not change workflow or trust settings based on reputation yet. Keep using normal review and existing trust-policy controls.',
      rationale: 'This guidance is advisory only and activates after the score has enough evidence to be meaningful.',
    });
  }

  if (visibleScore && !stableEnough) {
    pushItem(items, {
      id: 'provisional-signal',
      severity: 'info',
      title: 'Treat the score as provisional',
      summary: 'The reputation model is visible but not yet stable.',
      recommendation: 'Use reputation as a soft discussion input only. Avoid policy changes or operator escalation based on this score alone.',
      rationale: 'Early scores can move quickly while the evidence window is still filling in.',
    });
  }

  if (reputation.explanation.adjustments.manual_review_only) {
    pushItem(items, {
      id: 'manual-review-hold',
      severity: 'elevated',
      title: 'Prefer manual review',
      summary: 'Recent severe reputation signals triggered a manual review hold in the scoring model.',
      recommendation: 'Add human review for sensitive collaboration decisions until newer positive evidence arrives.',
      rationale: reputation.explanation.adjustments.reasons.join('; ') || 'Manual review hold was triggered by the reputation model.',
    });
  } else if (stableEnough && typeof score === 'number' && score < 0.45) {
    pushItem(items, {
      id: 'low-score-caution',
      severity: 'warning',
      title: 'Use extra operator caution',
      summary: 'Stable reputation is currently trending low.',
      recommendation: 'Prefer extra check-ins, narrower scopes, and explicit human review for higher-risk work. Do not block access automatically.',
      rationale: 'This is guidance only. Existing auth and trust-tier enforcement remain the only hard gates.',
    });
  } else if (stableEnough && typeof score === 'number' && score >= 0.75) {
    pushItem(items, {
      id: 'high-score-observation',
      severity: 'info',
      title: 'Reputation supports standard workflow',
      summary: 'Stable reputation is trending positive across recent signals.',
      recommendation: 'You can keep default collaboration posture unless separate trust or security signals suggest otherwise.',
      rationale: 'Positive reputation should inform operator judgment, not grant permissions.',
    });
  }

  if (reputation.explanation.adjustments.anti_gaming_penalty > 0) {
    pushItem(items, {
      id: 'anti-gaming-adjustment',
      severity: 'warning',
      title: 'Score includes anti-gaming adjustment',
      summary: 'The model detected evidence concentration or burst patterns that reduced score confidence.',
      recommendation: 'Check the underlying event context before drawing conclusions from short-window changes.',
      rationale: reputation.explanation.adjustments.reasons.join('; ') || 'Anti-gaming adjustment applied.',
    });
  }

  if (items.length === 0) {
    pushItem(items, {
      id: 'no-action-needed',
      severity: 'info',
      title: 'No special advisory guidance',
      summary: 'Current reputation signals do not suggest any extra advisory handling.',
      recommendation: 'Use normal operating judgment and existing trust-policy controls.',
      rationale: 'Reputation remains informational and separate from authorization.',
    });
  }

  const recommendedPosture = reputation.explanation.adjustments.manual_review_only
    ? 'manual-review'
    : stableEnough && typeof score === 'number' && score < 0.45
      ? 'caution'
      : 'standard';

  return {
    advisory_only: true,
    generated_at: new Date().toISOString(),
    stable_enough: stableEnough,
    visible_score: visibleScore,
    score,
    confidence_band: reputation.confidence_band,
    recommended_posture: recommendedPosture,
    items,
  };
}
