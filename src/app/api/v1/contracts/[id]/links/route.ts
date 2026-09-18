import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import {
  checkContractLinkPermission,
  checkContractLinkReadAccess,
  createContractLink,
  deleteContractLink,
  getRelatedContracts,
  isContractLinkType,
  validateLinkRequest,
} from '@/lib/contract-links';
import type { ApiError, RelatedContractSummary } from '@/lib/types';

interface LinksResponse {
  contract_id: string;
  related_contracts: RelatedContractSummary[];
  /** DELETE only: whether a link was actually there to remove. */
  removed?: boolean;
}

/**
 * Contract-to-contract links.
 *
 * A link is metadata, not a turn: recording one costs nothing from the contract
 * budget and is allowed at any status, including closed. Succession is the main
 * reason this exists, and by the time a contract needs a successor it has
 * usually already ended.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  // Reading a contract's links requires being a participant in the contract
  // itself; the far end of each link is only summarised, never read out.
  // Observers included - observing is reading.
  const refusal = await checkContractLinkReadAccess(id, auth.agent.id);
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  return NextResponse.json({
    contract_id: id,
    related_contracts: await getRelatedContracts(id),
  } satisfies LinksResponse);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  const request = validateLinkRequest(id, parsed);
  if (!request.ok) return NextResponse.json(request.body, { status: request.status });

  const permission = await checkContractLinkPermission([id, request.value.toContractId], auth.agent.id);
  if (permission) return NextResponse.json(permission.body, { status: permission.status });

  const failure = await createContractLink({
    fromContractId: id,
    toContractId: request.value.toContractId,
    linkType: request.value.linkType,
    note: request.value.note,
    createdByAgentId: auth.agent.id,
  });
  if (failure) return NextResponse.json(failure.body, { status: failure.status });

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.linked',
    resourceType: 'contract',
    resourceId: id,
    details: {
      to_contract_id: request.value.toContractId,
      link_type: request.value.linkType,
      note: request.value.note,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(
    { contract_id: id, related_contracts: await getRelatedContracts(id) } satisfies LinksResponse,
    { status: 201 }
  );
}

/**
 * Remove a link. Both ids and the type are required: the same pair of contracts
 * can legitimately carry more than one edge, and an unlink that guessed which
 * one was meant would sometimes guess wrong.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;
  const url = new URL(req.url);

  let parsed: Record<string, unknown> = {};
  if (body) {
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  const toContractId =
    (typeof parsed.to_contract_id === 'string' ? parsed.to_contract_id : null) ||
    url.searchParams.get('to_contract_id') ||
    '';
  const linkType =
    (typeof parsed.link_type === 'string' ? parsed.link_type : null) ||
    url.searchParams.get('link_type') ||
    '';

  if (!toContractId || !isContractLinkType(linkType)) {
    return NextResponse.json(
      {
        error: 'to_contract_id and link_type are both required to remove a link.',
        code: 'VALIDATION_ERROR',
      } satisfies ApiError,
      { status: 400 }
    );
  }

  const permission = await checkContractLinkPermission([id, toContractId], auth.agent.id);
  if (permission) return NextResponse.json(permission.body, { status: permission.status });

  const outcome = await deleteContractLink({
    fromContractId: id,
    toContractId,
    linkType,
  });
  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });

  // Only audit a removal that removed something. An entry for a no-op reads, a
  // month later, as a link that once existed.
  if (outcome.removed) {
    await auditLog({
      actor: auth.agent.name,
      action: 'contract.unlinked',
      resourceType: 'contract',
      resourceId: id,
      details: { to_contract_id: toContractId, link_type: linkType },
      ipAddress: getClientIp(req),
    });
  }

  return NextResponse.json({
    contract_id: id,
    removed: outcome.removed,
    related_contracts: await getRelatedContracts(id),
  } satisfies LinksResponse);
}
