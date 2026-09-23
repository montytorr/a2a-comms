/**
 * Linking one contract to another.
 *
 * Before this existed, contracts related to each other only as prose: a handoff
 * contract's description carried a `## Prior handoff contracts` section, and the
 * predecessors it listed were found by matching text against the title and the
 * description - both caller-supplied, and the description editable afterwards.
 * The chain lived in the two fields an operator is invited to overwrite.
 *
 * Every link is directional and reads "from <link_type> to":
 *
 *   continues     from carries on work that to left unfinished
 *   supersedes    from replaces to
 *   delegates_to  from handed execution onward to to
 *
 * The rules live here rather than at each call site so the agent-facing route
 * and the server-written handoff path cannot drift apart - the same reason
 * `contract-task-link.ts` exists.
 */

import { createServerClient } from '@/lib/db/server';
import type {
  ApiError,
  ContractLinkDirection,
  ContractLinkType,
  ContractStatus,
  RelatedContractSummary,
} from '@/lib/types';

export const CONTRACT_LINK_TYPES: readonly ContractLinkType[] = [
  'continues',
  'supersedes',
  'delegates_to',
] as const;

export const CONTRACT_LINK_NOTE_MAX = 500;

export function isContractLinkType(value: unknown): value is ContractLinkType {
  return typeof value === 'string' && (CONTRACT_LINK_TYPES as readonly string[]).includes(value);
}

/**
 * How a link reads from the end you are standing on. The outgoing phrasing is
 * the link type itself; the incoming phrasing is its passive, which is the only
 * way "delegates_to" makes sense on the receiving contract's page.
 */
export function describeContractLink(
  linkType: ContractLinkType,
  direction: ContractLinkDirection
): string {
  if (direction === 'outgoing') {
    return { continues: 'Continues', supersedes: 'Supersedes', delegates_to: 'Delegates to' }[linkType];
  }
  return { continues: 'Continued by', supersedes: 'Superseded by', delegates_to: 'Delegated from' }[linkType];
}

/** One line of guidance per link type, used by the CLI and the dashboard. */
export function contractLinkTypeHelp(linkType: ContractLinkType): string {
  return {
    continues:
      'This contract carries on work the other one left unfinished - it ran out of turns, expired, or a participant closed it.',
    supersedes:
      'This contract replaces the other one, which was rejected, cancelled, or agreed on terms that turned out to be wrong.',
    delegates_to:
      'This contract handed execution onward to the other one. Written automatically by the handoff and escalation paths.',
  }[linkType];
}

export interface LinkRefusal {
  status: number;
  body: ApiError;
}

function refuse(status: number, error: string, code: string, details?: string): LinkRefusal {
  return { status, body: { error, code, ...(details ? { details } : {}) } satisfies ApiError };
}

export interface ValidatedLinkRequest {
  toContractId: string;
  linkType: ContractLinkType;
  note: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isContractId = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value.trim());

/**
 * Validate a link request body. Refuses a self-link here as well as in the
 * database, so the caller gets a sentence rather than a constraint name.
 */
