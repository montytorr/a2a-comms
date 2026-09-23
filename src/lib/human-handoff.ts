/**
 * Noticing a message that hands the next move to a person without asking one.
 *
 * Contract 64345e47: at turn 3 an agent wrote "Next owner: Julien/Cal to
 * authorize a separate implementation scope" as ordinary prose. No question was
 * opened, so no person was notified and nothing in the dashboard could be
 * answered; the message was action-required, so the peer's reactor woke it just
 * to agree, and the same exchange happened again at turns 7 and 10.
 *
 * This is a hint, never a refusal. Plenty of legitimate messages carry
 * boilerplate like "Merge/deployment - Julien/Cal only", which names a person
 * without handing them the move. So the rules below only fire when a person is
 * named as the one who acts NEXT, or as the one whose decision is pending.
 *
 * Pure: the caller supplies the names of the humans and agents on the contract.
 */

/** Words that mean "a person" whoever the people on the contract are. */
const GENERIC_HUMAN = ['human', 'humans', 'operator', 'operators', 'person', 'people'];

/** What a person is being asked for, in the phrasings agents actually use. */
const DECISION = '(?:approval|decision|authori[sz]ation|authori[sz]e|sign-?off|go-?ahead|confirmation)';

/**
 * Words past which a "Next" value stops naming who owns the move and starts
 * describing it. Only the owner is checked, so "Next: clawclaw to review; merge
 * is Cal's call" is the agent's move, not Cal's.
 */
const OWNER_WINDOW = 4;

export interface HumanHandoffNames {
  /** Display names of the people who can act on the contract. */
  humans: string[];
  /** Names of the agents on it, which must never be mistaken for a person. */
  agents: string[];
}

export interface HumanHandoffDetection {
  detected: boolean;
  /** The line that triggered it, trimmed, for the hint. */
  evidence: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * "Julien Martin" is referred to as "Julien"; an email-shaped author name as
 * its local part. Anything that is also an agent name is dropped, because
 * treating an agent as a person is the one mistake this must not make.
 */
export function normalizeHumanNames(raw: Array<string | null | undefined>, agentNames: string[]): string[] {
  const agents = new Set(
    agentNames.flatMap((name) => name.toLowerCase().split(/[\s._-]+/)).filter(Boolean),
  );
  for (const name of agentNames) agents.add(name.toLowerCase());

  const names = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const base = value.includes('@') ? value.split('@')[0]! : value;
    const full = base.trim();
    if (full.length >= 2 && !agents.has(full.toLowerCase())) names.add(full);
    for (const part of full.split(/[\s._-]+/)) {
      if (part.length >= 2 && /^\p{L}+$/u.test(part) && !agents.has(part.toLowerCase())) names.add(part);
    }
  }
  return [...names];
}

function alternation(words: string[]): string | null {
  const unique = [...new Set(words.filter((word) => word.trim().length > 0))];
  if (unique.length === 0) return null;
  return unique
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
}

/** Index in `rules` of the "pending/awaiting a person's decision" rule. */
const PENDING_RULE = 1;
const STANDING_GATE = /\b(?:merge[sd]?|merging|unmerged|deploy(?:s|ed|ment)?|rollout|release)\b/i;

function stripMarkdown(line: string): string {
  return line
    .replace(/\*+|`|__|^[\s>#]+/g, ' ')
    .replace(/^\s*[-+]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cheap, name-free check the messages route runs first, so the database is only
 * asked for names when a message could plausibly be a handoff at all.
 */
export function mightHandToHuman(text: string): boolean {
  return (
    /(^|\n|[.;!?]\s+)[\s*_>#-]*next\b[^:\n]{0,20}[:\u2014\u2013]/i.test(text) ||
    /\bauthori[sz]e\b/i.test(text) ||
    new RegExp(`\\b(?:needs?|requires?|pending|awaiting|waiting (?:on|for))\\b[^.\\n]{0,40}\\b${DECISION}`, 'i').test(text)
  );
}

export function detectHumanHandoff(text: string, names: HumanHandoffNames): HumanHandoffDetection {
  const humanAlt = alternation([...GENERIC_HUMAN, ...names.humans]);
  const agentAlt = alternation(names.agents);
  if (!humanAlt) return { detected: false, evidence: null };

  const human = new RegExp(`\\b(?:${humanAlt})\\b`, 'i');
  const agent = agentAlt ? new RegExp(`\\b(?:${agentAlt})\\b`, 'i') : null;

  const rules: RegExp[] = [
    // "needs Cal's decision", "requires human approval", "needs operator sign-off"
    new RegExp(`\\b(?:needs?|requires?)\\s+(?:an?\\s+|the\\s+)?(?:${humanAlt})(?:'s)?\\s+${DECISION}`, 'i'),
    // "pending human decision", "awaiting Julien's go-ahead"
    new RegExp(`\\b(?:pending|awaiting|waiting (?:on|for))\\s+(?:an?\\s+|the\\s+)?(?:${humanAlt})(?:'s)?\\s+${DECISION}`, 'i'),
    // "Julien/Cal to authorize", "for the operator to authorise", and the
    // "Next: Julien/Cal authorize this fix scope" of 64345e47 turn 10
    new RegExp(`\\b(?:${humanAlt})\\b[^.;\\n]{0,30}\\b(?:to\\s+)?authori[sz]e\\b`, 'i'),
  ];

  // Sentence by sentence, not line by line: agents that write one paragraph
  // put "Next owner: ..." mid-line (64345e47 turns 3 and 10), and the evidence
  // quoted back should be the handoff, not the whole paragraph.
  const sentences = text
    .split('\n')
    .flatMap((rawLine) => stripMarkdown(rawLine).split(/(?<=[.;!?])\s+(?=\S)/));
  for (const line of sentences) {
    if (!line) continue;

    const next = /^next\b(?:\s+(?:owner|move|step|action|up))?\s*[:—–-]\s*(.+)$/i.exec(line);
    if (next) {
      const owner = next[1]!.split(/\s+/).slice(0, OWNER_WINDOW).join(' ');
      const humanAt = owner.search(human);
      const agentAt = agent ? owner.search(agent) : -1;
      if (humanAt >= 0 && (agentAt < 0 || humanAt < agentAt)) {
        return { detected: true, evidence: line };
      }
    }

    // Merge and deploy gates are restated in nearly every review message
    // ("stays open and unmerged pending human decision"). That is a standing
    // rule, not a move being handed over, so a bare "pending ... decision" about
    // one does not count; an explicit request ("needs human approval before
    // merge") or a Next line still does.
    const gate = STANDING_GATE.test(line);
    if (rules.some((rule, index) => !(gate && index === PENDING_RULE) && rule.test(line))) {
      return { detected: true, evidence: line };
    }
  }
  return { detected: false, evidence: null };
}

/** What the messages response says, and the CLI prints, when a handoff is detected. */
export function humanHandoffHint(
  contractId: string,
  evidence: string | null,
  options: { peerWoken?: boolean } = {},
): string {
  const quoted = evidence ? ` ("${evidence.length > 120 ? `${evidence.slice(0, 117)}...` : evidence}")` : '';
  const woken = options.peerWoken === false ? '' : ', and your peer has been woken to reply to a move that is not theirs';
  return (
    `This message hands the next move to a person${quoted} but opened no question, so nobody has been notified${woken}. ` +
    `Ask the person now: holloway ask ${contractId} --kind blocked --body "<the exact decision needed>". ` +
    `Next time send it with --needs-human "<the decision>" (needs_human in the API), which asks and sends in one step without waking your peer.`
  );
}
