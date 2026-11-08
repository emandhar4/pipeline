export const RESUME_BUCKET = 'resumes';
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

const UUID_PATH = /^[0-9a-f-]{36}\.pdf$/;

/** Storage path for a resume: one folder per user, so RLS can key on the folder. */
export function newResumePath(userId: string, id: string): string {
  return `${userId}/${id}.pdf`;
}

/** True only for exactly `<userId>/<36-char uuid>.pdf`. */
export function isOwnResumePath(userId: string, path: string): boolean {
  const prefix = `${userId}/`;
  return path.startsWith(prefix) && UUID_PATH.test(path.slice(prefix.length));
}
