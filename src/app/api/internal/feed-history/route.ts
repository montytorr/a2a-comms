import { NextResponse } from 'next/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import { createServerClient } from '@/lib/db/server';

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const auth = await getAuthActorContext();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rawPage = Number(new URL(request.url).searchParams.get('page') || 0) || 0;
  const page = Math.max(0, Math.min(100, rawPage));
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  // Scope building and the three feed queries all throw on their own. This route
  // backs a dashboard panel, and an uncaught throw here is a bare 500 with an
  // empty body — the panel goes blank with nothing for the user or the log to go on.
  try {
    const scope = await buildDashboardVisibilityScope(auth);
    const db = createServerClient();
    let agentNames = scope.contractActorNames;
    if (!auth.user.isSuperAdmin && auth.agentScope.length > 0) {
      const { data, error } = await db.from('agents').select('name').in('id', auth.agentScope);
      // This lookup builds the audit filter, so a swallowed error is not an empty
      // result — it is a narrower feed. The user would be shown audit history with
      // their agents' entries missing, indistinguishable from a quiet period, and
      // nothing in the log would say why. Fail the way the feed queries below do.
      if (error) {
        console.error('[feed-history] could not resolve agent scope names', error);
        return NextResponse.json({ error: 'Feed history unavailable' }, { status: 500 });
      }
      agentNames = [...new Set([...(data || []).map((row) => row.name), auth.user.displayName])];
    }

    let auditQuery = db.from('audit_log').select('*').order('created_at', { ascending: false }).range(from, to);
    let messagesQuery = db.from('messages').select('*, sender:agents!messages_sender_id_fkey(name, display_name)').order('created_at', { ascending: false }).range(from, to);
    let contractsQuery = db.from('contracts').select('*, proposer:agents!contracts_proposer_id_fkey(name, display_name)').order('updated_at', { ascending: false }).range(from, to);
    if (!auth.user.isSuperAdmin) {
      messagesQuery = scope.contractIds.length ? messagesQuery.in('contract_id', scope.contractIds) : messagesQuery.eq('contract_id', '00000000-0000-0000-0000-000000000000');
      contractsQuery = scope.contractIds.length ? contractsQuery.in('id', scope.contractIds) : contractsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
      auditQuery = agentNames.length ? auditQuery.in('actor', agentNames) : auditQuery.eq('actor', '__none__');
    }
    const [audit, messages, contracts] = await Promise.all([auditQuery, messagesQuery, contractsQuery]);
    const error = audit.error || messages.error || contracts.error;
    if (error) {
      console.error('[feed-history]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ audit: audit.data || [], messages: messages.data || [], contracts: contracts.data || [] });
  } catch (error) {
    console.error('[feed-history]', error);
    return NextResponse.json({ error: 'Feed history unavailable' }, { status: 500 });
  }
}
