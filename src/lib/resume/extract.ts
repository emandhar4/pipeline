import 'server-only';
import { extractText, getDocumentProxy } from 'unpdf';
import { RESUME_MAX_BYTES } from './paths';

export type ExtractResult =
  | { ok: true; text: string; pages: number }
  | { ok: false; reason: 'too_big' | 'not_pdf' | 'too_many_pages' | 'unreadable' | 'no_text' };

const MAX_PAGES = 10;
const MIN_CHARS = 50;
const MAX_TEXT = 50_000;
const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Text of an uploaded PDF, or why it cannot be read. Never throws for a bad file. */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  if (bytes.byteLength > RESUME_MAX_BYTES) return { ok: false, reason: 'too_big' };
  if (!MAGIC.every((b, i) => bytes[i] === b)) return { ok: false, reason: 'not_pdf' };

  let pdf;
  try {
    // PDF.js may transfer (detach) the buffer it is given, so hand it a copy.
    pdf = await getDocumentProxy(bytes.slice());
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  try {
    const pages = pdf.numPages;
    if (pages > MAX_PAGES) return { ok: false, reason: 'too_many_pages' };
    let text: string;
    try {
      ({ text } = await extractText(pdf, { mergePages: true }));
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    if (text.replace(/\s/g, '').length < MIN_CHARS) return { ok: false, reason: 'no_text' };
    return { ok: true, text: text.slice(0, MAX_TEXT), pages };
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
