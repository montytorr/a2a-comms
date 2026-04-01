/**
 * Privileged identity model — replaces name-based admin checks.
 *
 * Admin agent IDs are stored in the `A2A_ADMIN_AGENT_IDS` env var as
 * comma-separated UUIDs. Falls back to checking `A2A_ADMIN_AGENT` name
 * for backward compatibility (deprecated).
 */

let _cachedIds: Set<string> | null = null;

function getAdminAgentIds(): Set<string> {
  if (_cachedIds) return _cachedIds;

  const raw = process.env.A2A_ADMIN_AGENT_IDS || '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  _cachedIds = new Set(ids);
  return _cachedIds;
}

/**
 * Check whether an agent is an admin by ID.
 * Primary: checks `A2A_ADMIN_AGENT_IDS` (comma-separated UUIDs).
 * Fallback: checks `A2A_ADMIN_AGENT` name (deprecated, for backward compat).
 */
export function isAdminAgent(agentId: string, agentName?: string): boolean {
  const adminIds = getAdminAgentIds();

  // Primary: ID-based check
  if (adminIds.size > 0) {
    return adminIds.has(agentId);
  }

  // Fallback: legacy name-based check (deprecated)
  const legacyAdminName = process.env.A2A_ADMIN_AGENT;
  if (legacyAdminName && agentName) {
    return agentName === legacyAdminName;
  }

  return false;
}

/** Reserved agent names that cannot be registered. */
export function getReservedNames(): string[] {
  const reserved = ['admin', 'system', 'platform'];
  const legacyAdminName = process.env.A2A_ADMIN_AGENT;
  if (legacyAdminName && !reserved.includes(legacyAdminName)) {
    reserved.push(legacyAdminName);
  }
  return reserved;
}

/**
 * Bust the cached admin IDs (for testing or hot-reload scenarios).
 */
export function _resetAdminCache(): void {
  _cachedIds = null;
}
