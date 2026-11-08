import { describe, expect, it } from 'vitest';
import {
  RESUME_BUCKET,
  RESUME_MAX_BYTES,
  isOwnResumePath,
  newResumePath,
} from '@/lib/resume/paths';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

describe('resume paths', () => {
  it('exposes bucket and size limit', () => {
    expect(RESUME_BUCKET).toBe('resumes');
    expect(RESUME_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it('builds <user>/<id>.pdf', () => {
    expect(newResumePath(USER, ID)).toBe(`${USER}/${ID}.pdf`);
  });

  it('accepts its own uuid path', () => {
    expect(isOwnResumePath(USER, newResumePath(USER, ID))).toBe(true);
  });

  it('rejects traversal, other users, bad suffixes and nesting', () => {
    expect(isOwnResumePath(USER, `${USER}/../${OTHER}/${ID}.pdf`)).toBe(false);
    expect(isOwnResumePath(USER, `../${USER}/${ID}.pdf`)).toBe(false);
    expect(isOwnResumePath(USER, `${OTHER}/${ID}.pdf`)).toBe(false);
    expect(isOwnResumePath(USER, `${USER}/${ID}.PDF.exe`)).toBe(false);
    expect(isOwnResumePath(USER, `${USER}/${ID}.pdf.exe`)).toBe(false);
    expect(isOwnResumePath(USER, `${USER}/sub/${ID}.pdf`)).toBe(false);
    expect(isOwnResumePath(USER, `${USER}/${ID}.pdf\n`)).toBe(false);
  });
});
