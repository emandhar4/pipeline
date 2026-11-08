'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { INVITE_ONLY_MESSAGE, isInviteRejection } from '@/lib/auth-errors';
import { publicEnv } from '@/lib/env';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';

export type EmailLinkState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

function callbackUrl(next: string): string {
  const url = new URL('/auth/callback', publicEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set('next', next);
  return url.toString();
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(formData.get('next')?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(next) },
  });
  if (error || !data.url) {
    console.error('[login] signInWithOAuth failed', { code: error?.code, message: error?.message });
    redirect(`/login?error=oauth&next=${encodeURIComponent(next)}`);
  }
  redirect(data.url);
}

const emailSchema = z.email().max(320);

export async function sendEmailLink(
  _prev: EmailLinkState,
  formData: FormData,
): Promise<EmailLinkState> {
  const next = safeNext(formData.get('next')?.toString());
  const parsed = emailSchema.safeParse(formData.get('email')?.toString().trim().toLowerCase());
  if (!parsed.success) return { status: 'error', message: 'Enter a valid email address.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    // The before_user_created hook still rejects emails that are not invited.
    options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(next) },
  });
  if (error) {
    console.error('[login] signInWithOtp failed', { code: error.code, message: error.message });
    if (isInviteRejection(error.message)) return { status: 'error', message: INVITE_ONLY_MESSAGE };
    return { status: 'error', message: 'Could not send the link. Try again in a minute.' };
  }
  return { status: 'sent', email: parsed.data };
}
