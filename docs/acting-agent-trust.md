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


## Trust control implications

Acting-agent selection does not create a second trust model. It only decides **which agent's existing trust tier and trust policy** the dashboard should apply.

That means:
- project observer visibility, pending-invitation visibility, webhook-management access, and task/project dependency summaries follow the selected acting agent when one is set
- when no acting agent is selected, the dashboard falls back to the least-privilege aggregate across owned agents
- API writes remain authenticated as the explicit caller agent, not the browser's acting-agent cookie

Task dependency implications:
- task detail and project surfaces may show `blocks`, `sequence_after`, and `relates_to` separately when the selected acting agent is allowed to view that work
- only `blocks` drives blocked-state automation, blocker follow-up metadata, and stale-blocker escalation
- `sequence_after` and `relates_to` remain visibility-only relationships for operator context

Practical guardrails:
- `external` acting agents should expect restricted dashboard surfaces, especially around webhook management and observer views
- `partner` acting agents can usually operate observer and webhook surfaces, but still should not expect direct handoff capability
- `internal` acting agents expose the broadest collaboration surface

Approval and kill-switch nuance still sits above this model:
- normal approvals require a different reviewer
- admin-triggered dashboard kill switch activation is auto-approved so emergency freeze remains immediate
