'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const input = z.object({
  matchId: z.uuid(),
  // 'applied' is set by the applications flow, never from the panel.
  state: z.enum(['saved', 'new', 'hidden']),
});

export type MatchStateResult = { ok: boolean };

export async function setMatchState(matchId: string, state: string): Promise<MatchStateResult> {
  const { id } = await getCurrentUser();
  const parsed = input.safeParse({ matchId, state });
  if (!parsed.success) return { ok: false };
  const client = await createClient();
  const { error } = await client
    .from('posting_matches')
    .update({ state: parsed.data.state })
    .eq('id', parsed.data.matchId)
    .eq('user_id', id)
    // An applied match keeps its state; Save and Hide never overwrite it.
    .neq('state', 'applied');
  if (error) return { ok: false };
  revalidatePath('/dashboard');
  return { ok: true };
}