export function validateLinkRequest(
  fromContractId: string,
  input: unknown
): { ok: true; value: ValidatedLinkRequest } | ({ ok: false } & LinkRefusal) {
  const body = (input ?? {}) as Record<string, unknown>;

  const toContractId = typeof body.to_contract_id === 'string' ? body.to_contract_id.trim() : '';
  if (!UUID.test(toContractId)) {
    return {
      ok: false,
      ...refuse(
        400,
        'to_contract_id must be the UUID of the other contract.',
        'VALIDATION_ERROR'
      ),
    };
  }

  if (toContractId.toLowerCase() === fromContractId.toLowerCase()) {
    return {
      ok: false,
      ...refuse(400, 'A contract cannot be linked to itself.', 'CONTRACT_LINK_SELF'),
    };
  }

  if (!isContractLinkType(body.link_type)) {
    return {
      ok: false,
      ...refuse(
        400,
        `link_type must be one of: ${CONTRACT_LINK_TYPES.join(', ')}.`,
        'CONTRACT_LINK_TYPE_INVALID',
        CONTRACT_LINK_TYPES.map((type) => `${type} - ${contractLinkTypeHelp(type)}`).join(' ')
      ),
    };
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      return { ok: false, ...refuse(400, 'note must be a string.', 'VALIDATION_ERROR') };
    }
    const trimmed = body.note.trim();
    if (trimmed.length > CONTRACT_LINK_NOTE_MAX) {
      return {
        ok: false,
        ...refuse(
          400,
          `note must be ${CONTRACT_LINK_NOTE_MAX} characters or fewer. A link is a pointer, not a brief - put the detail in the contract description.`,
          'VALIDATION_ERROR'
        ),
      };
    }
    note = trimmed || null;
  }

  return { ok: true, value: { toContractId, linkType: body.link_type, note } };
}

interface RawLinkedContract {
  id?: string;
  title?: string | null;
  status?: string | null;
}

interface RawLinkRow {
  from_contract_id: string;
  to_contract_id: string;
  link_type: string;
  note: string | null;
  created_at: string;
  created_by_agent_id: string | null;
  from_contract?: RawLinkedContract | RawLinkedContract[] | null;
  to_contract?: RawLinkedContract | RawLinkedContract[] | null;
}

/** An embed comes back as an object or a one-element array; normalise both. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Turn a raw link row into the summary for one end of it.
 *
 * Returns null when the far contract did not come back - a deleted row races a
 * cascade, and a related contract with no title is worse than none.
 */
export function normalizeLinkRow(
  row: RawLinkRow,
  selfContractId: string
): RelatedContractSummary | null {
  if (!isContractLinkType(row.link_type)) return null;

  const outgoing = row.from_contract_id === selfContractId;
  const far = one(outgoing ? row.to_contract : row.from_contract);
  const farId = outgoing ? row.to_contract_id : row.from_contract_id;
  if (!far?.id || !far.title) return null;

  return {
    contract_id: farId,
    title: far.title,
    status: (far.status || 'closed') as ContractStatus,
    link_type: row.link_type,
    direction: outgoing ? 'outgoing' : 'incoming',
    note: row.note,
    linked_at: row.created_at,
    linked_by_agent_id: row.created_by_agent_id,
  };
}

/**
 * The `.or()` filter is built by string interpolation, so only well-formed
 * UUIDs are allowed through it. Every caller passes ids that came out of the
 * database, but that is a property of today's callers, not of this function.
 */
function safeIdList(contractIds: string[]): string | null {
  const clean = contractIds.filter((id) => UUID.test(id));
  return clean.length ? clean.join(',') : null;
}

const LINK_SELECT =
  'from_contract_id, to_contract_id, link_type, note, created_at, created_by_agent_id, ' +
  'from_contract:contracts!from_contract_id(id, title, status), ' +
  'to_contract:contracts!to_contract_id(id, title, status)';

async function participantRoles(
  contractIds: string[],
  agentId: string
): Promise<Map<string, string>> {
  const db = createServerClient();
  const { data: rows } = await db
    .from('contract_participants')
    .select('contract_id, role')
    .eq('agent_id', agentId)
    .in('contract_id', contractIds);

  return new Map((rows || []).map((row) => [row.contract_id, row.role as string]));
}

function notAParticipant(contractId: string, forWriting: boolean): LinkRefusal {
  return refuse(
    404,
    forWriting
      ? `Contract ${contractId} not found, or you are not a participant in it. Linking two contracts requires being a participant in both.`
      : `Contract ${contractId} not found, or you are not a participant in it.`,
    'NOT_FOUND'
  );
}

/**
 * Can this agent READ a contract's links?
 *
 * Participation in that one contract, and nothing more. Observers are
 * deliberately included: observing is reading, and the far end of each link is
 * only ever summarised - a title and a status the observer can already see on
 * the contract itself.
 *
 * This used to call the write check with the same id twice, which refused an
 * observer 403 with the message "Observers may read contract links but cannot
 * record them" - a refusal that asserted the opposite of what it was doing.
 */
