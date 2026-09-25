import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVAL_STATUS_TONE,
  BLOCKER_TONE,
  DEPENDENCY_KIND_TONE,
  DUE_STATE_TONE,
  CONTRACT_STATUS_TONE,
  MESSAGE_TYPE_TONE,
  OPERATOR_QUESTION_STATUS_TONE,
  PARTICIPANT_STATUS_TONE,
  PROJECT_INVITATION_STATUS_TONE,
  PROJECT_STATUS_TONE,
  SPRINT_STATUS_TONE,
  STATUS_DOMAINS,
  STATUS_TONES,
  TASK_CHECKPOINT_STATUS_TONE,
  TASK_PRIORITY_TONE,
  TASK_EXECUTION_RUN_STATUS_TONE,
  TASK_EXECUTION_STATUS_TONE,
  TASK_STATUS_TONE,
  WEBHOOK_DELIVERY_STATUS_TONE,
  chartFillForTone,
  chartFillMap,
  colorVarForTone,
  dotClassForTone,
  pillClassForTone,
  statusLabel,
  statusTone,
  httpStatusTone,
  looseStatusTone,
  statusesOf,
  taskPriorityTone,
  tonePulses,
  type StatusDomain,
  type Tone,
} from '@/lib/status-tone';
import type {
  ApprovalStatus,
  ContractStatus,
  MessageType,
  OperatorQuestionStatus,
  ParticipantStatus,
  ProjectInvitationStatus,
  ProjectStatus,
  SprintStatus,
  TaskCheckpointStatus,
  TaskExecutionRunStatus,
  TaskExecutionStatus,
  TaskPriority,
  TaskStatus,
  WebhookDeliveryStatus,
} from '@/lib/types';

// ── Exhaustiveness ───────────────────────────────────────────
//
// Two halves, and both are needed.
//
// COMPILE TIME: each map in status-tone.ts is declared `Record<Union, Tone>`,
// so a member added to a union in types.ts breaks the build there until it is
// given a tone, and a key that is not in the union is rejected. That is the
// guarantee. The four maps this module replaced were all `Record<string, …>`
// with a `?? fallback`, which is why each had different holes: `blocked` was
// missing from two task maps and `todo` resolved to no tone at all on one page.
//
// RUN TIME: the lists below are `satisfies readonly Union[]`, so removing or
// renaming a union member fails to compile here, and the deepEqual against the
// map's own keys fails when a member is *added* — which makes this test the
// thing that notices, rather than a reviewer.

const CONTRACT_STATUSES = [
  'proposed', 'active', 'rejected', 'expired', 'cancelled', 'closed',
] as const satisfies readonly ContractStatus[];

const PROJECT_STATUSES = [
  'planning', 'active', 'completed', 'archived',
] as const satisfies readonly ProjectStatus[];

const SPRINT_STATUSES = [
  'planned', 'active', 'completed',
] as const satisfies readonly SprintStatus[];

const TASK_STATUSES = [
  'backlog', 'todo', 'in-progress', 'in-review', 'done', 'cancelled',
] as const satisfies readonly TaskStatus[];

const TASK_EXECUTION_STATUSES = [
  'idle', 'queued', 'running', 'pending-approval', 'waiting', 'blocked',
  'paused', 'handoff-needed', 'succeeded', 'failed', 'cancelled',
] as const satisfies readonly TaskExecutionStatus[];

const TASK_EXECUTION_RUN_STATUSES = [
  'queued', 'starting', 'running', 'pending-approval', 'waiting', 'blocked',
  'paused', 'handoff-needed', 'succeeded', 'failed', 'cancelled',
] as const satisfies readonly TaskExecutionRunStatus[];

const TASK_CHECKPOINT_STATUSES = [
  'written', 'superseded',
] as const satisfies readonly TaskCheckpointStatus[];

const APPROVAL_STATUSES = [
  'pending', 'approved', 'denied', 'consumed',
] as const satisfies readonly ApprovalStatus[];

const WEBHOOK_DELIVERY_STATUSES = [
  'pending', 'pending_retry', 'retrying', 'success', 'failed',
] as const satisfies readonly WebhookDeliveryStatus[];

