# Trust-tier administration

Trust tiers are human security judgements. Production deliberately leaves
`A2A_ADMIN_AGENT_IDS` and the deprecated `A2A_ADMIN_AGENT` unset, so no agent
can change another agent's tier through the API. Tier changes are performed
through the authenticated human dashboard only.

This is intentional: granting an agent admin identity would give its service
key the power to grant trust tiers, which is a larger capability than the
automation currently needs. If that policy changes, configure a named admin
agent deliberately, document the owner and rotation plan, and add an audit
test before enabling it.

Project observer access is also not a download bypass. Contract participation
does not override the observer attachment-download policy; accepted contract
participants without a project observer record can still access contract-only
attachments.
