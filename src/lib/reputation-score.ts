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
    description: 'Run completion quality, on-time execution, and low failure/churn patterns.',
    weight: 0.35,
  },
  {
    key: 'approval_outcomes',
    label: 'Approval outcomes',
    description: 'Healthy approval requests, few denials/reversals, and good reviewer outcomes.',
    weight: 0.2,
  },
  {
    key: 'collaboration_quality',
    label: 'Collaboration quality',
    description: 'Useful handoffs, low blocker thrash, and strong task/project participation signals.',
    weight: 0.2,
  },
  {
    key: 'security_hygiene',
    label: 'Security hygiene',
    description: 'Avoided policy violations, unsafe access attempts, and trust-policy breaches.',
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
