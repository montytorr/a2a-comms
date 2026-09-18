/**
 * Reading the pulse. Server only — it opens a database connection, so importing
 * it from a client component would bundle `pg` for the browser.
 */

import { createServerClient } from '@/lib/supabase/server';
import { PULSE_KEYS, PULSE_UNAVAILABLE, type Pulse } from '@/lib/pulse';

let cached: { at: number; pulse: Pulse } | null = null;
/** Every connected tab asks; they should not each cost a query. */
const CACHE_MS = 1000;

export async function readPulse(now: number = Date.now()): Promise<Pulse> {
  if (cached && now - cached.at < CACHE_MS) return cached.pulse;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('a2a_pulse');
    if (error || !data || typeof data !== 'object') return PULSE_UNAVAILABLE;
    const pulse = data as Pulse;
    // A reading missing every key is a shape we do not recognise; treating it
    // as real would make the next good reading look like a change everywhere.
    if (PULSE_KEYS.every((key) => pulse[key] === undefined)) return PULSE_UNAVAILABLE;
    cached = { at: now, pulse };
    return pulse;
  } catch {
    return PULSE_UNAVAILABLE;
  }
}

/** Test seam: the cache is process-wide and would otherwise leak between tests. */
export function resetPulseCache() {
  cached = null;
}
