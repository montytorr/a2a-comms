import type { MessageType } from '@/lib/types';
import { consumesTurn } from '@/lib/types';

export type ContractAsyncSignal = 'pending-approval' | 'waiting' | 'blocked' | 'completed';

/** How the recipient should treat this message. `receipt` and `informational`
 *  mean no follow-up is owed; anything else is work. */
export type ContractAttention = ContractAsyncSignal | 'action-required' | 'receipt';

// Signals used to be delivered as one webhook per signal, on top of the
// message webhook the route already sent. A single message could therefore
// wake a recipient several times, and each wake looked like new work. They are
// now folded into the one message delivery.
const SIGNAL_PRIORITY: ContractAsyncSignal[] = ['blocked', 'pending-approval', 'waiting', 'completed'];

export function resolvePrimaryAttention(
  messageType: MessageType,
  signals: ContractAsyncSignal[],
): ContractAttention {
  if (!consumesTurn(messageType)) return 'receipt';
  for (const candidate of SIGNAL_PRIORITY) {
    if (signals.includes(candidate)) return candidate;
  }
  return 'action-required';
}

export function extractSignals(content: Record<string, unknown>): ContractAsyncSignal[] {
  const matches = new Set<ContractAsyncSignal>();

  walk(content, (key, value) => {
    const normalizedKey = key.toLowerCase().replace(/_/g, '-');
    const normalizedValue = typeof value === 'string' ? normalize(value) : null;

    if (normalizedKey === 'status' || normalizedKey.endsWith('-status') || normalizedKey === 'state' || normalizedKey.endsWith('-state')) {
      const signal = toSignal(normalizedValue);
      if (signal) matches.add(signal);
    }

    if (normalizedKey.includes('waiting') && truthy(value)) matches.add('waiting');
    if (normalizedKey.includes('blocked') && truthy(value)) matches.add('blocked');
    if (normalizedKey.includes('approval') && normalizedValue && normalizedValue.includes('pending')) matches.add('pending-approval');
    if (normalizedKey.includes('completed') && truthy(value)) matches.add('completed');
  });

  return [...matches];
}

function walk(value: unknown, visit: (key: string, value: unknown) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    visit(key, child);
    walk(child, visit);
  }
}

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/_/g, '-');
}

function toSignal(value: string | null): ContractAsyncSignal | null {
  if (!value) return null;
  if (value === 'pending-approval') return 'pending-approval';
  if (value === 'waiting') return 'waiting';
  if (value === 'blocked') return 'blocked';
  if (value === 'completed' || value === 'complete' || value === 'done' || value === 'succeeded' || value === 'success') return 'completed';
  return null;
}

function truthy(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = normalize(value);
    return normalized === 'true' || normalized === 'yes' || normalized === 'done' || normalized === 'completed' || normalized === 'blocked' || normalized === 'waiting';
  }
  return false;
}
