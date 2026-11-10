import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  },
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
// The token check is real; only the database work is mocked.
vi.mock('@/lib/ai/worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/worker')>();
  return { ...actual, claimJobs: vi.fn(), completeJob: vi.fn() };
});

import { POST as claim } from '@/app/api/ai-jobs/claim/route';
import { POST as complete } from '@/app/api/ai-jobs/complete/route';
import { claimJobs, completeJob } from '@/lib/ai/worker';
import { isPublic } from '@/lib/public-paths';

const TOKEN = 'a'.repeat(40);
const ID = '00000000-0000-4000-8000-000000000001';

function req(path: string, body: unknown, auth: string | null = `Bearer ${TOKEN}`): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== null) headers.authorization = auth;
  return new Request(`http://localhost/api/ai-jobs/${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv('AI_WORKER_TOKEN', TOKEN);
  vi.mocked(claimJobs).mockReset();
  vi.mocked(completeJob).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('worker routes: auth', () => {
  it('return 404 on both routes when the token env var is unset', async () => {
    vi.stubEnv('AI_WORKER_TOKEN', '');
    expect((await claim(req('claim', {}))).status).toBe(404);
    expect((await complete(req('complete', { id: ID, score: 5, reason: 'x' }))).status).toBe(404);
    expect(claimJobs).not.toHaveBeenCalled();
  });

  it('return 404 when the token env var is shorter than 32 characters', async () => {
    vi.stubEnv('AI_WORKER_TOKEN', 'short');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await claim(req('claim', {}, 'Bearer short'))).status).toBe(404);
  });

  it('return 401 without a token', async () => {
    expect((await claim(req('claim', {}, null))).status).toBe(401);
    expect((await complete(req('complete', { id: ID, score: 5, reason: 'x' }, null))).status).toBe(401);
    expect(claimJobs).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('return 401 with a wrong token, of equal or different length, or a non-Bearer scheme', async () => {
    expect((await claim(req('claim', {}, `Bearer ${'b'.repeat(40)}`))).status).toBe(401);
    expect((await claim(req('claim', {}, `Bearer ${TOKEN}x`))).status).toBe(401);
    expect((await claim(req('claim', {}, `Bearer ${TOKEN.slice(1)}`))).status).toBe(401);
    expect((await claim(req('claim', {}, `Basic ${TOKEN}`))).status).toBe(401);
    expect((await claim(req('claim', {}, TOKEN))).status).toBe(401);
    expect(claimJobs).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai-jobs/claim', () => {
  it('returns the claimed jobs, with the limit capped at 10', async () => {
    vi.mocked(claimJobs).mockResolvedValue([]);
    const res = await claim(req('claim', { limit: 25 }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ jobs: [] });
    expect(claimJobs).toHaveBeenCalledWith(10);
  });

  it('treats an empty body as the default limit', async () => {
    vi.mocked(claimJobs).mockResolvedValue([]);
    const res = await claim(req('claim', ''));
    expect(res.status).toBe(200);
    expect(claimJobs).toHaveBeenCalledWith(10);
  });

  it('returns 400 for a bad body', async () => {
    expect((await claim(req('claim', '{not json'))).status).toBe(400);
    expect((await claim(req('claim', { limit: 0 }))).status).toBe(400);
    expect((await claim(req('claim', { limit: 3, extra: true }))).status).toBe(400);
    expect(claimJobs).not.toHaveBeenCalled();
  });

  it('returns 500 without details when the worker throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(claimJobs).mockRejectedValue(new Error('secret detail'));
    const res = await claim(req('claim', {}));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret detail');
    expect(JSON.parse(text)).toEqual({ error: 'server_error' });
  });
});

describe('POST /api/ai-jobs/complete', () => {
  it('returns 200 when the job completes', async () => {
    vi.mocked(completeJob).mockResolvedValue('ok');
    const body = { id: ID, score: 8, reason: 'Primary field and a known pay.' };
    const res = await complete(req('complete', body));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(completeJob).toHaveBeenCalledWith(body);
  });

  it('returns 400 for a bad body', async () => {
    expect((await complete(req('complete', { id: ID, score: 11, reason: 'x' }))).status).toBe(400);
    expect((await complete(req('complete', { id: ID }))).status).toBe(400);
    expect((await complete(req('complete', 'nope'))).status).toBe(400);
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown id', async () => {
    vi.mocked(completeJob).mockResolvedValue('not_found');
    const res = await complete(req('complete', { id: ID, score: 5, reason: 'x' }));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'not_found' });
  });

  it('returns 409 for a job that is not claimed (e.g. done)', async () => {
    vi.mocked(completeJob).mockResolvedValue('not_claimed');
    const res = await complete(req('complete', { id: ID, error: 'Page would not load.' }));
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: 'not_claimed' });
  });
});

describe('proxy public paths', () => {
  it('lets the worker routes past the sign-in redirect, and nothing else under /api', () => {
    expect(isPublic('/api/ai-jobs/claim')).toBe(true);
    expect(isPublic('/api/ai-jobs/complete')).toBe(true);
    expect(isPublic('/api/other')).toBe(false);
    expect(isPublic('/api/ai-jobs')).toBe(false);
    expect(isPublic('/dashboard')).toBe(false);
    expect(isPublic('/login')).toBe(true);
    expect(isPublic('/auth/callback')).toBe(true);
  });
});
