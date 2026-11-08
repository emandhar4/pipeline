import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function formatEnvError(error: z.ZodError): string {
  const names = error.issues.map((issue) => issue.path.join('.')).join(', ');
  return `Invalid or missing environment variables: ${names}`;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) throw new Error(formatEnvError(result.error));
  return result.data;
}
