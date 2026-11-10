import 'server-only';
import { z } from 'zod';
import { formatEnvError, type PublicEnv } from './env-schema';
import { publicEnv } from './env';

const serverSchema = z.object({ SUPABASE_SECRET_KEY: z.string().min(1) });

export type ServerEnv = PublicEnv & z.infer<typeof serverSchema>;

/** Server-only env (includes the Supabase secret key). Never import from client code. */
export function serverEnv(): ServerEnv {
  const result = serverSchema.safeParse({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  if (!result.success) throw new Error(formatEnvError(result.error));
  return { ...publicEnv, ...result.data };
}

const aiWorkerTokenSchema = z.string().min(32);

/**
 * The AI worker routes' bearer token (optional, at least 32 characters). Returns null when it is
 * unset, or when it is too short (logged, never printed): either way the worker routes are off.
 * Read per call, not cached, so a missing token is never baked in.
 */
export function aiWorkerToken(): string | null {
  const raw = process.env.AI_WORKER_TOKEN;
  if (!raw) return null;
  if (!aiWorkerTokenSchema.safeParse(raw).success) {
    console.error('[env] AI_WORKER_TOKEN is shorter than 32 characters; the AI worker routes are off.');
    return null;
  }
  return raw;
}