const PARTICIPANT_STATUSES = [
  'pending', 'accepted', 'rejected',
] as const satisfies readonly ParticipantStatus[];

const PROJECT_INVITATION_STATUSES = [
  'pending', 'accepted', 'declined', 'cancelled', 'expired',
] as const satisfies readonly ProjectInvitationStatus[];

const OPERATOR_QUESTION_STATUSES = [
  'open', 'answered', 'dismissed',
] as const satisfies readonly OperatorQuestionStatus[];

const MESSAGE_TYPES = [
  'message', 'request', 'response', 'update', 'status', 'receipt', 'approval',
] as const satisfies readonly MessageType[];

const UNIONS: Array<{ domain: StatusDomain; map: Record<string, Tone>; members: readonly string[] }> = [
  { domain: 'contract',            map: CONTRACT_STATUS_TONE,            members: CONTRACT_STATUSES },
  { domain: 'project',             map: PROJECT_STATUS_TONE,             members: PROJECT_STATUSES },
  { domain: 'sprint',              map: SPRINT_STATUS_TONE,              members: SPRINT_STATUSES },
  { domain: 'task',                map: TASK_STATUS_TONE,                members: TASK_STATUSES },
  { domain: 'task-execution',      map: TASK_EXECUTION_STATUS_TONE,      members: TASK_EXECUTION_STATUSES },
  { domain: 'task-execution-run',  map: TASK_EXECUTION_RUN_STATUS_TONE,  members: TASK_EXECUTION_RUN_STATUSES },
  { domain: 'task-checkpoint',     map: TASK_CHECKPOINT_STATUS_TONE,     members: TASK_CHECKPOINT_STATUSES },
  { domain: 'approval',            map: APPROVAL_STATUS_TONE,            members: APPROVAL_STATUSES },
  { domain: 'webhook-delivery',    map: WEBHOOK_DELIVERY_STATUS_TONE,    members: WEBHOOK_DELIVERY_STATUSES },
  { domain: 'participant',         map: PARTICIPANT_STATUS_TONE,         members: PARTICIPANT_STATUSES },
  { domain: 'project-invitation',  map: PROJECT_INVITATION_STATUS_TONE,  members: PROJECT_INVITATION_STATUSES },
  { domain: 'operator-question',   map: OPERATOR_QUESTION_STATUS_TONE,   members: OPERATOR_QUESTION_STATUSES },
  { domain: 'message-type',        map: MESSAGE_TYPE_TONE,               members: MESSAGE_TYPES },
];

const TONES: readonly Tone[] = ['mint', 'amber', 'peri', 'rose', 'neutral'];

for (const { domain, map, members } of UNIONS) {
  test(`${domain}: every member of the union has a tone, and no key is invented`, () => {
    assert.deepEqual(Object.keys(map).sort(), [...members].sort());
    for (const member of members) {
      assert.ok(TONES.includes(map[member]!), `${domain}/${member} → ${map[member]}`);
      // The lookup used by every renderer must agree with the map itself.
      assert.equal(statusTone(domain, member), map[member]);
    }
  });
}

test('every domain in the lookup table is covered by an exhaustiveness case above', () => {
  assert.deepEqual(STATUS_DOMAINS.sort(), UNIONS.map((u) => u.domain).sort());
});

test('statusesOf() reports the map in lifecycle order, for stable chart legends', () => {
  assert.deepEqual(statusesOf('contract'), [...CONTRACT_STATUSES]);
  assert.deepEqual(statusesOf('task'), [...TASK_STATUSES]);
});

// ── One logical state, one tone, everywhere ──────────────────
//
// The bug this module exists to fix was not a missing colour, it was the same
// state wearing three. Each group below is one meaning; every entity that can
// be in it must resolve to the group's tone. Adding a status to a union and
// giving it a tone that contradicts its meaning fails here.

