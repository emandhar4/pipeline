import 'server-only';
import { extractPdfText, type ExtractResult } from './extract';
import { isOwnResumePath, RESUME_BUCKET } from './paths';
import { resumeReader, type Client } from './reader';
import type { ResumeSuggestions } from './types';

export type ProcessResult = { ok: true; suggestions: ResumeSuggestions } | { ok: false; message: string };

export const UPLOAD_FAILED = 'Upload failed. Try again in a minute, or skip this step.';

const MESSAGES: Record<Extract<ExtractResult, { ok: false }>['reason'], string> = {
  too_big: 'That file is over 5 MB. Upload a smaller PDF, or skip this step.',
  not_pdf: "That file isn't a PDF. Upload a PDF, or skip this step.",
  too_many_pages: 'That PDF is over 10 pages. Upload just your resume, or skip this step.',
  unreadable:
    "We couldn't open that PDF. It may be password-protected. Try another file, or skip this step.",
  no_text:
    "We couldn't find any text in that PDF (it may be a scanned image). Skip this step and fill in your answers by hand.",
};

/** Slugs of `field_categories` in display order. Throws on a database error. */
export async function loadCategoryOrder(client: Client): Promise<string[]> {
  const { data, error } = await client.from('field_categories').select('slug').order('sort');
  if (error) throw new Error(`read field_categories failed: ${error.message}`);
  return data.map((c) => c.slug);
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
  if (download.error) return { ok: false, message: UPLOAD_FAILED };
  const bytes = new Uint8Array(await download.data.arrayBuffer());

  const extracted = await extractPdfText(bytes);
  if (!extracted.ok) return { ok: false, message: MESSAGES[extracted.reason] };

  const order = categoryOrder ?? (await loadCategoryOrder(client));
  const suggestions = await resumeReader(extracted.text, { client, today, categoryOrder: order });

  const { error } = await client
    .from('resumes')
    .insert({ kind: 'uploaded', storage_path: path, suggestions });
  if (error) throw new Error(`insert resumes failed: ${error.message}`);
  return { ok: true, suggestions };
}
