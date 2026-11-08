import 'server-only';
import { extractPdfText, type ExtractResult } from './extract';
import { RESUME_MESSAGES, UPLOAD_FAILED } from './messages';
import { isOwnResumePath, RESUME_BUCKET } from './paths';
import { resumeReader, type Client } from './reader';
import type { ResumeSuggestions } from './types';

export type ProcessResult = { ok: true; suggestions: ResumeSuggestions } | { ok: false; message: string };

export { UPLOAD_FAILED };

const MESSAGES: Record<Extract<ExtractResult, { ok: false }>['reason'], string> = RESUME_MESSAGES;

/** Slugs of `field_categories` in display order. Throws on a database error. */
export async function loadCategoryOrder(client: Client): Promise<string[]> {
  const { data, error } = await client.from('field_categories').select('slug').order('sort');
  if (error) throw new Error(`read field_categories failed: ${error.message}`);
  return data.map((c) => c.slug);
}

/** Best effort: removes an unreadable upload. Never changes the user-facing result. */
async function discardUpload(client: Client, path: string): Promise<void> {
  try {
    const { error } = await client.storage.from(RESUME_BUCKET).remove([path]);
    if (error) console.error(`resume cleanup failed: ${error.message}`);
  } catch (err) {
    console.error(`resume cleanup failed: ${String(err)}`);
  }
}

/**
 * Reads the user's uploaded resume and stores the suggestions in a new `resumes` row.
 * Uses only the caller's RLS client. Never writes profiles, profile_fields or
 * profile_industries: suggestions only prefill the form. Throws on a database error.
 */
export async function processResume(
  client: Client,
  userId: string,
  path: string,
  today: Date = new Date(),
  categoryOrder?: string[],
): Promise<ProcessResult> {
  if (!isOwnResumePath(userId, path)) return { ok: false, message: UPLOAD_FAILED };

  const download = await client.storage.from(RESUME_BUCKET).download(path);
  if (download.error) {
    await discardUpload(client, path);
    return { ok: false, message: UPLOAD_FAILED };
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer());

  const extracted = await extractPdfText(bytes);
  if (!extracted.ok) {
    await discardUpload(client, path);
    return { ok: false, message: MESSAGES[extracted.reason] };
  }

  const order = categoryOrder ?? (await loadCategoryOrder(client));
  const suggestions = await resumeReader(extracted.text, { client, today, categoryOrder: order });

  const { error } = await client
    .from('resumes')
    .insert({ kind: 'uploaded', storage_path: path, suggestions });
  if (error) throw new Error(`insert resumes failed: ${error.message}`);
  return { ok: true, suggestions };
}
