export const INVITE_ONLY_MESSAGE = 'Pipeline is invite-only. Ask for an invite.';

/** Error codes the login page understands. Never reflect raw query text into the UI. */
export const LOGIN_ERRORS = {
  'invite-only': INVITE_ONLY_MESSAGE,
  link: 'That sign-in link is invalid or has expired. Request a new one.',
  oauth: 'Sign-in with Google did not complete. Try again.',
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function isInviteRejection(message: string | null | undefined): boolean {
  return Boolean(message && /invite-only/i.test(message));
}