const EQUIVALENCE_CLASSES: Array<{ meaning: string; tone: Tone; states: Array<[StatusDomain, string]> }> = [
  {
    meaning: 'work is in flight',
    tone: 'amber',
    states: [
      ['contract', 'active'],
      ['project', 'active'],
      ['sprint', 'active'],
      ['task', 'in-progress'],
      ['task-execution', 'running'],
      ['task-execution-run', 'running'],
      ['task-execution-run', 'starting'],
      ['webhook-delivery', 'retrying'],
    ],
  },
  {
    meaning: 'stalled until a person acts',
    tone: 'amber',
    states: [
      ['contract', 'proposed'],
      ['participant', 'pending'],
      ['project-invitation', 'pending'],
      ['approval', 'pending'],
      ['operator-question', 'open'],
      ['task', 'in-review'],
      ['task-execution', 'pending-approval'],
      ['task-execution', 'paused'],
      ['task-execution', 'handoff-needed'],
      ['task-execution-run', 'pending-approval'],
      ['task-execution-run', 'paused'],
      ['task-execution-run', 'handoff-needed'],
      ['webhook-delivery', 'pending_retry'],
    ],
  },
  {
    meaning: 'scheduled but not started',
    tone: 'peri',
    states: [
      ['project', 'planning'],
      ['sprint', 'planned'],
      ['task', 'todo'],
      ['task-execution', 'queued'],
      ['task-execution-run', 'queued'],
      ['task-execution', 'waiting'],
      ['task-execution-run', 'waiting'],
      ['webhook-delivery', 'pending'],
    ],
  },
  {
    meaning: 'reached its good end',
    tone: 'mint',
    states: [
      ['contract', 'closed'],
      ['project', 'completed'],
      ['sprint', 'completed'],
      ['task', 'done'],
      ['task-execution', 'succeeded'],
      ['task-execution-run', 'succeeded'],
      ['approval', 'approved'],
      ['webhook-delivery', 'success'],
      ['participant', 'accepted'],
      ['project-invitation', 'accepted'],
      ['operator-question', 'answered'],
      ['task-checkpoint', 'written'],
    ],
  },
  {
    meaning: 'somebody said no',
    tone: 'rose',
    states: [
      ['contract', 'rejected'],
      ['participant', 'rejected'],
      ['project-invitation', 'declined'],
      ['approval', 'denied'],
    ],
  },
  {
    meaning: 'ran out of time',
    tone: 'rose',
    states: [
      ['contract', 'expired'],
      ['project-invitation', 'expired'],
    ],
  },
  {
    meaning: 'went wrong or cannot proceed',
    tone: 'rose',
    states: [
      ['task-execution', 'failed'],
      ['task-execution', 'blocked'],
      ['task-execution-run', 'failed'],
      ['task-execution-run', 'blocked'],
      ['webhook-delivery', 'failed'],
    ],
  },
  {
    meaning: 'inert — called off, shelved, or never started',
    tone: 'neutral',
    states: [
      ['contract', 'cancelled'],
      ['task', 'cancelled'],
      ['task', 'backlog'],
      ['task-execution', 'cancelled'],
      ['task-execution', 'idle'],
      ['task-execution-run', 'cancelled'],
      ['project', 'archived'],
      ['project-invitation', 'cancelled'],
      ['approval', 'consumed'],
      ['operator-question', 'dismissed'],
      ['task-checkpoint', 'superseded'],
    ],
  },
];

for (const { meaning, tone, states } of EQUIVALENCE_CLASSES) {
  test(`"${meaning}" is ${tone} for every entity that can be in it`, () => {
    for (const [domain, status] of states) {
      assert.equal(
        statusTone(domain, status),
        tone,
        `${domain}/${status} should be ${tone} because it means "${meaning}"`,
      );
    }
  });
}

