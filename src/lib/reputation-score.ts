export const REPUTATION_SCORE_VERSION = 1 as const;

export const REPUTATION_SIGNAL_KEYS = [
  'delivery_reliability',
  'approval_outcomes',
  'collaboration_quality',
  'security_hygiene',
] as const;

export type ReputationSignalKey = typeof REPUTATION_SIGNAL_KEYS[number];

export interface ReputationSignalWeight {
  key: ReputationSignalKey;
  label: string;
  description: string;
  weight: number;
}

export const REPUTATION_SIGNAL_WEIGHTS: ReputationSignalWeight[] = [
  {
    key: 'delivery_reliability',
    label: 'Delivery reliability',
    description: 'Task run completions, failures, and progress updates. Tracks whether the agent finishes what it starts.',
    weight: 0.35,
  },
  {
    key: 'approval_outcomes',
    label: 'Approval outcomes',
    description: 'Formal approval-gate results — requests, approvals, and denials from the pending approvals workflow. Not related to contract acceptance.',
    weight: 0.2,
  },
  {
    key: 'collaboration_quality',
    label: 'Collaboration quality',
    description: 'Contract proposals, acceptances, messages, handoffs, and project membership. Tracks how the agent interacts with peers.',
    weight: 0.2,
  },
  {
    key: 'security_hygiene',
    label: 'Security hygiene',
    description: 'Auth failures, denied access attempts, and suspicious activity like replay or signature issues. Empty means no incidents.',
    weight: 0.25,
  },
];

export const REPUTATION_WEIGHT_SUM = REPUTATION_SIGNAL_WEIGHTS.reduce((sum, signal) => sum + signal.weight, 0);

export const REPUTATION_MIN_EVENTS_FOR_PROVISIONAL = 3;
export const REPUTATION_MIN_EVENTS_FOR_STABLE = 12;
export const REPUTATION_FULL_CONFIDENCE_EVENT_COUNT = 40;
export const REPUTATION_DEFAULT_HALF_LIFE_DAYS = 30;
export const REPUTATION_STALE_AFTER_DAYS = 90;

export type ReputationConfidenceBand = 'none' | 'low' | 'medium' | 'high';

export interface ReputationSignalBreakdown {
  key: ReputationSignalKey;
  label: string;
  value: number;
  weight: number;
  weightedContribution: number;
  sampleCount: number;
  lastEventAt: string | null;
  notes?: string[];
}

export interface ReputationScoreExplanation {
  scoreVersion: number;
  score: number | null;
  confidence: number;
  confidenceBand: ReputationConfidenceBand;
  gating: {
    minimumEventsForProvisional: number;
    minimumEventsForStable: number;
    observedEvents: number;
    isVisible: boolean;
    isStable: boolean;
    reason?: string;
  };
  decay: {
    halfLifeDays: number;
    staleAfterDays: number;
    evaluatedAt: string;
    newestEventAt: string | null;
  };
  signals: ReputationSignalBreakdown[];
  adjustments: {
    antiGamingPenalty: number;
    manualReviewOnly: boolean;
    reasons: string[];
  };
}

export function getReputationConfidenceBand(confidence: number): ReputationConfidenceBand {
  if (confidence <= 0) return 'none';
  if (confidence < 0.35) return 'low';
  if (confidence < 0.75) return 'medium';
  return 'high';
}
