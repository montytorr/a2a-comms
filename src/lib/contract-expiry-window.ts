import type { ApiError } from '@/lib/types';

/**
 * `expires_in_hours` arrives from a client and is multiplied straight into
 * `Date.now()`. A non-numeric or absurd value made `new Date(NaN)`, and
 * `.toISOString()` on that throws `RangeError: Invalid time value` — thrown out
 * of a route handler with no try/catch and no error boundary behind it, so the
 * caller got a bare 500 with an empty body for what is entirely its own bad
 * input. On task creation the task row was already inserted by then, leaving a
 * half-created task with no contract.
 *
 * So the window is checked before anything is written, and the rejection names
 * the field and the range — an agent told only "invalid" has no next step.
 */

/** Matches the documented default in AGENTS.md (7 days). */
export const DEFAULT_CONTRACT_EXPIRY_HOURS = 168;

/**
 * 365 days. Nothing in the schema caps `contracts.expires_at`, so this is a
 * sanity bound rather than a product rule: the sweep in
 * scripts/contract-expiry-sweep.sh only ever closes a contract whose
 * `expires_at` has passed, so a contract dated centuries out is one the sweep
 * can never reach. Set far above every horizon the codebase actually uses (the
 * 168h contract default, the 7-day project-invitation TTL) so it refuses the
 * nonsense without refusing a long-running collaboration.
 */
export const MAX_CONTRACT_EXPIRY_HOURS = 8760;

export type ExpiryWindowCheck =
  | { ok: true; hours: number }
  | { ok: false; status: number; body: ApiError };

/**
 * Validate `expires_in_hours` and return the number to use.
 *
 * `field` is the caller's path to the value (`handoff_contract.expires_in_hours`
 * and so on) so the message points at the field the sender actually wrote.
 *
 * A numeric string is accepted because the old arithmetic coerced one silently
 * and clients may already be sending `"48"`; narrowing that here would break
 * them in the name of fixing a crash.
 */
export function validateExpiresInHours(input: unknown, field = 'expires_in_hours'): ExpiryWindowCheck {
  if (input === undefined || input === null) return { ok: true, hours: DEFAULT_CONTRACT_EXPIRY_HOURS };

  let hours: number;
  if (typeof input === 'number') {
    hours = input;
  } else if (typeof input === 'string' && input.trim().length > 0) {
    hours = Number(input);
  } else {
    return invalid(field);
  }

  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_CONTRACT_EXPIRY_HOURS) return invalid(field);

  return { ok: true, hours };
}

function invalid(field: string): ExpiryWindowCheck {
  return {
    ok: false,
    status: 400,
    body: {
      error: `${field} must be a positive number of hours, at most ${MAX_CONTRACT_EXPIRY_HOURS} (365 days). Omit it for the default of ${DEFAULT_CONTRACT_EXPIRY_HOURS} (7 days).`,
      code: 'VALIDATION_ERROR',
    },
  };
}
