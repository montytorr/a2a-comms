import { deliverWebhooks } from '@/lib/webhooks';
import { createServerClient } from '@/lib/supabase/server';

export type ContractAsyncSignal = 'pending-approval' | 'waiting' | 'blocked' | 'completed';

export async function notifyContractMessageSignals(input: {
  contractId: string;
  senderId: string;
  senderName: string;
  messageType: string;
  content: Record<string, unknown>;
  turn: number;
  turnsRemaining: number;
  maxTurns: number;
}) {
  const signals = extractSignals(input.content);
  if (signals.length === 0) return;

  const supabase = createServerClient();
  const { data: participants } = await supabase
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', input.contractId)
    .neq('agent_id', input.senderId);

  const recipientIds = (participants || []).map((p) => p.agent_id);
  if (recipientIds.length === 0) return;

  await Promise.all(
    signals.map((signal) =>
      deliverWebhooks(recipientIds, {
        event: 'message',
        contract_id: input.contractId,
        data: {
          sender: input.senderName,
          message_type: input.messageType,
          turn: input.turn,
          turns_remaining: input.turnsRemaining,
          max_turns: input.maxTurns,
          attention: signal,
          async_completion: signal === 'completed',
        },
        timestamp: new Date().toISOString(),
      }).catch(() => {})
    )
  );
}

function extractSignals(content: Record<string, unknown>): ContractAsyncSignal[] {
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
