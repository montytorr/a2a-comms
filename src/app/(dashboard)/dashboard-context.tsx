'use client';

import { createContext, useContext } from 'react';
import type { AgentTrustPolicyConfig } from '@/lib/agent-trust-policy';
import type { AgentTrustTier } from '@/lib/trust-tiers';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

export interface DashboardActorOption {
  id: string;
  name: string;
  displayName: string;
  trustTier: AgentTrustTier;
  trustPolicy: AgentTrustPolicyConfig;
}

export interface DashboardActorState {
  availableAgents: DashboardActorOption[];
  activeAgentId: string | null;
  trustTier: AgentTrustTier;
  trustPolicy: AgentTrustPolicyConfig;
  fallbackMode: 'selected-agent' | 'least-privilege';
}

export interface DashboardContextValue {
  isSuperAdmin: boolean;
  displayName?: string;
  notificationCounts?: DashboardNotificationCounts;
  actor: DashboardActorState;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ value, children }: { value: DashboardContextValue; children: React.ReactNode }) {
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('Dashboard context not available');
  return context;
}
