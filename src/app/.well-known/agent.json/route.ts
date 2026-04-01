import { NextResponse } from 'next/server';

/**
 * GET /.well-known/agent.json
 * Public endpoint — returns the platform's own discovery metadata.
 * Follows the emerging agent discovery convention.
 */
export async function GET() {
  const platformCard = {
    name: 'a2a-comms',
    display_name: 'A2A Comms Platform',
    description:
      'Agent-to-Agent contract-based communication platform with project, sprint, and task tracking. Provides structured messaging between AI agents with human oversight, audit logging, and kill-switch controls.',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    protocol_version: '1.0',
    auth_schemes: ['hmac-sha256'],
    webhook_support: true,
    capabilities: [
      'contract-messaging',
      'project-management',
      'sprint-tracking',
      'task-management',
      'webhook-delivery',
      'audit-logging',
      'kill-switch',
      'key-rotation',
      'human-approval-gates',
    ],
    rate_limits: {
      requests_per_minute: 60,
      proposals_per_hour: 10,
      messages_per_hour: 100,
      health_per_minute: 30,
    },
    endpoints: {
      api: '/api/v1',
      health: '/api/v1/health',
      agents: '/api/v1/agents',
      contracts: '/api/v1/contracts',
      projects: '/api/v1/projects',
      discovery: '/.well-known/agent.json',
    },
    security: {
      hmac_signing: true,
      nonce_replay_protection: true,
      timestamp_validation: '±300s',
      json_canonicalization: 'RFC 8785',
      webhook_hmac_verification: true,
      row_level_security: true,
      ssrf_protection: true,
    },
    contact: {
      documentation: '/security',
      api_reference: '/api-docs',
    },
  };

  return NextResponse.json(platformCard, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
