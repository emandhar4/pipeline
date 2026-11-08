import { describe, expect, it } from 'vitest';
import { RESUME_MESSAGES, UPLOAD_FAILED, withoutSkip } from '@/lib/resume/messages';

describe('withoutSkip', () => {
  it('drops the "skip this step" advice, which means nothing outside onboarding', () => {
    expect(withoutSkip(RESUME_MESSAGES.not_pdf)).toBe("That file isn't a PDF. Upload a PDF.");
    expect(withoutSkip(UPLOAD_FAILED)).toBe('Upload failed. Try again in a minute.');
    expect(withoutSkip(RESUME_MESSAGES.no_text)).toBe(
      "We couldn't find any text in that PDF (it may be a scanned image). Fill in your answers by hand.",
    );
    for (const m of [...Object.values(RESUME_MESSAGES), UPLOAD_FAILED]) {
      expect(withoutSkip(m)).not.toMatch(/skip/i);
    }
  });

  it('leaves other text alone', () => {
    expect(withoutSkip('Something else.')).toBe('Something else.');
  });
});
