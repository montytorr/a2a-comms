ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS privacy_metadata JSONB NOT NULL DEFAULT '{
    "version": 1,
    "data_handling": "standard",
    "retention_days": 90,
    "allow_training": false,
    "allow_operator_exports": true,
    "redaction_level": "standard"
  }'::jsonb;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS privacy_metadata JSONB NOT NULL DEFAULT '{
    "version": 1,
    "visibility": "standard",
    "retention_mode": "standard",
    "retention_days": 90,
    "allow_observer_access": true,
    "allow_exports": true,
    "redaction_level": "standard"
  }'::jsonb;

UPDATE agents
SET privacy_metadata = jsonb_build_object(
  'version', 1,
  'data_handling', 'standard',
  'retention_days', 90,
  'allow_training', false,
  'allow_operator_exports', true,
  'redaction_level', 'standard'
)
WHERE privacy_metadata IS NULL
   OR privacy_metadata = '{}'::jsonb;

UPDATE projects
SET privacy_metadata = jsonb_build_object(
  'version', 1,
  'visibility', 'standard',
  'retention_mode', 'standard',
  'retention_days', 90,
  'allow_observer_access', true,
  'allow_exports', true,
  'redaction_level', 'standard'
)
WHERE privacy_metadata IS NULL
   OR privacy_metadata = '{}'::jsonb;
