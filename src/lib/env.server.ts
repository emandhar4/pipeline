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