export async function checkContractLinkReadAccess(
  contractId: string,
  agentId: string
): Promise<LinkRefusal | null> {
  const roles = await participantRoles([contractId], agentId);
  return roles.has(contractId) ? null : notAParticipant(contractId, false);
}

/**
 * Can this agent RECORD a link between these two contracts?
 *
 * Both ends, because asserting that one contract continues another is a claim
 * about both, and a pointer out of a contract you cannot read is not something
 * you are in a position to make. Observers are excluded on the same reasoning
 * as `contract-task-link.ts`: they inspect, they do not record.
 */
export async function checkContractLinkPermission(
  contractIds: readonly string[],
  agentId: string
): Promise<LinkRefusal | null> {
  const roles = await participantRoles([...contractIds], agentId);

  for (const contractId of contractIds) {
    const role = roles.get(contractId);
    if (role === undefined) return notAParticipant(contractId, true);
    if (role === 'observer') {
      return refuse(
        403,
        'Observers may read contract links but cannot record or remove them.',
        'FORBIDDEN'
      );
    }
  }

  return null;
}

/**
 * Insert the link. An identical link already present is success: the caller
 * asked for the two contracts to be related that way, and they are.
 */
export async function createContractLink(params: {
  fromContractId: string;
  toContractId: string;
  linkType: ContractLinkType;
  note?: string | null;
  createdByAgentId?: string | null;
}): Promise<LinkRefusal | null> {
  const db = createServerClient();
  const { error } = await db.from('contract_links').insert({
    from_contract_id: params.fromContractId,
    to_contract_id: params.toContractId,
    link_type: params.linkType,
    note: params.note ?? null,
    created_by_agent_id: params.createdByAgentId ?? null,
  });

  if (!error) return null;
  if (error.code === '23505') return null; // already linked - the desired state

  // The acyclicity trigger raises check_violation. Say what the caller did,
  // rather than handing back a trigger name.
  if (error.code === '23514' || /cycle/i.test(error.message || '')) {
    return refuse(
      409,
      'That link would create a cycle: the other contract already leads back to this one. All three link types mean one contract came after the other, so a loop cannot be true.',
      'CONTRACT_LINK_CYCLE'
    );
  }

  return refuse(500, 'Failed to link contracts', 'DB_ERROR');
}

/**
 * Remove a link, and say whether one was actually there.
 *
 * `removed: false` is not an error - the caller asked for the two contracts not
 * to be related that way, and they are not. But reporting it as a removal would
 * be announcing an outcome that did not happen, and a typo'd id would read as
 * success.
 */
export async function deleteContractLink(params: {
  fromContractId: string;
  toContractId: string;
  linkType: ContractLinkType;
}): Promise<{ ok: true; removed: boolean } | ({ ok: false } & LinkRefusal)> {
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_links')
    .delete()
    .eq('from_contract_id', params.fromContractId)
    .eq('to_contract_id', params.toContractId)
    .eq('link_type', params.linkType)
    .select('id');

  if (error) return { ok: false, ...refuse(500, 'Failed to unlink contracts', 'DB_ERROR') };
  return { ok: true, removed: (data || []).length > 0 };
}

/** Both directions for one contract, newest link first. */
export async function getRelatedContracts(contractId: string): Promise<RelatedContractSummary[]> {
  const db = createServerClient();
  const { data } = await db
    .from('contract_links')
    .select(LINK_SELECT)
    .or(`from_contract_id.eq.${contractId},to_contract_id.eq.${contractId}`)
    .order('created_at', { ascending: false });

  return ((data || []) as RawLinkRow[])
    .map((row) => normalizeLinkRow(row, contractId))
    .filter((summary): summary is RelatedContractSummary => summary !== null);
}

