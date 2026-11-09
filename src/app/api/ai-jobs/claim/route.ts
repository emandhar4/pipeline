import { claimSchema } from '@/lib/ai/types';
import { authorize, claimJobs } from '@/lib/ai/worker';

// Exception to "every route handler calls getCurrentUser()": the caller is the AI worker, not a user; the bearer token is the auth.

const error = (code: string, status: number) => Response.json({ error: code }, { status });

/** POST {limit?: 1..10} → {jobs: ScoreFitJob[]}. Bearer AI_WORKER_TOKEN; 404 when the token env var is unset. */
export async function POST(request: Request) {
  try {
    const auth = authorize(request.headers.get('authorization'));
    if (auth === 'disabled') return error('not_found', 404);
    if (auth !== 'ok') return error('unauthorized', 401);

    let body: unknown;
    try {
      const text = await request.text();
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      return error('bad_request', 400);
    }
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) return error('bad_request', 400);

    const jobs = await claimJobs(parsed.data.limit);
    return Response.json({ jobs });
  } catch (err) {
    console.error('[ai-jobs/claim] failed', err instanceof Error ? err.message : 'unknown error');
    return error('server_error', 500);
  }
}
