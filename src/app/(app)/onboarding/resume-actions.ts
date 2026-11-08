'use server';

import { getCurrentUser } from '@/lib/auth';
import { loadCategoryOrder, processResume, UPLOAD_FAILED, type ProcessResult } from '@/lib/resume/process';
import { createClient } from '@/lib/supabase/server';

/** Reads a resume the user just uploaded to their own folder and returns prefill suggestions. */
export async function readResume(path: string): Promise<ProcessResult> {
  const { id } = await getCurrentUser();
  if (typeof path !== 'string') return { ok: false, message: UPLOAD_FAILED };
  try {
    const client = await createClient();
    const order = await loadCategoryOrder(client);
    return await processResume(client, id, path, new Date(), order);
  } catch (e) {
    console.error('[onboarding] readResume failed', { message: (e as Error).message });
    return { ok: false, message: UPLOAD_FAILED };
  }
}
