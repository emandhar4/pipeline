import { describe, expect, it } from 'vitest';
import { claimSchema, completeSchema } from '@/lib/ai/types';

const ID = '00000000-0000-4000-8000-000000000001';

describe('completeSchema', () => {
  it('accepts a score from 1 to 10 with a reason', () => {
    expect(completeSchema.safeParse({ id: ID, score: 1, reason: 'Close to the fields.' }).success).toBe(true);
    expect(completeSchema.safeParse({ id: ID, score: 10, reason: 'x' }).success).toBe(true);
  });

  it('refuses a score of 0 or 11, or a fraction', () => {
    expect(completeSchema.safeParse({ id: ID, score: 0, reason: 'x' }).success).toBe(false);
    expect(completeSchema.safeParse({ id: ID, score: 11, reason: 'x' }).success).toBe(false);
    expect(completeSchema.safeParse({ id: ID, score: 7.5, reason: 'x' }).success).toBe(false);
  });

  it('refuses a reason over 200 characters or an empty one', () => {
    expect(completeSchema.safeParse({ id: ID, score: 5, reason: 'a'.repeat(200) }).success).toBe(true);
    expect(completeSchema.safeParse({ id: ID, score: 5, reason: 'a'.repeat(201) }).success).toBe(false);
    expect(completeSchema.safeParse({ id: ID, score: 5, reason: '  ' }).success).toBe(false);
  });

  it('refuses extra keys', () => {
    expect(completeSchema.safeParse({ id: ID, score: 5, reason: 'x', user_id: ID }).success).toBe(false);
    expect(completeSchema.safeParse({ id: ID, error: 'x', extra: 1 }).success).toBe(false);
  });

  it('accepts an error up to 500 characters instead of a score', () => {
    expect(completeSchema.safeParse({ id: ID, error: 'Page would not load.' }).success).toBe(true);
    expect(completeSchema.safeParse({ id: ID, error: 'e'.repeat(501) }).success).toBe(false);
    expect(completeSchema.safeParse({ id: ID, score: 5, reason: 'x', error: 'y' }).success).toBe(false);
  });

  it('refuses a missing or malformed id', () => {
    expect(completeSchema.safeParse({ score: 5, reason: 'x' }).success).toBe(false);
    expect(completeSchema.safeParse({ id: 'nope', score: 5, reason: 'x' }).success).toBe(false);
  });
});

describe('claimSchema', () => {
  it('caps the limit at 10', () => {
    expect(claimSchema.parse({ limit: 50 })).toEqual({ limit: 10 });
    expect(claimSchema.parse({ limit: 3 })).toEqual({ limit: 3 });
  });

  it('defaults to 10 and refuses bad limits and extra keys', () => {
    expect(claimSchema.parse({})).toEqual({ limit: 10 });
    expect(claimSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(claimSchema.safeParse({ limit: 2.5 }).success).toBe(false);
    expect(claimSchema.safeParse({ limit: '3' }).success).toBe(false);
    expect(claimSchema.safeParse({ limit: 3, worker: 'x' }).success).toBe(false);
  });
});
