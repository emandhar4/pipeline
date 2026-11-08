import { describe, expect, it, vi } from 'vitest';
import { RESUME_MAX_BYTES } from '@/lib/resume/paths';
import { FICTIONAL_RESUME_LINES, makeResumePdf } from '../fixtures/resume-pdf';

vi.mock('server-only', () => ({}));
const { extractPdfText } = await import('@/lib/resume/extract');

describe('extractPdfText', () => {
  it('reads the fixture PDF', async () => {
    const result = await extractPdfText(await makeResumePdf(FICTIONAL_RESUME_LINES));
    expect(result).toMatchObject({ ok: true, pages: 1 });
    if (result.ok) expect(result.text).toContain('Industrial Engineering');
  });
  it('rejects bytes that are not a PDF', async () => {
    expect(await extractPdfText(new TextEncoder().encode('hello'))).toEqual({ ok: false, reason: 'not_pdf' });
  });
  it('reports a PDF with no text', async () => {
    const pdf = await makeResumePdf(FICTIONAL_RESUME_LINES, { blank: true });
    expect(await extractPdfText(pdf)).toEqual({ ok: false, reason: 'no_text' });
  });
  it('rejects more than 10 pages', async () => {
    const pdf = await makeResumePdf(FICTIONAL_RESUME_LINES, { pages: 11 });
    expect(await extractPdfText(pdf)).toEqual({ ok: false, reason: 'too_many_pages' });
  });
  it('reports a PDF that cannot be opened', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\nthis is not really a pdf at all \u0000\u0001');
    expect(await extractPdfText(bytes)).toEqual({ ok: false, reason: 'unreadable' });
  });
  it('rejects files over the size cap', async () => {
    expect(await extractPdfText(new Uint8Array(RESUME_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_big',
    });
  });
});
