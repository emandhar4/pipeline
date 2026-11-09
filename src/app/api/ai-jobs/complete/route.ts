import { completeSchema } from '@/lib/ai/types';
import { authorize, completeJob } from '@/lib/ai/worker';

// Exception to "every route handler calls getCurrentUser()": the caller is the AI worker, not a user; the bearer token is the auth.

const error = (code: string, status: number) => Response.json({ error: code }, { status });

/**
 * POST {id, score: 1..10, reason ≤ 200} or {id, error ≤ 500} → {ok: true}.
 * 404 for an unknown id (or when the token env var is unset), 409 when the job is not claimed.
 */
export async function POST(request: Request) {
  try {
    const auth = authorize(request.headers.get('authorization'));
    if (auth === 'disabled') return error('not_found', 404);
    if (auth !== 'ok') return error('unauthorized', 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error('bad_request', 400);
    }
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) return error('bad_request', 400);

    const result = await completeJob(parsed.data);
    if (result === 'not_found') return error('not_found', 404);
    if (result === 'not_claimed') return error('not_claimed', 409);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[ai-jobs/complete] failed', err instanceof Error ? err.message : 'unknown error');
    return error('server_error', 500);
  }
}