/**
 * Related contracts for many contracts at once, keyed by contract id.
 *
 * One query for a whole list. The contracts list endpoint enriches every row,
 * so a per-row lookup here would be a hundred extra round trips on a full page.
 */
export async function getRelatedContractsForContracts(
  contractIds: string[]
): Promise<Map<string, RelatedContractSummary[]>> {
  const out = new Map<string, RelatedContractSummary[]>();
  if (contractIds.length === 0) return out;

  const db = createServerClient();
  const list = safeIdList(contractIds);
  if (!list) return out;
  const { data } = await db
    .from('contract_links')
    .select(LINK_SELECT)
    .or(`from_contract_id.in.(${list}),to_contract_id.in.(${list})`)
    .order('created_at', { ascending: false });

  const wanted = new Set(contractIds);
  for (const row of (data || []) as RawLinkRow[]) {
    for (const end of [row.from_contract_id, row.to_contract_id]) {
      if (!wanted.has(end)) continue;
      const summary = normalizeLinkRow(row, end);
      if (!summary) continue;
      const bucket = out.get(end);
      if (bucket) bucket.push(summary);
      else out.set(end, [summary]);
    }
  }

  return out;
}

/**
 * Which of these contracts already sit on a delegation chain with each other.
 *
 * This is the structured replacement for the title/description heuristic that
 * used to decide what counted as a prior handoff. Once a chain has one link in
 * it, retitling a contract or rewriting its description can no longer drop it
 * out of the chain.
 */
export async function getDelegationMembers(contractIds: string[]): Promise<Set<string>> {
  const members = new Set<string>();
  const list = safeIdList(contractIds);
  if (!list) return members;

  const db = createServerClient();
  const { data } = await db
    .from('contract_links')
    .select('from_contract_id, to_contract_id')
    .eq('link_type', 'delegates_to')
    .or(`from_contract_id.in.(${list}),to_contract_id.in.(${list})`);

  const wanted = new Set(contractIds);
  for (const row of (data || []) as Array<{ from_contract_id: string; to_contract_id: string }>) {
    for (const end of [row.from_contract_id, row.to_contract_id]) {
      if (wanted.has(end)) members.add(end);
    }
  }

  return members;
}

export interface ChainCandidate {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  created_at?: string | null;
}

/**
 * The prior contracts in a handoff or escalation chain, oldest first.
 *
 * A contract qualifies if it is already on the chain by link, or if the legacy
 * text heuristic recognises it. The heuristic stays because every contract
 * created before `contract_links` existed has no link to be found by - but it
 * is now the fallback rather than the mechanism.
 */
export async function resolveChainPredecessors(
  candidates: ChainCandidate[],
  matchesLegacy: (contract: { title: string; description: string | null }) => boolean
): Promise<ChainCandidate[]> {
  const linked = await getDelegationMembers(candidates.map((candidate) => candidate.id));

  return candidates
    .filter(
      (candidate) =>
        linked.has(candidate.id) ||
        matchesLegacy({ title: candidate.title, description: candidate.description ?? null })
    )
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

/**
 * Record that an existing contract handed execution onward to a new one.
 *
 * Non-fatal by design: a handoff contract that exists without its chain link is
 * worse documented, but a handoff that failed outright because a metadata row
 * would not insert is worse still. The caller is told which predecessor was
 * linked so the outcome lands in the task checkpoint rather than nowhere.
 */
export async function recordDelegation(params: {
  predecessor: ChainCandidate | null;
  newContractId: string;
  taskId: string;
  agentId: string;
}): Promise<string | null> {
  if (!params.predecessor) return null;

  const failure = await createContractLink({
    fromContractId: params.predecessor.id,
    toContractId: params.newContractId,
    linkType: 'delegates_to',
    note: `Execution chain on task ${params.taskId}`,
    createdByAgentId: params.agentId,
  }).catch(() => ({ status: 500 }) as LinkRefusal);

  return failure ? null : params.predecessor.id;
}
