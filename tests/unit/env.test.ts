import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from '@/lib/env-schema';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
};

describe('parsePublicEnv', () => {
  it('throws, naming NEXT_PUBLIC_SUPABASE_URL, when the URL is missing', () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omit, ...rest } = valid;
    void _omit;
    expect(() => parsePublicEnv(rest)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('throws when the URL is not a URL', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it('throws when the publishable key is empty', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('parses a valid set', () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });
});
