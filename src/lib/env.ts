import { parsePublicEnv, type PublicEnv } from './env-schema';

export { parsePublicEnv, formatEnvError, type PublicEnv } from './env-schema';

// Parsed eagerly so a misconfigured deploy fails fast.
// Each NEXT_PUBLIC_* var is referenced literally so Next.js inlines it into
// the browser bundle. Never add a non-public var here.
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
