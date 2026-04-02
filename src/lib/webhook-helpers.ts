/**
 * Shared webhook delivery helpers.
 * Framework-agnostic — no Next.js imports.
 * Used by both the main app (webhooks.ts) and the standalone retry worker.
 */

// Optional security event logging — callers can provide their own logger.
// The main app injects real loggers; the standalone worker skips DB logging.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (...args: any[]) => any;

let _logWebhookDelivery: LogFn = () => {};
let _logWebhookDisabled: LogFn = () => {};

export function setWebhookLoggers(opts: {
  logDelivery?: LogFn;
  logDisabled?: LogFn;
}) {
  if (opts.logDelivery) _logWebhookDelivery = opts.logDelivery;
  if (opts.logDisabled) _logWebhookDisabled = opts.logDisabled;
}

export const MAX_RETRIES = 5;
export const RETRY_DELAY_MS = 5000;
export const REQUEST_TIMEOUT_MS = 10_000;

export interface WebhookRecord {
  id: string;
  agent_id: string;
  url: string;
  secret: string;
  failure_count: number;
  is_active: boolean;
}

interface SendWebhookRequestParams {
  deliveryId: string;
  url: string;
  eventName: string;
  timestamp: string;
  signature: string;
  payload: string;
}

interface SendWebhookResult {
  ok: boolean;
  responseStatus: number;
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function sendWebhookRequest(params: SendWebhookRequestParams): Promise<SendWebhookResult> {
  try {
    const resp = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': params.signature,
        'X-Webhook-Signature-Version': 'v1',
        'X-Webhook-Event': params.eventName,
        'X-Webhook-Timestamp': params.timestamp,
        'X-Webhook-Delivery-Id': params.deliveryId,
      },
      body: params.payload,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
    });

    if (resp.status >= 300 && resp.status < 400) {
      return { ok: false, responseStatus: resp.status, reason: `Redirect ${resp.status}` };
    }

    if (resp.ok) {
      return { ok: true, responseStatus: resp.status };
    }

    return { ok: false, responseStatus: resp.status, reason: `HTTP ${resp.status}` };
  } catch {
    return { ok: false, responseStatus: 0, reason: 'Network error' };
  }
}

export async function incrementFailure(supabase: SupabaseClient, wh: WebhookRecord) {
  const newCount = (wh.failure_count || 0) + 1;
  const willDisable = newCount >= 10;
  await supabase
    .from('webhooks')
    .update({
      failure_count: newCount,
      is_active: !willDisable,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wh.id);

  if (willDisable && wh.is_active) {
    try { _logWebhookDisabled(wh.id, wh.agent_id, wh.url, newCount); } catch { /* best effort */ }
  }
}

export async function resetWebhookFailureState(supabase: SupabaseClient, webhookId: string) {
  await supabase
    .from('webhooks')
    .update({
      last_delivery_at: new Date().toISOString(),
      failure_count: 0,
    })
    .eq('id', webhookId);
}

export async function markDeliverySuccess(supabase: SupabaseClient, deliveryId: string, responseStatus: number) {
  await supabase
    .from('webhook_deliveries')
    .update({
      status: 'success',
      response_status: responseStatus,
      delivered_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);
}

export async function markDeliveryFailed(supabase: SupabaseClient, deliveryId: string, responseStatus: number) {
  await supabase
    .from('webhook_deliveries')
    .update({
      status: 'failed',
      response_status: responseStatus || null,
      delivered_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);
}

export function getDeliveryLogger() { return _logWebhookDelivery; }
