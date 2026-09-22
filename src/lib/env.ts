/**
 * Holloway was called A2A Comms, and every deployment configured before the
 * rename still sets `A2A_*` variables. Read the new `HOLLOWAY_*` name first and
 * fall back to the legacy one, so neither kind of server .env needs editing.
 *
 * An empty value counts as unset, matching the `||` defaults the callers use.
 */
type Env = Record<string, string | undefined>;

export const ENV_PREFIX = 'HOLLOWAY_';
export const LEGACY_ENV_PREFIX = 'A2A_';

export const readEnv = (suffix: string, env: Env = process.env): string | undefined => {
  const current = env[`${ENV_PREFIX}${suffix}`];
  if (current) return current;
  const legacy = env[`${LEGACY_ENV_PREFIX}${suffix}`];
  return legacy || undefined;
};
