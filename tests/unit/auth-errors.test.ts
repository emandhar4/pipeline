import { describe, expect, it } from 'vitest';
import { INVITE_ONLY_MESSAGE, isInviteRejection, LOGIN_ERRORS } from '@/lib/auth-errors';

describe('auth errors', () => {
  it('recognises the before_user_created hook rejection', () => {
    expect(isInviteRejection('Pipeline is invite-only. Ask for an invite.')).toBe(true);
    expect(isInviteRejection('Email rate limit exceeded')).toBe(false);
    expect(isInviteRejection(null)).toBe(false);
  });

  it('shows the exact invite-only copy', () => {
    expect(INVITE_ONLY_MESSAGE).toBe('Pipeline is invite-only. Ask for an invite.');
    expect(LOGIN_ERRORS['invite-only']).toBe(INVITE_ONLY_MESSAGE);
  });
});