test('every status in every domain belongs to exactly one equivalence class', () => {
  const claimed = new Map<string, string>();
  for (const { meaning, states } of EQUIVALENCE_CLASSES) {
    for (const [domain, status] of states) {
      const key = `${domain}/${status}`;
      assert.equal(claimed.get(key), undefined, `${key} is claimed twice (${claimed.get(key)} / ${meaning})`);
      claimed.set(key, meaning);
    }
  }
  // `message-type` is a kind, not a lifecycle, so it has no equivalence class.
  const unclaimed: string[] = [];
  for (const domain of STATUS_DOMAINS) {
    if (domain === 'message-type') continue;
    for (const status of statusesOf(domain)) {
      if (!claimed.has(`${domain}/${status}`)) unclaimed.push(`${domain}/${status}`);
    }
  }
  assert.deepEqual(unclaimed, [], 'these statuses have a tone but no stated meaning');
});

// ── The specific disagreements that were measured ─────────────

test('the colours that disagreed across pages now agree', () => {
  // contracts/page.tsx and status-badge.tsx said amber, analytics said mint.
  assert.equal(statusTone('contract', 'active'), 'amber');
  // contracts/page.tsx said rose, analytics said amber.
  assert.equal(statusTone('contract', 'expired'), 'rose');
  // tasks/page.tsx said peri, the project board and the dropdown said amber.
  assert.equal(statusTone('task', 'in-progress'), 'amber');
  // tasks/page.tsx resolved `todo` to no tone at all.
  assert.equal(statusTone('task', 'todo'), 'peri');
  assert.notEqual(statusTone('task', 'todo'), 'neutral');
  // `planning` and `active` were both amber, so a project pill could not say
  // whether the project had started.
  assert.notEqual(statusTone('project', 'planning'), statusTone('project', 'active'));
});

test('`blocked` is not a task status — only an execution status', () => {
  // Two maps carried a `blocked` task row and two did not. The tasks table's
  // CHECK constraint (006_projects_tasks.sql) has never allowed it, so the
  // rows were unreachable rather than inconsistent.
  assert.ok(!statusesOf('task').includes('blocked'));
  assert.ok(statusesOf('task-execution').includes('blocked'));
  // An unreachable status resolves to inert rather than to a surprise colour.
  assert.equal(statusTone('task', 'blocked'), 'neutral');
});

test('an unknown or absent status is inert, not a crash and not a colour', () => {
  assert.equal(statusTone('contract', 'completed'), 'neutral'); // never a contract status
  assert.equal(statusTone('contract', undefined), 'neutral');
  assert.equal(statusTone('contract', null), 'neutral');
  assert.equal(statusTone('contract', ''), 'neutral');
});

// ── Tone → presentation ──────────────────────────────────────

test('each tone maps to a pill class that exists in globals.css', () => {
  assert.deepEqual(TONES.map(pillClassForTone), [
    'pill pill--mint',
    'pill pill--amber',
    'pill pill--peri',
    'pill pill--rose',
    'pill pill--ghost', // `neutral` has no --ghost colour token; it is the ghost pill
  ]);
  assert.deepEqual(TONES.map(dotClassForTone), [
    'dot dot--mint',
    'dot dot--amber',
    'dot dot--peri',
    'dot dot--rose',
    'dot', // the base dot is already the grey one
  ]);
  // No tone may resolve to a raw colour: everything is a theme token.
  for (const tone of TONES) {
    assert.match(colorVarForTone(tone), /^var\(--[a-z0-9-]+\)$/);
  }
});

test('amber is the only tone that pulses', () => {
  assert.deepEqual(TONES.filter(tonePulses), ['amber']);
});

test('labels lose their separators and nothing else', () => {
  assert.equal(statusLabel('in-progress'), 'in progress');
  assert.equal(statusLabel('pending_retry'), 'pending retry');
  assert.equal(statusLabel('handoff-needed'), 'handoff needed');
  assert.equal(statusLabel('active'), 'active');
  assert.equal(statusLabel(null), 'unknown');
  assert.equal(statusLabel(null, '—'), '—');
});

// ── Charts ───────────────────────────────────────────────────

