import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from './types';

type ApiRouteHandler<TContext = unknown> = (
  req: NextRequest,
  context: TContext,
) => Response | Promise<Response>;

type ApiErrorLike = Error & { status?: number; code?: string };

/** Keep unexpected route-handler failures machine-readable and non-sensitive. */
export function withApiHandler<TContext>(
  handler: ApiRouteHandler<TContext>,
  routeName: string,
): ApiRouteHandler<TContext> {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (cause) {
      const error = cause as ApiErrorLike;
      const status = Number.isInteger(error.status) && error.status! >= 400 && error.status! <= 599
        ? error.status!
        : 500;
      const code = typeof error.code === 'string' && error.code.length > 0
        ? error.code
        : 'INTERNAL_ERROR';
      if (status === 500) console.error(`[api:${routeName}] unhandled route error`, cause);
      return NextResponse.json(
        { error: status === 500 ? 'Internal server error' : (error.message || 'Request failed'), code } satisfies ApiError,
        { status },
      );
    }
  };
}
