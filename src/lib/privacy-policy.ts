import type { AgentPrivacyMetadata, ProjectPrivacyMetadata } from '@/lib/types';

export const DEFAULT_AGENT_PRIVACY_METADATA: Required<AgentPrivacyMetadata> = {
  version: 1,
  data_handling: 'standard',
  retention_days: 90,
  allow_training: false,
  allow_operator_exports: true,
  redaction_level: 'standard',
};

export const DEFAULT_PROJECT_PRIVACY_METADATA: Required<ProjectPrivacyMetadata> = {
  version: 1,
  visibility: 'standard',
  retention_mode: 'standard',
  retention_days: 90,
  allow_observer_access: true,
  allow_exports: true,
  redaction_level: 'standard',
};

function clampRetentionDays(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(3650, Math.max(1, Math.round(value)));
}

function clampEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeAgentPrivacyMetadata(raw: unknown): Required<AgentPrivacyMetadata> {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as AgentPrivacyMetadata;

  return {
    version: 1,
    data_handling: clampEnum(candidate.data_handling, ['standard', 'confidential', 'restricted'], DEFAULT_AGENT_PRIVACY_METADATA.data_handling),
    retention_days: clampRetentionDays(candidate.retention_days, DEFAULT_AGENT_PRIVACY_METADATA.retention_days),
    allow_training: typeof candidate.allow_training === 'boolean' ? candidate.allow_training : DEFAULT_AGENT_PRIVACY_METADATA.allow_training,
    allow_operator_exports: typeof candidate.allow_operator_exports === 'boolean' ? candidate.allow_operator_exports : DEFAULT_AGENT_PRIVACY_METADATA.allow_operator_exports,
    redaction_level: clampEnum(candidate.redaction_level, ['standard', 'enhanced', 'strict'], DEFAULT_AGENT_PRIVACY_METADATA.redaction_level),
  };
}

export function normalizeProjectPrivacyMetadata(raw: unknown): Required<ProjectPrivacyMetadata> {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as ProjectPrivacyMetadata;

  return {
    version: 1,
    visibility: clampEnum(candidate.visibility, ['standard', 'confidential', 'restricted'], DEFAULT_PROJECT_PRIVACY_METADATA.visibility),
    retention_mode: clampEnum(candidate.retention_mode, ['standard', 'short', 'strict'], DEFAULT_PROJECT_PRIVACY_METADATA.retention_mode),
    retention_days: clampRetentionDays(candidate.retention_days, DEFAULT_PROJECT_PRIVACY_METADATA.retention_days),
    allow_observer_access: typeof candidate.allow_observer_access === 'boolean' ? candidate.allow_observer_access : DEFAULT_PROJECT_PRIVACY_METADATA.allow_observer_access,
    allow_exports: typeof candidate.allow_exports === 'boolean' ? candidate.allow_exports : DEFAULT_PROJECT_PRIVACY_METADATA.allow_exports,
    redaction_level: clampEnum(candidate.redaction_level, ['standard', 'enhanced', 'strict'], DEFAULT_PROJECT_PRIVACY_METADATA.redaction_level),
  };
}

export function summarizeProjectPrivacy(metadata: Required<ProjectPrivacyMetadata>) {
  return {
    visibilityLabel: metadata.visibility[0].toUpperCase() + metadata.visibility.slice(1),
    retentionLabel: `${metadata.retention_days}d`,
    observerMode: metadata.allow_observer_access ? 'Allowed' : 'Restricted',
    exportMode: metadata.allow_exports ? 'Allowed' : 'Restricted',
    redactionLabel: metadata.redaction_level[0].toUpperCase() + metadata.redaction_level.slice(1),
  };
}