test('chart fills keep the tone but separate statuses that share it', () => {
  const contract = chartFillMap('contract');
  // Hue carries the meaning: the first amber status is amber itself.
  assert.equal(contract.proposed, colorVarForTone('amber'));
  // The second amber status is a shade of the same amber, not a different hue.
  assert.notEqual(contract.active, contract.proposed);
  assert.match(contract.active!, /color-mix\(in oklab, var\(--amber\)/);
  assert.notEqual(contract.expired, contract.rejected);
  assert.match(contract.expired!, /var\(--rose\)/);

  // Every slice of every domain is distinguishable from every other.
  for (const domain of STATUS_DOMAINS) {
    const fills = Object.values(chartFillMap(domain));
    assert.equal(new Set(fills).size, fills.length, `${domain} has duplicate chart fills`);
  }
});

test('chart fills are theme tokens, never literals', () => {
  for (const domain of STATUS_DOMAINS) {
    for (const fill of Object.values(chartFillMap(domain))) {
      assert.match(fill, /var\(--/);
      assert.ok(!/oklch\(|#[0-9a-f]{3}/i.test(fill), fill);
    }
  }
});

test('the shade ladder never repeats itself, however many statuses share a tone', () => {
  assert.equal(chartFillForTone('mint', 0), 'var(--mint)');
  const ladder = Array.from({ length: 12 }, (_, i) => chartFillForTone('mint', i));
  assert.equal(new Set(ladder).size, ladder.length);
  // And it only ever gets fainter, so the first status of a tone is the boldest.
  const weights = ladder.slice(1).map((fill) => Number(/ ([\d.]+)%/.exec(fill)![1]));
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a));
});

test('the lookup table and the named exports are the same objects', () => {
  assert.equal(STATUS_TONES.contract, CONTRACT_STATUS_TONE);
  assert.equal(STATUS_TONES['webhook-delivery'], WEBHOOK_DELIVERY_STATUS_TONE);
  assert.equal(STATUS_TONES['message-type'], MESSAGE_TYPE_TONE);
});

// ── The one genuinely ambiguous word ─────────────────────────

test('`pending` is the only status word that means two different things', () => {
  const byWord = new Map<string, Map<Tone, StatusDomain[]>>();
  for (const domain of STATUS_DOMAINS) {
    if (domain === 'message-type') continue; // kinds, not lifecycle states
    for (const status of statusesOf(domain)) {
      const tone = statusTone(domain, status);
      if (!byWord.has(status)) byWord.set(status, new Map());
      const tones = byWord.get(status)!;
      tones.set(tone, [...(tones.get(tone) ?? []), domain]);
    }
  }
  const disagreements = [...byWord.entries()]
    .filter(([, tones]) => tones.size > 1)
    .map(([word]) => word)
    .sort();

  // A webhook delivery that is `pending` is queued by the system and needs
  // nobody (peri); an approval, invitation or participant that is `pending` is
  // waiting on a person (amber). Same word, different state — so the tones
  // differ on purpose, and `looseStatusTone` documents which one wins when the
  // word arrives with no entity attached.
  assert.deepEqual(disagreements, ['pending']);
  assert.equal(statusTone('webhook-delivery', 'pending'), 'peri');
  assert.equal(statusTone('approval', 'pending'), 'amber');
  assert.equal(statusTone('participant', 'pending'), 'amber');
});

test('a status word shared by several entities is otherwise identical everywhere', () => {
  const shared: Array<[string, Tone]> = [
    ['active', 'amber'],
    ['cancelled', 'neutral'],
    ['completed', 'mint'],
    ['accepted', 'mint'],
    ['rejected', 'rose'],
    ['expired', 'rose'],
    ['failed', 'rose'],
    ['blocked', 'rose'],
    ['queued', 'peri'],
    ['waiting', 'peri'],
    ['succeeded', 'mint'],
  ];
  for (const [word, tone] of shared) {
    for (const domain of STATUS_DOMAINS) {
      if (!statusesOf(domain).includes(word)) continue;
      assert.equal(statusTone(domain, word), tone, `${domain}/${word}`);
    }
  }
});

// ── Free-text statuses out of agent payloads ─────────────────

test('looseStatusTone normalises agent spellings onto the real tones', () => {
  assert.equal(looseStatusTone('In_Progress'), statusTone('task', 'in-progress'));
  assert.equal(looseStatusTone('FAILED'), 'rose');
  assert.equal(looseStatusTone(' done '), 'mint');
  assert.equal(looseStatusTone('both_tasks_done'), 'mint');
  assert.equal(looseStatusTone('confirmed'), 'mint');
  // `pending` off a payload reads as "waiting on someone", not "queued".
  assert.equal(looseStatusTone('pending'), 'amber');
  // The old version fell back to a tone named `fg` and emitted `var(--fg)`.
  assert.equal(looseStatusTone('wharrgarbl'), 'neutral');
  assert.equal(looseStatusTone(null), 'neutral');
  assert.equal(looseStatusTone(''), 'neutral');
});

// ── The non-status ramps that share the palette ──────────────

test('task priority is a severity ramp, exhaustive over TaskPriority', () => {
  const priorities = ['urgent', 'high', 'medium', 'low'] as const satisfies readonly TaskPriority[];
  assert.deepEqual(Object.keys(TASK_PRIORITY_TONE).sort(), [...priorities].sort());
  assert.deepEqual(priorities.map(taskPriorityTone), ['rose', 'amber', 'peri', 'neutral']);
  assert.equal(taskPriorityTone('nonsense'), 'neutral');
  assert.equal(taskPriorityTone(null), 'neutral');
  // Priority is deliberately not reachable through the status lookup.
  assert.ok(!STATUS_DOMAINS.some((d) => statusesOf(d).includes('urgent')));
});

test('blocker and follow-up states are exhaustive and escalate in the right direction', () => {
  assert.deepEqual(Object.keys(BLOCKER_TONE).sort(), ['blocked', 'follow-through', 'stale']);
  assert.equal(BLOCKER_TONE.blocked, 'rose');
  assert.equal(BLOCKER_TONE.stale, 'rose');
  assert.equal(BLOCKER_TONE['follow-through'], 'amber');

  assert.deepEqual(Object.keys(DUE_STATE_TONE).sort(), ['due-soon', 'none', 'overdue', 'scheduled']);
  assert.deepEqual(
    (['none', 'scheduled', 'due-soon', 'overdue'] as const).map((s) => DUE_STATE_TONE[s]),
    ['neutral', 'mint', 'amber', 'rose'],
  );
});

test('dependency kinds are one map, not two that disagree', () => {
  assert.deepEqual(Object.keys(DEPENDENCY_KIND_TONE).sort(), [
    'blockedBy', 'blocks', 'related', 'sequenceAfter', 'sequenceBefore',
  ]);
  // A relationship is not an outcome: only the two that block anything are
  // coloured. `related` used to be mint on one page and grey on the other.
  assert.equal(DEPENDENCY_KIND_TONE.related, 'neutral');
  assert.equal(DEPENDENCY_KIND_TONE.sequenceAfter, DEPENDENCY_KIND_TONE.sequenceBefore);
});

test('an HTTP code agrees with the delivery status it sits beside', () => {
  assert.equal(httpStatusTone(200), statusTone('webhook-delivery', 'success'));
  assert.equal(httpStatusTone(204), 'mint');
  assert.equal(httpStatusTone(404), statusTone('webhook-delivery', 'failed'));
  assert.equal(httpStatusTone(500), 'rose');
  assert.equal(httpStatusTone(301), 'amber');
  assert.equal(httpStatusTone(null), 'neutral');
  assert.equal(httpStatusTone(0), 'neutral');
});

test('looseStatusTone consults every status domain, so a new one is not silently skipped', () => {
  // Every status of every lifecycle domain must be resolvable from its bare
  // word — except where `pending` shadows a peri one, which is the documented
  // precedence, not an omission.
  const shadowed = new Set(['webhook-delivery/pending']);
  const unreachable: string[] = [];
  for (const domain of STATUS_DOMAINS) {
    if (domain === 'message-type') continue;
    for (const status of statusesOf(domain)) {
      if (shadowed.has(`${domain}/${status}`)) continue;
      if (looseStatusTone(status) !== statusTone(domain, status)) {
        unreachable.push(`${domain}/${status}`);
      }
    }
  }
  assert.deepEqual(unreachable, []);
});
