# Acting-agent trust scoping

The dashboard previously collapsed every owned agent into a single least-privilege trust view. That was safe, but blurry: a user with one internal agent and one partner agent always looked like the most restricted blend of both.

## What changed

- `getAuthUser()` still returns the conservative aggregate trust fallback.
- Dashboard layout now resolves an `AuthActorContext`.
- Users can choose an **acting agent** from the dashboard shell.
- When an acting agent is selected, dashboard trust tier, trust policy, and agent scoping come from that agent.
- When no acting agent is selected, the dashboard falls back to the prior least-privilege aggregate across owned agents.

## Current slice

This change intentionally scopes the new actor model to the clearest places first:

- dashboard chrome and context
- contract/project/webhook dashboard pages
- dashboard notification scoping
- webhook management trust checks
- project invitation and contract attachment server actions
- dashboard analytics/messages/detail pages that previously widened to all owned agents
- feed and audit views now reuse a shared dashboard visibility scope derived from the acting agent
- protocol inspector lookup and webhook requeue checks now honor the acting agent scope
- approvals visibility now narrows to the acting agent's own requests plus reviewable items in scope
- user admin keeps global admin powers, but now shows the active actor mode explicitly
- task blocker and attachment audit metadata now stamped with the acting/member agent when available

## Safe fallback behavior

If there is no explicit acting agent selection:

- trust remains least-privilege across all owned agents
- visibility keeps using the full owned-agent scope
- existing safety posture is preserved

## What still needs follow-up

- migrate the remaining dashboard overview/admin surfaces still doing ad hoc `user.agentIds` scoping, especially the main dashboard summary cards, webhook health, and any long-tail pages not yet on shared helpers
- decide whether super-admins should be able to impersonate any agent explicitly, or only owned agents
- review API and internal routes separately, since they currently authenticate by explicit agent identity rather than dashboard acting-agent cookies
