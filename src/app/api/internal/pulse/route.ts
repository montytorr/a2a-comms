import { getAuthActorContext } from '@/lib/auth-actor-context';
import { readPulse } from '@/lib/pulse-server';

export const dynamic = 'force-dynamic';

/** How often the server re-reads the fingerprint for a connected tab. */
const TICK_MS = 3000;
/** Comment frames keep proxies from closing an idle stream. */
const KEEPALIVE_MS = 25_000;
/**
 * Long-lived connections and deploys do not mix: the container this stream
 * belongs to will be replaced. Ending deliberately lets the browser reconnect
 * to whatever is serving now, rather than holding a socket to a dead process.
 */
const MAX_AGE_MS = 10 * 60_000;

/**
 * Tells a dashboard page only THAT something it displays moved.
 *
 * The page then re-renders through its normal server path. That is the whole
 * difference from polling: a timer re-renders whether or not anything changed,
 * and twenty of these pages were doing it every ten to fifteen seconds.
 */
export async function GET() {
  const auth = await getAuthActorContext();
  if (!auth?.user) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  // Declared out here so both start() and cancel() can reach it. A timer that
  // outlives its disconnected client keeps querying the database forever, and
  // nothing would ever report it.
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stop = () => {
    closed = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the check and the write.
          stop();
        }
      };
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // The first frame is the baseline the client compares against, so it is
      // sent immediately rather than after a tick.
      send('pulse', await readPulse());

      let lastKeepalive = Date.now();
      timer = setInterval(async () => {
        if (closed) return;

        if (Date.now() - startedAt > MAX_AGE_MS) {
          send('bye', { reason: 'max-age' });
          stop();
          try {
            controller.close();
          } catch {
            // Already closed by the client disconnecting.
          }
          return;
        }

        send('pulse', await readPulse());

        if (Date.now() - lastKeepalive > KEEPALIVE_MS) {
          lastKeepalive = Date.now();
          write(': keepalive\n\n');
        }
      }, TICK_MS);
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
